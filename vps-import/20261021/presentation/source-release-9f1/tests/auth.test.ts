import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/app.js";
import { Repository } from "../server/repository.js";
import { profileDisplayName } from "../server/profile.js";
import { oidcSettings } from "../server/auth-config.js";
import { authFailureReason } from "../server/auth-diagnostics.js";
import type { Config } from "../server/config.js";

const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const wrongPair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const baseConfig = (root: string): Config => ({ root, production: false, host: "127.0.0.1", port: 4310,
  origin: "http://127.0.0.1:4310", model: "gpt-6-luna", render: false, soffice: "soffice", pdftoppm: "pdftoppm" });
async function fixture(confidential = false) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "verbatim-auth-"));
  const codes = new Map<string, { nonce: string; challenge: string; sub: string; bad?: string }>();
  let issuer = "";
  const profiles = new Map<string, Record<string, unknown>>();
  const userInfos = new Map<string, Record<string, unknown>>();
  const server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/realms/test/.well-known/openid-configuration") {
      res.end(JSON.stringify({ issuer, authorization_endpoint: issuer + "/authorize", token_endpoint: issuer + "/token",
        jwks_uri: issuer + "/jwks", userinfo_endpoint: issuer + "/userinfo", response_types_supported: ["code"], subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"], token_endpoint_auth_methods_supported: [confidential ? "client_secret_post" : "none"],
        code_challenge_methods_supported: ["S256"] })); return;
    }
    if (req.url === "/realms/test/jwks") {
      res.end(JSON.stringify({ keys: [{ ...pair.publicKey.export({ format: "jwk" }), kid: "test", alg: "RS256", use: "sig" }] })); return;
    }
    if (req.url === "/realms/test/userinfo") {
      const info = userInfos.get((req.headers.authorization || "").replace(/^Bearer /, ""));
      if (!info) { res.statusCode = 503; res.end("{}"); return; }
      res.end(JSON.stringify(info)); return;
    }
    if (req.url === "/realms/test/token") {
      let body = ""; for await (const chunk of req) body += chunk;
      const params = new URLSearchParams(body), entry = codes.get(params.get("code") || "");
      if (params.get("client_id") !== "presentation-local" ||
          (confidential && params.get("client_secret") !== "fixture-client-secret")) {
        res.statusCode = 401; res.end(JSON.stringify({ error: "invalid_client" })); return;
      }
      if (!entry || createHash("sha256").update(params.get("code_verifier") || "").digest("base64url") !== entry.challenge) {
        res.statusCode = 400; res.end(JSON.stringify({ error: "invalid_grant" })); return;
      }
      codes.delete(params.get("code")!);
      const now = Math.floor(Date.now() / 1000);
      const claims = { iss: entry.bad === "issuer" ? issuer + "/wrong" : issuer,
        sub: entry.sub, aud: entry.bad === "audience" ? "another-client" : "presentation-local",
        exp: entry.bad === "expired" ? now - 120 : now + 600, iat: now,
        nonce: entry.bad === "nonce" ? "wrong" : entry.nonce,
        email: "same-email@example.test", email_verified: true, ...profiles.get(entry.sub) };
      const unsigned = Buffer.from(JSON.stringify({ alg: "RS256", kid: "test" })).toString("base64url") + "." +
        Buffer.from(JSON.stringify(claims)).toString("base64url");
      const signature = sign("RSA-SHA256", Buffer.from(unsigned), entry.bad === "signature" ? wrongPair.privateKey : pair.privateKey);
      const accessToken = "access-" + entry.sub;
      if (entry.sub === "userinfo-profile") userInfos.set(accessToken, { sub: entry.sub, name: "UserInfo Example" });
      if (entry.sub === "mismatched-userinfo") userInfos.set(accessToken, { sub: "other-subject", name: "Wrong Profile" });
      res.end(JSON.stringify({ access_token: accessToken, token_type: "Bearer", expires_in: 600,
        id_token: unsigned + "." + signature.toString("base64url") })); return;
    }
    res.statusCode = 404; res.end("{}");
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("TEST_SERVER");
  issuer = `http://127.0.0.1:${address.port}/realms/test`;
  const cfg: Config = { ...baseConfig(root), oidc: { issuer, clientId: "presentation-local", allowLocalIssuer: true },
    usageLimits: { generations: 2, ai: 1 } };
  if (confidential) cfg.oidc!.clientSecret = "fixture-client-secret";
  let instance = await createApp(cfg);
  async function login(sub: string, bad?: string, returnTo?: string) {
    const response = await instance.app.inject({ url: "/api/auth/login" + (returnTo ? "?returnTo=" + encodeURIComponent(returnTo) : ""), headers: { host: new URL(cfg.origin!).host } });
    assert.equal(response.statusCode, 302, response.body);
    const url = new URL(response.headers.location!);
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    assert.equal(url.searchParams.get("ui_locales"), "en");
    assert.equal(url.searchParams.get("redirect_uri"), cfg.origin + "/api/auth/callback");
    const code = "code-" + codes.size + "-" + Math.random();
    codes.set(code, { nonce: url.searchParams.get("nonce")!, challenge: url.searchParams.get("code_challenge")!, sub, bad });
    const cookies = response.cookies.map(c => c.name + "=" + c.value).join("; ");
    const callbackUrl = "/api/auth/callback?code=" + code + "&state=" + url.searchParams.get("state");
    const callback = await instance.app.inject({ url: callbackUrl, headers: { cookie: cookies } });
    return { callback, callbackUrl, flowCookie: cookies,
      cookie: callback.cookies.filter(c => c.name === "vb_oidc_session").map(c => c.name + "=" + c.value).join("; ") };
  }
  return { cfg, root, login, setProfile: (subject: string, profile: Record<string, unknown>) => profiles.set(subject, profile), get instance() { return instance; },
    restart: async () => { await instance.app.close(); instance = await createApp(cfg); },
    close: async () => { await instance.app.close(); await new Promise<void>(resolve => server.close(() => resolve())); await fs.rm(root, { recursive: true, force: true }); } };
}

