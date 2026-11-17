#!/usr/bin/env node
/** Local acceptance, no paid AI. Creates/deletes only the smoke script's test project. */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
const expectedVersion = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
const origin = new URL(process.env.QA_ORIGIN || "http://127.0.0.1:4310");
if (!["localhost", "127.0.0.1"].includes(origin.hostname) ||
    !["http:", "https:"].includes(origin.protocol) || origin.pathname !== "/" ||
    origin.username || origin.password || origin.search || origin.hash)
  throw new Error("QA_LOCAL_ONLY");
async function get(route) {
  const response = await fetch(origin.origin + route, { redirect: "error", signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("QA_HTTP_" + response.status);
  return response.json();
}
try {
  const health = await get("/api/health");
  if (!health.ok || health.version !== expectedVersion) throw new Error("EXPECTED_RELEASE");
  const session = await get("/api/session");
  if (session.authentication === "oidc") {
    const workspace = await fetch(origin.origin + "/app", { redirect: "manual", signal: AbortSignal.timeout(10000) });
    if (workspace.status !== 302 || workspace.headers.get("location") !== "/api/auth/login")
      throw new Error("DIRECT_LOGIN_REDIRECT_FAILED");
    const privateApi = await fetch(origin.origin + "/api/projects", { redirect: "manual", signal: AbortSignal.timeout(10000) });
    if (privateApi.status !== 401) throw new Error("ANONYMOUS_API_NOT_BLOCKED");
    console.log(JSON.stringify({ result: "PASS", phase: "9E", version: health.version,
      directLoginRedirect: true, privateApiProtected: true, paidAiCalls: 0,
      realKeycloakTested: false, publicDeploymentReady: false }, null, 2));
    process.exit(0);
  }
  if (session.authentication !== "none" || !session.user) throw new Error("UNSUPPORTED_AUTHENTICATION_MODE");
  const caps = await get("/api/capabilities");
  if (caps.mode !== "local" || caps.models?.length !== 1 || caps.models[0] !== "gpt-6-luna")
    throw new Error("LOCAL_LUNA_REQUIRED");
  const usage = await get("/api/usage");
  if (usage.enforced !== false || usage.resetTimezone !== "UTC") throw new Error("USAGE_CONTRACT");
  const result = spawnSync(process.execPath, ["scripts/qa-local.mjs"], {
    stdio: "inherit", env: { ...process.env, QA_ORIGIN: origin.origin }, timeout: 180000,
  });
  if (result.error || result.status !== 0) throw new Error("LOCAL_SMOKE_FAILED");
  console.log(JSON.stringify({ result: "PASS", phase: "9E", version: health.version,
    localWorkflow: true, paidAiCalls: 0, realKeycloakTested: false, publicDeploymentReady: false }, null, 2));
} catch (error) {
  console.error("LOCAL_ACCEPTANCE_FAIL:", error instanceof Error ? error.message : "UNKNOWN");
  process.exitCode = 1;
}
