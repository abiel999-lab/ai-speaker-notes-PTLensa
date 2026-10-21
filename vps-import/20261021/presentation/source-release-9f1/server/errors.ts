/** Only allowlisted codes leave the server. Never serialize provider bodies, keys, or source text. */
export function safeErrorCode(
  error: unknown,
  fallback = "GENERATION_FAILED",
): string {
  const message = error instanceof Error ? error.message : "";
  if (
    /^(OPENAI_HTTP_\d{3}|OPENAI_(INCOMPLETE|NO_PLAN|INVALID_PLAN|NETWORK|TIMEOUT|NOT_CONFIGURED)|PLAN_(COVERAGE|SCHEMA)|SOURCE_FIDELITY_FAILED|EXPORTED_TEXT_MISMATCH|TABLE_(TOO_WIDE|CELL_TOO_LONG)|SLIDE_LIMIT|LAYOUT_BOUNDS|JOB_CANCELLED|QUEUE_UNAVAILABLE|QUOTA_EXCEEDED|MOTION_EXPORT_INVALID|SCENE_INTERACTION_INVALID|IMAGE_NOT_FOUND|CREATIVE_(INVALID_SCENE|SOURCE_LIMIT|SLIDE_COUNT))$/.test(
      message,
    )
  )
    return message;
  return fallback;
}