test("OIDC login uses PKCE, opaque sessions, CSRF and owner isolation; survives app restart", async () => {
  const f = await fixture();
  try {
    const app = f.instance.app;
    for (const url of ["/app", "/app/how-to", "/app?new=1", "/app?new=1&author=1", "/app/editor"]) {
      const redirect = await app.inject(url);
      assert.equal(redirect.statusCode, 302);
      const destination = new URL(redirect.headers.location!, f.cfg.origin!);
      assert.equal(destination.pathname, "/api/auth/login");
      if (url.includes("?") || url === "/app/how-to") assert.equal(destination.searchParams.get("returnTo"), url);
      assert.ok(!redirect.body.includes("Sign in to your presentation workspace"));
    }
    assert.equal((await app.inject("/api/session")).json().authentication, "oidc");
    assert.equal((await app.inject("/api/session")).json().user, null);
    for (const url of ["/api/projects", "/api/capabilities", "/api/usage", "/api/generations/forged"])
      assert.equal((await app.inject({ url, headers: { "x-user-id": "forged", cookie: "vb_oidc_session=forged" } })).statusCode, 401);
    assert.equal((await app.inject({ method: "POST", url: "/api/projects/forged/generate", payload: {} })).statusCode, 401);
    const alice = await f.login("alice");
    assert.equal(alice.callback.statusCode, 302, alice.callback.body);
    assert.equal(alice.callback.headers.location, "/app");
    assert.match(alice.callback.headers["set-cookie"]!.toString(), /HttpOnly/);
    assert.match(alice.callback.headers["set-cookie"]!.toString(), /SameSite=Lax/);
    const session = (await app.inject({ url: "/api/session", headers: { cookie: alice.cookie } })).json();
    assert.match(session.csrfToken, /^[a-f0-9]{64}$/);
    const headers = { cookie: alice.cookie, origin: f.cfg.origin!, "x-csrf-token": session.csrfToken };
    assert.notEqual((await app.inject({ url: "/app", headers })).statusCode, 302);
    const payload = { name: "Private", source: "Private original source.", mode: "literal" };
    assert.equal((await app.inject({ method: "POST", url: "/api/projects", payload, headers: { cookie: alice.cookie } })).statusCode, 403);
    assert.equal((await app.inject({ method: "POST", url: "/api/projects", payload, headers: { cookie: alice.cookie, origin: f.cfg.origin! } })).statusCode, 403);
    const project = (await app.inject({ method: "POST", url: "/api/projects", payload, headers })).json().project;
    assert.ok(project.id);
    const bob = await f.login("bob"); assert.equal(bob.callback.statusCode, 302);
    assert.equal((await app.inject({ url: "/api/projects/" + project.id, headers: { cookie: bob.cookie } })).statusCode, 404);
    assert.equal((await app.inject({ url: "/api/projects", headers: { cookie: bob.cookie } })).json().projects.length, 0);
    const replay = await app.inject({ url: alice.callbackUrl, headers: { cookie: alice.flowCookie } });
    assert.equal(replay.statusCode, 400);
    assert.equal(replay.json().reason, "FLOW_EXPIRED_OR_USED");
    await f.restart();
    assert.equal((await f.instance.app.inject({ url: "/api/projects/" + project.id, headers: { cookie: alice.cookie } })).statusCode, 200);
    assert.equal((await f.instance.app.inject({ method: "POST", url: "/api/auth/logout", headers, payload: {} })).statusCode, 200);
    assert.equal((await f.instance.app.inject({ url: "/api/projects", headers: { cookie: alice.cookie } })).statusCode, 401);
    assert.equal(await f.instance.repo.userCount(), 2); // Same email never merges accounts.
  } finally { await f.close(); }
});

