/** Display metadata only; account identity always remains the verified issuer/sub. */
function text(value) {
    if (typeof value !== "string")
        return undefined;
    const cleaned = value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, " ")
        .replace(/\s+/gu, " ").trim();
    return Array.from(cleaned).slice(0, 120).join("") || undefined;
}
export function profileDisplayName(claims) {
    return text(claims.name) || text([text(claims.given_name), text(claims.family_name)].filter(Boolean).join(" ")) ||
        text(claims.preferred_username) ||
        (claims.email_verified === true && typeof claims.email === "string" ? text(claims.email.split("@")[0]) : undefined);
}
