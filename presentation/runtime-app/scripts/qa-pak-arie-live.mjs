#!/usr/bin/env node
import { createHash } from "node:crypto";
/** Opt-in paid OpenAI integration UAT for the exact Pak Arie Pemda TXT sample.
 * Localhost only. Uses server-owned key, never prints or reads API credentials.
 * Leaves generated project for manual PowerPoint inspection (unless QA_CLEANUP=1).
 */
const originUrl = new URL(process.env.QA_ORIGIN || "http://127.0.0.1:4310");
if (!["127.0.0.1", "localhost"].includes(originUrl.hostname) ||
    !["http:", "https:"].includes(originUrl.protocol) ||
    originUrl.pathname !== "/" || originUrl.search || originUrl.hash ||
    originUrl.username || originUrl.password)
  throw new Error("QA_LOCAL_ONLY: non-loopback origin is not permitted");
if (process.env.QA_CONFIRM_PAID_AI !== "YES")
  throw new Error("PAID_AI_NOT_CONFIRMED: set QA_CONFIRM_PAID_AI=YES for one test job");
const origin = originUrl.origin;
const theme = process.env.QA_THEME || "ivory";
if (!["midnight", "ivory", "solar", "cobalt", "sage", "graphite"].includes(theme))
  throw new Error("QA_THEME_INVALID");
const pause = (ms) => new Promise(resolve => setTimeout(resolve, ms));
async function call(url, { method = "GET", body, timeout = 20000 } = {}) {
  const res = await fetch(origin + "/api" + url, {
    method,
    signal: AbortSignal.timeout(timeout),
    headers: body ? { "Content-Type": "application/json", Origin: origin } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`${method} ${url} (${res.status}): ${String(data.error || "REQUEST_FAILED").slice(0, 80)}`);
  }
  return url.endsWith("/export") ? res.arrayBuffer() : res.json();
}
let projectId;
let succeeded = false;
try {
  const [health, caps, sample] = await Promise.all([
    call("/health"), call("/capabilities"), call("/sample")
  ]);
  if (!health.ok || caps.mode !== "local") throw new Error("LOCAL_APP_REQUIRED");
  if (!caps.ai) throw new Error("AI_NOT_CONFIGURED: set OPENAI_API_KEY in the existing local .env (never paste it here)");
  if (caps.model !== "gpt-6-luna" || caps.models?.length !== 1 || caps.models[0] !== "gpt-6-luna")
    throw new Error("LUNA_ONLY_REQUIRED: server must exclusively use GPT-6 Luna");
  if (typeof sample.source !== "string" || sample.source.length < 5000)
    throw new Error("PEMDA_SAMPLE_NOT_LOADED");
  if (createHash("sha256").update(sample.source, "utf8").digest("hex") !==
      "fc64fa461955226fe66d59eb9bac651e79c2749ef47138f25f4cf40ec27d23f1")
    throw new Error("PEMDA_SOURCE_HASH_MISMATCH: expected original Pak Arie TXT");
  const { project } = await call("/projects", {
    method: "POST", body: { name: `Pak Arie AI UAT ${new Date().toISOString().slice(0, 16)}`,
      source: sample.source, mode: "markdown" }
  });
  projectId = project.id;
  const { generation } = await call(`/projects/${projectId}/generate`, {
    method: "POST", body: { settings: {
      theme, mode: "markdown", useAI: true, images: false,
      template: "executive", density: "comfortable", fontScale: 1,
      intent: "educational"
    } }
  });
  const deadline = Date.now() + 240000;
  let job;
  do {
    await pause(1500);
    ({ generation: job } = await call(`/generations/${generation.id}`));
    if (["ready", "failed", "cancelled"].includes(job.status)) break;
  } while (Date.now() < deadline);
  if (job.status !== "ready") throw new Error(`GENERATION_NOT_READY: ${job.status} ${job.error || ""}`);
  const trace = job.plan?.ai;
  if (!trace?.requested || trace.outcome !== "used" || job.plan?.engine !== "openai" || trace.model !== "gpt-6-luna")
    throw new Error(`AI_NOT_USED: outcome=${trace?.outcome || "unknown"}, reason=${trace?.reason || "n/a"}. A rules fallback is NOT an AI PASS.`);
  if (!job.report?.passed || !job.report?.exportVerified || job.report?.quality?.status === "blocked")
    throw new Error("FIDELITY_OR_QUALITY_FAILED");
  const audit = await call(`/generations/${generation.id}/validation`);
  if (!audit.passed || !audit.orderValid || !audit.exportVerified ||
      audit.missing?.length || audit.changed?.length || audit.extra?.length || audit.duplicate?.length)
    throw new Error("EXPORTED_PPTX_TEXT_NOT_EXACT");
  const buffer = new Uint8Array(await call(`/generations/${generation.id}/export`, { timeout: 60000 }));
  if (buffer.length < 20000 || buffer[0] !== 0x50 || buffer[1] !== 0x4b)
    throw new Error("PPTX_INVALID_ZIP");
  succeeded = true;
  console.log(JSON.stringify({ result: "PASS", version: health.version, projectId,
    generationId: generation.id, slides: job.scene?.slides?.length,
    pptxBytes: buffer.length, ai: { outcome: trace.outcome,
      model: trace.model, inputTokens: trace.inputTokens || 0,
      outputTokens: trace.outputTokens || 0 },
    sourceTextExact: true, exportVerified: true,
    quality: audit.quality || job.report?.quality,
    previewRendered: job.preview === "rendered",
    reviewUrl: `${origin}/app`, projectRetained: process.env.QA_CLEANUP !== "1"
  }, null, 2));
} catch (error) {
  console.error("PAK_ARIE_LIVE_QA_FAIL:", error instanceof Error ? error.message : "UNKNOWN_ERROR");
  process.exitCode = 1;
} finally {
  if (projectId && succeeded && process.env.QA_CLEANUP === "1") {
    try { await call("/projects/" + projectId, { method: "DELETE" }); }
    catch { console.error("QA_CLEANUP_FAILED: test project ID", projectId); }
  } else if (projectId) {
    console.log("Project retained for review/troubleshooting:", projectId);
  }
}