test("Signed-in account generates a verified PPTX; another account cannot fetch the export", async () => {
  const f = await fixture();
  try {
    const { app } = f.instance;
    const alice = await f.login("export-owner");
    const session = (await app.inject({ url: "/api/session", headers: { cookie: alice.cookie } })).json();
    const headers = { cookie: alice.cookie, origin: f.cfg.origin!, "x-csrf-token": session.csrfToken };
    const created = await app.inject({ method: "POST", url: "/api/projects", headers,
      payload: { name: "Account export", source: "# Exact heading\nOriginal account document.", mode: "markdown" } });
    assert.equal(created.statusCode, 200);
    const result = await app.inject({ method: "POST", url: `/api/projects/${created.json().project.id}/generate`, headers,
      payload: { settings: { theme: "ivory", mode: "markdown", useAI: false, images: false } } });
    assert.equal(result.statusCode, 202);
    const id = result.json().generation.id;
    let job;
    for (let i = 0; i < 200; i++) {
      job = (await app.inject({ url: "/api/generations/" + id, headers })).json().generation;
      if (["ready", "failed"].includes(job.status)) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(job.status, "ready"); assert.equal(job.report.exportVerified, true);
    assert.equal(job.artifactId, undefined);
    assert.equal((await app.inject({ url: `/api/generations/${id}/export`, headers })).statusCode, 200);
    const bob = await f.login("another-export-account");
    for (const suffix of ["", "/export", "/validation", "/preview/0"])
      assert.equal((await app.inject({ url: `/api/generations/${id}${suffix}`, headers: { cookie: bob.cookie } })).statusCode, 404);
    assert.equal((await app.inject({ url: "/api/usage", headers })).json().usage.generations, 1);
  } finally { await f.close(); }
});

test("OIDC rejects signed tokens with wrong nonce/issuer/audience/expiry and forged signatures", async () => {
  const f = await fixture();
  try {
    for (const bad of ["nonce", "issuer", "audience", "expired", "signature"]) {
      const result = await f.login("untrusted", bad);
      assert.equal(result.callback.statusCode, 400, bad);
      assert.equal(result.callback.json().error, "SIGN_IN_FAILED", bad);
      assert.equal(result.cookie, "", bad);
      assert.ok(!result.callback.body.includes("not-retained"));
    }
    assert.equal(await f.instance.repo.userCount(), 0);
  } finally { await f.close(); }
});

test("Confidential OIDC client exchanges the code using the server-held secret", async () => {
  const f = await fixture(true);
  try {
    const login = await f.login("confidential-user");
    assert.equal(login.callback.statusCode, 302, login.callback.body);
    const session = await f.instance.app.inject({ url: "/api/session", headers: { cookie: login.cookie } });
    assert.ok(session.json().user.id);
    assert.ok(!session.body.includes("fixture-client-secret"));
    assert.ok(!login.callback.headers.location!.includes("fixture-client-secret"));
  } finally { await f.close(); }
});

test("Direct login retains the selected creation mode and rejects external return destinations", async () => {
  const f = await fixture();
  try {
    for (const returnTo of ["/app/how-to", "/app?new=1", "/app?new=1&author=1"]) {
      const result = await f.login("creator", undefined, returnTo);
      assert.equal(result.callback.statusCode, 302);
      assert.equal(result.callback.headers.location, returnTo);
    }
    for (const returnTo of ["https://attacker.example", "//attacker.example", "/api/auth/login"]) {
      const result = await f.login("creator", undefined, returnTo);
      assert.equal(result.callback.statusCode, 302);
      assert.equal(result.callback.headers.location, "/app");
    }
  } finally { await f.close(); }
});

test("OIDC callback rejects missing browser binding and tampered state", async () => {
  const f = await fixture();
  try {
    const missing = await f.instance.app.inject("/api/auth/callback?code=forged&state=forged");
    assert.equal(missing.statusCode, 400);
    assert.equal(missing.json().reason, "FLOW_COOKIE_MISSING");
    assert.equal(missing.json().retry, "/api/auth/login");
    const login = await f.instance.app.inject({ url: "/api/auth/login", headers: { host: new URL(f.cfg.origin!).host } });
    const cookie = login.cookies.map(c => c.name + "=" + c.value).join("; ");
    const tampered = await f.instance.app.inject({ url: "/api/auth/callback?code=forged&state=wrong", headers: { cookie } });
    assert.equal(tampered.statusCode, 400);
    assert.equal(tampered.json().reason, "STATE_MISMATCH");
  } finally { await f.close(); }
});

test("OIDC login canonicalizes localhost before setting a browser-bound flow cookie", async () => {
  const f = await fixture();
  try {
    const alternate = await f.instance.app.inject({ url: "/api/auth/login?returnTo=" + encodeURIComponent("/app?new=1&author=1"), headers: { host: "localhost:4310" } });
    assert.equal(alternate.statusCode, 302);
    const destination = new URL(alternate.headers.location!);
    assert.equal(destination.origin, f.cfg.origin);
    assert.equal(destination.pathname, "/api/auth/login");
    assert.equal(destination.searchParams.get("returnTo"), "/app?new=1&author=1");
    assert.equal(alternate.cookies.length, 0, "Never bind a flow to the alternate hostname");
    assert.match(String(alternate.headers["cache-control"]), /no-store/);
    const canonical = await f.instance.app.inject({ url: destination.pathname + destination.search, headers: { host: destination.host } });
    assert.equal(new URL(canonical.headers.location!).origin, f.cfg.oidc!.issuer.split("/realms/")[0]);
    assert.ok(canonical.cookies.some(c => c.name === "vb_oidc_flow"));
    const injection = await f.instance.app.inject({ url: "/api/auth/login?returnTo=https://attacker.invalid", headers: { host: "localhost:4310" } });
    assert.equal(injection.headers.location, f.cfg.origin + "/api/auth/login");
  } finally { await f.close(); }
});

test("Auth diagnostics expose fixed reasons and correlation IDs without provider details or credentials", async () => {
  const f = await fixture(true), original = console.error, events: string[] = [];
  console.error = (value: unknown) => { events.push(String(value)); };
  try {
    f.cfg.oidc!.clientSecret = "wrong-secret-must-never-appear";
    const result = await f.login("untrusted");
    assert.equal(result.callback.statusCode, 400);
    assert.equal(result.callback.json().reason, "TOKEN_CLIENT_REJECTED");
    const event = JSON.parse(events.at(-1)!);
    assert.equal(event.event, "auth_failure");
    assert.equal(event.step, "grant");
    assert.equal(event.requestId, result.callback.json().requestId);
    assert.equal(result.cookie, "");
    assert.equal(await f.instance.repo.userCount(), 0);
    for (const canary of ["wrong-secret-must-never-appear", "fixture-client-secret", "invalid_client", "untrusted", "code-", "nonce", "state="])
      assert.ok(!JSON.stringify(events).includes(canary) && !result.callback.body.includes(canary), canary);
  } finally { console.error = original; await f.close(); }
  const privateValue = "PRIVATE_CALLBACK_TOKEN_BODY";
  const failures = [
    [{ message: privateValue, cause: { code: "ERR_SSL_DECRYPTION_FAILED_OR_BAD_RECORD_MAC", body: privateValue } }, "PROVIDER_TLS_ERROR"],
    [{ cause: { cause: { code: "ENOTFOUND" } } }, "PROVIDER_DNS_ERROR"],
    [{ code: "OAUTH_TIMEOUT" }, "PROVIDER_TIMEOUT"],
    [{ code: "OAUTH_JWT_TIMESTAMP_CHECK_FAILED", cause: { claims: privateValue } }, "TOKEN_TIME_INVALID"],
    [{ code: "OAUTH_JWT_CLAIM_COMPARISON_FAILED" }, "IDENTITY_CLAIM_MISMATCH"],
    [{ code: "OAUTH_RESPONSE_BODY_ERROR", error: "invalid_grant", error_description: privateValue }, "TOKEN_GRANT_REJECTED"],
    [{ code: privateValue, message: privateValue }, "AUTH_PROVIDER_ERROR"],
  ] as const;
  for (const [error, reason] of failures) assert.equal(authFailureReason(error, "grant"), reason);
  assert.equal(authFailureReason(new Error(privateValue), "session"), "SESSION_STORAGE_FAILED");
  assert.equal(authFailureReason(new Error(privateValue), "account"), "ACCOUNT_STORAGE_FAILED");
});

test("OIDC does not claim legacy projects; expired sessions are denied", async () => {
  const f = await fixture();
  try {
    const legacy = await f.instance.repo.workspaceOwner();
    const login = await f.login("new-user");
    const session = (await f.instance.app.inject({ url: "/api/session", headers: { cookie: login.cookie } })).json();
    assert.notEqual(session.user.id, legacy.id);
    const token = "a".repeat(43);
    await f.instance.repo.createAuthSession(createHash("sha256").update(token).digest("hex"), session.user.id, Date.now() - 1);
    assert.equal((await f.instance.app.inject({ url: "/api/projects", headers: { cookie: "vb_oidc_session=" + token } })).statusCode, 401);
  } finally { await f.close(); }
});

test("Usage reservation is atomic across two repositories and cannot be reset by deleting projects", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "verbatim-budget-"));
  const a = new Repository(root), b = new Repository(root); await a.init(); await b.init();
  try {
    const results = await Promise.all(Array.from({ length: 24 }, (_, i) => (i % 2 ? a : b).reserveUsage("owner", "ai", 5)));
    assert.equal(results.filter(Boolean).length, 5);
    assert.equal((await a.dailyUsage("owner")).ai, 5);
    assert.equal(await b.reserveUsage("another-owner", "ai", 5), true);
    await a.deleteProject("missing-project", "owner");
    assert.equal(await b.reserveUsage("owner", "ai", 5), false);
  } finally { await a.close(); await b.close(); await fs.rm(root, { recursive: true, force: true }); }
});

