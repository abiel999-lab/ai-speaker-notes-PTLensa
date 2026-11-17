import { createHash } from "node:crypto";
import type { ImportMode, SourceBlock, SourceDocument } from "./types.js";
export const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
export function hash(text: string) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
export function decodeSource(bytes: Uint8Array) {
  if (bytes.length > MAX_SOURCE_BYTES) throw new Error("SOURCE_TOO_LARGE");
  const decoded = new TextDecoder("utf-8", {
    fatal: true,
    ignoreBOM: true,
  }).decode(bytes);
  if (decoded.includes("\0")) throw new Error("BINARY_SOURCE");
  return decoded;
}
function inline(text: string) {
  return text
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1");
}
export function parseSource(
  raw: string,
  mode: ImportMode = "markdown",
): SourceDocument {
  if (Buffer.byteLength(raw, "utf8") > MAX_SOURCE_BYTES)
    throw new Error("SOURCE_TOO_LARGE");
  if (!raw.trim()) throw new Error("EMPTY_SOURCE");
  if (raw.includes("\0")) throw new Error("BINARY_SOURCE");
  if (raw.split(/\s+/u).length > 20000) throw new Error("SOURCE_WORD_LIMIT");
  const blocks: SourceBlock[] = [];
  const ledger: SourceDocument["ledger"] = [];
  let cursor = 0;
  let fenced = false;
  const lines = raw.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g)?.filter(Boolean) || [];
  for (let i = 0; i < lines.length; i++) {
    const original = lines[i];
    const start = cursor;
    cursor += original.length;
    const line = original.replace(/\r\n$|[\r\n]$/, "");
    if (!line.trim()) {
      ledger.push({ start, end: cursor, role: "format" });
      continue;
    }
    let text = line,
      kind: SourceBlock["kind"] = "paragraph",
      level = 0,
      cells: string[][] | undefined;
    if (mode === "markdown") {
      if (/^\s*```/.test(line)) {
        fenced = !fenced;
        text = line;
        kind = "code";
      } else if (fenced) {
        kind = "code";
      } else if (/^#{1,6}\s/.test(line)) {
        const m = line.match(/^(#{1,6})[ \t]+(.*)$/)!;
        level = m[1].length;
        kind = "heading";
        text = inline(m[2]);
      } else if (/^\s*[-+]\s+/.test(line)) {
        kind = "list";
        text = inline(line.replace(/^\s*[-+][ \t]+/, ""));
      } else if (/^\s*\d+[.)][ \t]+/.test(line)) {
        kind = "list";
        text = inline(line);
      } else if (/^\[\d+\]\(https?:\/\//.test(line)) {
        kind = "reference";
        text = line;
      } else if (
        line.includes("|") &&
        i + 1 < lines.length &&
        /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])
      ) {
        const row = (v: string) =>
          v
            .replace(/\r?\n$/, "")
            .trim()
            .replace(/^\|/, "")
            .replace(/\|$/, "")
            .split("|")
            .map((x) => inline(x.trim()));
        cells = [row(line)];
        let tableRaw = original;
        cursor += lines[i + 1].length;
        tableRaw += lines[++i];
        while (
          i + 1 < lines.length &&
          lines[i + 1].includes("|") &&
          lines[i + 1].trim()
        ) {
          cursor += lines[i + 1].length;
          tableRaw += lines[++i];
          cells.push(row(lines[i]));
        }
        if (cells.some((r) => r.length !== cells![0].length))
          throw new Error("TABLE_COLUMNS");
        text = cells.map((r) => r.join("\t")).join("\n");
        kind = "table";
        blocks.push({
          id: `b${blocks.length}`,
          start,
          end: cursor,
          raw: tableRaw,
          text,
          kind,
          level,
          cells,
        });
        ledger.push({ start, end: cursor, role: "content" });
        continue;
      } else {
        text = inline(line);
      }
    }
    // A lone asterisk and unknown Markdown stay literal. No content cleanup.
    blocks.push({
      id: `b${blocks.length}`,
      start,
      end: cursor,
      raw: original,
      text,
      kind,
      level,
      cells,
    });
    ledger.push({ start, end: cursor, role: "content" });
  }
  if (
    cursor !== raw.length ||
    ledger.map((x) => raw.slice(x.start, x.end)).join("") !== raw
  )
    throw new Error("LEDGER_MISMATCH");
  return {
    raw,
    sha256: hash(raw),
    mode,
    blocks,
    ledger,
    words: raw.trim().split(/\s+/u).length,
    version: "source-v1",
  };
}
