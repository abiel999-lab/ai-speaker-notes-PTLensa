import { createHash } from "node:crypto";
export const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
export function hash(text) {
    return createHash("sha256").update(text, "utf8").digest("hex");
}
export function decodeSource(bytes) {
    if (bytes.length > MAX_SOURCE_BYTES)
        throw new Error("SOURCE_TOO_LARGE");
    const decoded = new TextDecoder("utf-8", {
        fatal: true,
        ignoreBOM: true,
    }).decode(bytes);
    if (decoded.includes("\0"))
        throw new Error("BINARY_SOURCE");
    return decoded;
}
function inline(text) {
    return text
        .replace(/\*\*([^*\n]+)\*\*/g, "$1")
        .replace(/__([^_\n]+)__/g, "$1")
        .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "$1")
        .replace(/`([^`\n]+)`/g, "$1");
}
export function parseSource(raw, mode = "markdown", { tolerateMalformedMarkup = false } = {}) {
    if (Buffer.byteLength(raw, "utf8") > MAX_SOURCE_BYTES)
        throw new Error("SOURCE_TOO_LARGE");
    if (!raw.trim())
        throw new Error("EMPTY_SOURCE");
    if (raw.includes("\0"))
        throw new Error("BINARY_SOURCE");
    if (raw.split(/\s+/u).length > 20000)
        throw new Error("SOURCE_WORD_LIMIT");
    const blocks = [];
    const ledger = [];
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
        if(mode==='markdown'&&!fenced&&/^\s*(?:\*\*\*+|---+)\s*$/.test(line)){ledger.push({start,end:cursor,role:'format'});continue;}
        if(mode==='markdown'&&!fenced&&line.trim()==='\\['){
            let mathRaw=original,closed=false;
            while(i+1<lines.length){const next=lines[++i];cursor+=next.length;mathRaw+=next;if(next.trim()==='\\]'){closed=true;break;}}
            if(!closed&&!tolerateMalformedMarkup)throw Error('MATH_SYNTAX');
            blocks.push({id:`b${blocks.length}`,start,end:cursor,raw:mathRaw,text:mathRaw.trim(),kind:'paragraph',level:0,equation:true});ledger.push({start,end:cursor,role:'content'});continue;
        }
        let text = line, kind = "paragraph", level = 0, cells;
        if (mode === "markdown") {
            if (/^\s*```/.test(line)) {
                fenced = !fenced;
                ledger.push({start,end:cursor,role:'format'});continue;
            }
            else if (fenced) {
                kind = "code";
            }
            else if (/^#{1,6}\s/.test(line)) {
                const m = line.match(/^(#{1,6})[ \t]+(.*)$/);
                level = m[1].length;
                kind = "heading";
                text = inline(m[2]);
            }
            else if (/^\s*[-+]\s+/.test(line)) {
                kind = "list";
                text = inline(line.replace(/^\s*[-+][ \t]+/, ""));
            }
            else if (/^\s*\d+[.)][ \t]+/.test(line)) {
                kind = "list";
                text = inline(line);
            }
            else if (/^\[\d+\]\(https?:\/\//.test(line)) {
                kind = "reference";
                text = line;
            }
            else if (line.includes("|") &&
                i + 1 < lines.length &&
                /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
                const row = (v) => v
                    .replace(/\r?\n$/, "")
                    .trim()
                    .replace(/^\|/, "")
                    .replace(/\|$/, "")
                    .split(tolerateMalformedMarkup ? /(?<!\\)\|/ : "|")
                    .map((x) => inline((tolerateMalformedMarkup ? x.replace(/\\\|/g, '|') : x).trim()));
                cells = [row(line)];
                let tableRaw = original;
                cursor += lines[i + 1].length;
                tableRaw += lines[++i];
                while (i + 1 < lines.length &&
                    lines[i + 1].includes("|") &&
                    lines[i + 1].trim()) {
                    cursor += lines[i + 1].length;
                    tableRaw += lines[++i];
                    cells.push(row(lines[i]));
                }
                if (cells.some((r) => r.length !== cells[0].length)) {
                    if (!tolerateMalformedMarkup) throw new Error("TABLE_COLUMNS");
                    blocks.push({ id:`b${blocks.length}`, start, end:cursor, raw:tableRaw,
                        text:tableRaw.replace(/\r\n?/g, '\n').replace(/\n$/, ''), kind:'code', level:0 });
                    ledger.push({ start, end:cursor, role:'content' });
                    continue;
                }
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
            }
            else {
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
    if (cursor !== raw.length ||
        ledger.map((x) => raw.slice(x.start, x.end)).join("") !== raw)
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