test("A fresh OIDC account is never selected as the shared local workspace owner", async () => {
  const f = await fixture();
  try {
    const login = await f.login("first-account");
    const session = (await f.instance.app.inject({ url: "/api/session", headers: { cookie: login.cookie } })).json();
    const local = await f.instance.repo.workspaceOwner();
    assert.notEqual(local.id, session.user.id);
    assert.equal(local.email, "workspace@local.invalid");
    assert.equal((await f.instance.repo.workspaceOwner()).id, local.id);
  } finally { await f.close(); }
});

test("OIDC configuration fails closed for missing settings and public/plaintext previews", async () => {
  assert.throws(() => oidcSettings({ AUTH_MODE: "typo" }), /AUTH_MODE/);
  assert.throws(() => oidcSettings({ AUTH_MODE: "oidc" }), /required/);
  for (const cfg of [
    { ...baseConfig("/tmp/not-created"), oidc: { issuer: "http://idp.example/realm", clientId: "x" } },
    { ...baseConfig("/tmp/not-created"), origin: undefined, oidc: { issuer: "https://idp.example/realm", clientId: "x" } },
    { ...baseConfig("/tmp/not-created"), origin: "https://presentation.notepreso.com", oidc: { issuer: "https://idp.example/realm", clientId: "x" } },
  ]) await assert.rejects(() => createApp(cfg));
});

