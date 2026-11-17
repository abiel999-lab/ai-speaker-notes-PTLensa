import { isLoopbackOrigin } from "./local-boundary.js";

export interface OidcSettings {
  issuer: string;
  clientId: string;
  clientSecret?: string;
  allowLocalIssuer?: boolean;
  sessionSeconds?: number;
}
export interface UsageLimits { generations: number; ai: number }

export function oidcSettings(env: NodeJS.ProcessEnv): OidcSettings | undefined {
  const mode = env.AUTH_MODE || "local";
  if (mode === "local") return undefined;
  if (mode !== "oidc") throw new Error("AUTH_MODE must be local or oidc");
  if (!env.OIDC_ISSUER || !env.OIDC_CLIENT_ID)
    throw new Error("OIDC_ISSUER and OIDC_CLIENT_ID are required");
  return {
    issuer: env.OIDC_ISSUER,
    clientId: env.OIDC_CLIENT_ID,
    clientSecret: env.OIDC_CLIENT_SECRET || undefined,
    allowLocalIssuer: env.OIDC_ALLOW_LOCAL_ISSUER === "true",
    sessionSeconds: integerSetting(env.SESSION_SECONDS, 3600, 300, 3600),
  };
}
export function integerSetting(value: string | undefined, fallback: number, min = 1, max = 10000) {
  if (value === undefined || value === "") return fallback;
  if (!/^\d+$/.test(value)) throw new Error("Invalid numeric configuration");
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < min || result > max)
    throw new Error("Numeric configuration is out of range");
  return result;
}
export function validateOidc(settings: OidcSettings, origin: string | undefined) {
  if (!origin || !isLoopbackOrigin(origin))
    throw new Error("Phase 9A OIDC preview requires an explicit loopback APP_ORIGIN");
  const app = new URL(origin);
  const issuer = new URL(settings.issuer);
  if (settings.allowLocalIssuer && !isLoopbackOrigin(issuer.origin))
    throw new Error("OIDC_ALLOW_LOCAL_ISSUER is only allowed for loopback test issuers");
  if (app.origin !== origin || issuer.username || issuer.password || issuer.search || issuer.hash ||
      !settings.clientId || settings.clientId.length > 200 ||
      (settings.sessionSeconds !== undefined && (!Number.isInteger(settings.sessionSeconds) ||
        settings.sessionSeconds < 300 || settings.sessionSeconds > 3600)))
    throw new Error("Invalid OIDC configuration");
  if (issuer.protocol !== "https:" &&
      !(settings.allowLocalIssuer && isLoopbackOrigin(issuer.origin)))
    throw new Error("OIDC issuer requires HTTPS; HTTP is restricted to explicit local test issuers");
}
