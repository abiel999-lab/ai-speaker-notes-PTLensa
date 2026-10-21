/** Fixed public reason codes only. Never serialize an exception, callback URL,
 * response body, identity claim, authorization code, cookie or credential. */
export type AuthStep = "discovery" | "flow" | "grant" | "identity" | "account" | "session";
const internal = new Set(["FLOW_COOKIE_MISSING", "FLOW_EXPIRED_OR_USED", "STATE_MISMATCH", "INVALID_IDENTITY", "EXPIRED_IDENTITY"]);
const tls = new Set(["ERR_TLS_CERT_ALTNAME_INVALID", "CERT_HAS_EXPIRED", "DEPTH_ZERO_SELF_SIGNED_CERT", "SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "ERR_SSL_DECRYPTION_FAILED_OR_BAD_RECORD_MAC", "ERR_SSL_SSLV3_ALERT_BAD_RECORD_MAC"]);
const timeout = new Set(["OAUTH_TIMEOUT", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "ETIMEDOUT"]);
export function authFailureReason(error: unknown, step: AuthStep): string {
  let current: any = error;
  for (let depth = 0; current && typeof current === "object" && depth < 5; depth++, current = current.cause) {
    if (depth === 0 && internal.has(current.message)) return current.message;
    if (tls.has(current.code)) return "PROVIDER_TLS_ERROR";
    if (timeout.has(current.code) || current.name === "TimeoutError") return "PROVIDER_TIMEOUT";
    if (["ENOTFOUND", "EAI_AGAIN"].includes(current.code)) return "PROVIDER_DNS_ERROR";
    if (["ECONNREFUSED", "ECONNRESET", "ENETUNREACH", "EHOSTUNREACH", "UND_ERR_SOCKET"].includes(current.code)) return "PROVIDER_CONNECTION_FAILED";
    if (current.code === "OAUTH_JWT_TIMESTAMP_CHECK_FAILED") return "TOKEN_TIME_INVALID";
    if (current.code === "OAUTH_JWT_CLAIM_COMPARISON_FAILED") return "IDENTITY_CLAIM_MISMATCH";
    if (current.code === "OAUTH_RESPONSE_BODY_ERROR") {
      if (current.error === "invalid_client") return "TOKEN_CLIENT_REJECTED";
      if (current.error === "invalid_grant") return "TOKEN_GRANT_REJECTED";
    }
    if (current.code === "OAUTH_AUTHORIZATION_RESPONSE_ERROR") return "AUTHORIZATION_REJECTED";
  }
  if (step === "account") return "ACCOUNT_STORAGE_FAILED";
  if (step === "session") return "SESSION_STORAGE_FAILED";
  if (step === "flow") return "FLOW_STORAGE_FAILED";
  if (step === "identity") return "INVALID_IDENTITY";
  return "AUTH_PROVIDER_ERROR";
}
export function authFailure(error: unknown, step: AuthStep, requestId: string) {
  const reason = authFailureReason(error, step);
  console.error(JSON.stringify({ event: "auth_failure", step, reason, requestId, time: new Date().toISOString() }));
  return { reason, requestId, retry: "/api/auth/login" };
}
