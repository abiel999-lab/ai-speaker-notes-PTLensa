/** Download names from owner-scoped project display names. No filesystem renames. */
const unsafe = /[<>:"/\\|?*\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/gu;
const reserved = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/iu;

export function safeProjectFilenameStem(name: string | null | undefined): string {
  const normalized = (name || "").normalize("NFKC")
    .replace(unsafe, "-")
    .replaceAll("/", "-")
    .replace(/\s+/gu, " ")
    .replace(/^[.\s-]+|[.\s-]+$/gu, "");
  const shortened = Array.from(normalized).slice(0, 100).join("")
    .replace(/[.\s-]+$/gu, "");
  const stem = shortened || "presentation";
  return reserved.test(stem) ? "_" + stem : stem;
}

/** Both filename= (ASCII compatibility) and filename*= (Unicode, RFC 5987). */
export function projectDownloadHeader(
  projectName: string | null | undefined,
  kind: "pptx" | "pdf" | "validation",
): string {
  const stem = safeProjectFilenameStem(projectName);
  const filename = kind === "validation"
    ? `${stem}-validation-report.json` : `${stem}.${kind}`;
  const ascii = filename.normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^\x20-\x7e]/gu, "-")
    .replace(/["\\]/gu, "-");
  const encoded = encodeURIComponent(filename).replace(/['()*]/gu,
    c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