test("Authenticated generation and AI endpoints enforce account budgets before queuing/provider calls", async () => {
  const f = await fixture();
  const originalFetch = globalThis.fetch;
  try {
    const login = await f.login("budget-user");
    const app = f.instance.app;
    const session = (await app.inject({ url: "/api/session", headers: { cookie: login.cookie } })).json();
    const headers = { cookie: login.cookie, origin: f.cfg.origin!, "x-csrf-token": session.csrfToken };
    f.instance.runner.enqueue = async () => {};
    const projects: string[] = [];
    for (let i = 0; i < 3; i++) {
      const result = await app.inject({ method: "POST", url: "/api/projects", headers,
        payload: { name: "Budget test " + i, source: "Original test source.", mode: "literal" } });
      projects.push(result.json().project.id);
      const generated = await app.inject({ method: "POST", url: `/api/projects/${projects[i]}/generate`, headers,
        payload: { settings: { theme: "ivory", mode: "literal", useAI: false, images: false } } });
      if (i < 2) {
        assert.equal(generated.statusCode, 202, generated.body);
        const job = await f.instance.repo.job(generated.json().generation.id);
        await f.instance.repo.saveJob({ ...job!, status: "failed" });
      } else {
        assert.equal(generated.statusCode, 429);
        assert.equal(generated.json().error, "QUOTA_EXCEEDED");
      }
    }
    assert.equal((await app.inject({ url: "/api/usage", headers })).json().usage.generations, 2);
    await app.inject({ method: "DELETE", url: "/api/projects/" + projects[0], headers });
    assert.equal(await f.instance.repo.reserveUsage(session.user.id, "generations", 2), false);
    await f.instance.repo.reserveUsage(session.user.id, "ai", 1);
    f.cfg.key = "test-only-not-a-real-key";
    let providerCalls = 0;
    globalThis.fetch = (async () => { providerCalls++; throw new Error("UNEXPECTED_PROVIDER_CALL"); }) as typeof fetch;
    const blocked = await app.inject({ method: "POST", url: "/api/prompt-drafts", headers,
      payload: { topic: "A topic long enough for validation", audience: "Students", purpose: "training", language: "English", sections: 3 } });
    assert.equal(blocked.statusCode, 429);
    assert.equal(blocked.json().error, "QUOTA_EXCEEDED");
    assert.equal(providerCalls, 0);
  } finally { globalThis.fetch = originalFetch; await f.close(); }
});


