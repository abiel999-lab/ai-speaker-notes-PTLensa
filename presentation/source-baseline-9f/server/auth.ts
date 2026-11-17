import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import * as oidc from "openid-client";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Config } from "./config.js";
import type { Repository, User } from "./repository.js";
import { profileDisplayName } from "./profile.js";
import { validateOidc } from "./auth-config.js";
import { authFailure, type AuthStep } from "./auth-diagnostics.js";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const secret = () => randomBytes(32).toString("base64url");
export const SESSION_COOKIE = "vb_oidc_session";
const FLOW_COOKIE = "vb_oidc_flow";
export function workspaceReturnPath(value: string | null) {
  return value === "/app/how-to" || value === "/app?new=1" || value === "/app?new=1&author=1" ? value : "/app";
}
export function csrfToken(token: string) { return digest("csrf:" + token); }
function equal(a: string, b: string) {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function cookie(req: FastifyRequest, name: string) {
  const values = (req.headers.cookie || "").split(";")
    .map(v => v.trim()).filter(v => v.startsWith(name + "="));
  if (values.length !== 1) return "";
  const value = values[0].slice(name.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : "";
}
export function sessionCsrf(req: FastifyRequest) {
  const token = cookie(req, SESSION_COOKIE);
  return token ? csrfToken(token) : undefined;
}
function setCookie(name: string, value: string, maxAge: number, origin: string) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}` +
    (origin.startsWith("https:") ? "; Secure" : "");
}
export interface AuthAdapter {
  user(req: FastifyRequest): Promise<User | null>;
  csrf(req: FastifyRequest): boolean;
}
export async function registerOidc(app: FastifyInstance, repo: Repository, cfg: Config): Promise<AuthAdapter | undefined> {
  const settings = cfg.oidc;
  if (!settings) return undefined;
  validateOidc(settings, cfg.origin);
  const origin = cfg.origin!;
  // Lazy discovery keeps local diagnostics available during an IdP outage.
  // Failed discovery is never cached; the next sign-in may retry.
  let discovery: Promise<oidc.Configuration> | undefined;
  const configuration = () => {
    if (!discovery) {
      discovery = oidc.discovery(new URL(settings.issuer), settings.clientId,
        settings.clientSecret, undefined, {
          timeout: 10,
          execute: [oidc.enableNonRepudiationChecks,
            ...(settings.allowLocalIssuer ? [oidc.allowInsecureRequests] : [])],
        }).catch(error => { discovery = undefined; throw new Error("OIDC_UNAVAILABLE", { cause: error }); });
    }
    return discovery;
  };
  const adapter: AuthAdapter = {
    user: req => {
      const token = cookie(req, SESSION_COOKIE);
      return token ? repo.sessionUser(digest(token)) : Promise.resolve(null);
    },
    csrf: req => {
      const token = cookie(req, SESSION_COOKIE);
      const provided = req.headers["x-csrf-token"];
      return !!token && typeof provided === "string" && equal(csrfToken(token), provided);
    },
  };
  app.get("/api/auth/login", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    // Cookies are bound to a hostname, not shared between localhost and
    // 127.0.0.1. Canonicalize BEFORE setting a flow cookie or visiting the IdP.
    if (req.headers.host?.toLowerCase() !== new URL(origin).host.toLowerCase()) {
      const target = new URL("/api/auth/login", origin);
      const returnTo = workspaceReturnPath(new URL(req.url, origin).searchParams.get("returnTo"));
      if (returnTo !== "/app") target.searchParams.set("returnTo", returnTo);
      return reply.redirect(target.href);
    }
    let step: AuthStep = "discovery";
    try {
      const conf = await configuration();
      const state = secret(), nonce = secret(), browser = secret();
      const verifier = oidc.randomPKCECodeVerifier();
      const returnTo = workspaceReturnPath(new URL(req.url, origin).searchParams.get("returnTo"));
      step = "flow";
      await repo.saveLoginFlow(digest(browser), { state, nonce, verifier, returnTo }, Date.now() + 600000);
      step = "discovery";
      const url = oidc.buildAuthorizationUrl(conf, {
        redirect_uri: origin + "/api/auth/callback", scope: "openid email profile", ui_locales: "en",
        state, nonce, code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
        code_challenge_method: "S256", response_mode: "query",
      });
      return reply.header("Set-Cookie", setCookie(FLOW_COOKIE, browser, 600, origin))
        .header("Cache-Control", "no-store").redirect(url.href);
    } catch (error) {
      return reply.code(503).send({ error: "OIDC_UNAVAILABLE", ...authFailure(error, step, req.id) });
    }
  });
  app.get("/api/auth/callback", async (req, reply) => {
    reply.header("Cache-Control", "no-store").header("Referrer-Policy", "no-referrer");
    const browser = cookie(req, FLOW_COOKIE);
    reply.header("Set-Cookie", setCookie(FLOW_COOKIE, "", 0, origin));
    let step: AuthStep = "flow";
    try {
      if (!browser) throw new Error("FLOW_COOKIE_MISSING");
      const flow = await repo.consumeLoginFlow(digest(browser));
      if (!flow) throw new Error("FLOW_EXPIRED_OR_USED");
      const url = new URL(req.url, origin);
      if (!equal(url.searchParams.get("state") || "", flow.state)) throw new Error("STATE_MISMATCH");
      step = "discovery";
      const conf = await configuration();
      step = "grant";
      // openid-client verifies state, PKCE, nonce, issuer, audience, expiration
      // and (with non-repudiation enabled) the ID token signature via JWKS.
      const tokens = await oidc.authorizationCodeGrant(conf, url, {
        pkceCodeVerifier: flow.verifier, expectedState: flow.state,
        expectedNonce: flow.nonce, idTokenExpected: true,
      });
      step = "identity";
      const claims = tokens.claims();
      if (!claims?.sub || typeof claims.exp !== "number") throw new Error("INVALID_IDENTITY");
      let profile: Record<string, unknown> = claims;
      if (!claims.name && !claims.given_name && !claims.family_name && conf.serverMetadata().userinfo_endpoint) {
        try {
          // UserInfo must match the already verified subject. Display metadata
          // is optional; a provider outage must not reject an otherwise valid login.
          profile = { ...claims, ...await oidc.fetchUserInfo(conf, tokens.access_token, claims.sub) };
        } catch { /* Fall back to validated ID-token display claims. */ }
      }
      // Do not store provider access/refresh/ID tokens. Force reauthentication
      // at ID-token expiry (or one hour, whichever occurs first).
      const seconds = Math.min(settings.sessionSeconds ?? 3600, Math.floor(claims.exp - Date.now() / 1000));
      if (seconds < 1) throw new Error("EXPIRED_IDENTITY");
      step = "account";
      const user = await repo.oidcUser(settings.issuer, claims.sub,
        profile.email_verified === true && typeof profile.email === "string" ? profile.email : undefined,
        profileDisplayName(profile));
      const token = secret();
      step = "session";
      await repo.createAuthSession(digest(token), user.id, Date.now() + seconds * 1000);
      return reply.header("Set-Cookie", [setCookie(FLOW_COOKIE, "", 0, origin),
        setCookie(SESSION_COOKIE, token, seconds, origin)]).redirect(workspaceReturnPath(flow.returnTo || null));
    } catch (error) {
      // Never expose callback parameters, tokens, provider bodies or secrets.
      return reply.code(400).send({ error: "SIGN_IN_FAILED", ...authFailure(error, step, req.id) });
    }
  });
  app.post("/api/auth/logout", async (req, reply) => {
    const token = cookie(req, SESSION_COOKIE);
    if (token) await repo.removeSession(digest(token));
    return reply.header("Set-Cookie", setCookie(SESSION_COOKIE, "", 0, origin)).send({ ok: true });
  });
  return adapter;
}