test("Verified OIDC profile refresh adds and updates an existing account name without changing ownership", async () => {
  const f = await fixture();
  try {
    const legacy = await f.instance.repo.oidcUser(f.cfg.oidc!.issuer, "returning-profile");
    assert.equal(legacy.displayName, undefined);
    const now = new Date().toISOString();
    const projectId = "profile-owned-project";
    await f.instance.repo.saveProject({ id: projectId, ownerId: legacy.id, name: "Owned before profile sync",
      source: "Original account content", sourceHash: "profile-test", mode: "literal", createdAt: now, updatedAt: now, latestId: null });
    f.setProfile("returning-profile", { name: "Alice Example", preferred_username: "alice" });
    const login = await f.login("returning-profile");
    assert.equal(login.callback.statusCode, 302);
    const session = (await f.instance.app.inject({ url: "/api/session", headers: { cookie: login.cookie } })).json();
    assert.equal(session.user.name, "Alice Example");
    assert.equal(session.user.id, legacy.id);
    assert.equal((await f.instance.repo.userById(legacy.id))!.createdAt, legacy.createdAt);
    f.setProfile("returning-profile", { given_name: "Alice", family_name: "Renamed" });
    await f.login("returning-profile");
    const refreshed = (await f.instance.app.inject({ url: "/api/session", headers: { cookie: login.cookie } })).json();
    assert.equal(refreshed.user.name, "Alice Renamed");
    assert.equal(refreshed.user.id, legacy.id);
    assert.equal(await f.instance.repo.userCount(), 1);
    assert.equal((await f.instance.repo.getProject(projectId, legacy.id))!.source, "Original account content");
  } finally { await f.close(); }
});

test("Profile names use bounded display claims and never use an unverified email fallback", () => {
  assert.equal(profileDisplayName({ name: "  Alice\n Example  ", given_name: "Ignored" }), "Alice Example");
  assert.equal(profileDisplayName({ given_name: "Alice", family_name: "Example" }), "Alice Example");
  assert.equal(profileDisplayName({ preferred_username: "alice" }), "alice");
  assert.equal(profileDisplayName({ email: "alice@example.test", email_verified: false }), undefined);
  assert.equal(profileDisplayName({ email: "alice@example.test", email_verified: true }), "alice");
  assert.equal(Array.from(profileDisplayName({ name: "名".repeat(200) })!).length, 120);
  assert.ok(!profileDisplayName({ name: "Alice\u202eExample" })!.includes("\u202e"));
});


test("UserInfo supplies a missing full name only when its subject matches the verified login", async () => {
  const f = await fixture();
  try {
    for (const subject of ["userinfo-profile", "mismatched-userinfo"]) {
      f.setProfile(subject, { preferred_username: "trusted-username" });
      const login = await f.login(subject); assert.equal(login.callback.statusCode, 302);
      const session = (await f.instance.app.inject({ url: "/api/session", headers: { cookie: login.cookie } })).json();
      assert.equal(session.user.name, subject === "userinfo-profile" ? "UserInfo Example" : "trusted-username");
    }
  } finally { await f.close(); }
});
