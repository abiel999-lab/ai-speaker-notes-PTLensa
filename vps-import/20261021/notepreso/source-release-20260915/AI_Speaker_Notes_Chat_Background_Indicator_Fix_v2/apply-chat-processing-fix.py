from __future__ import annotations

import datetime as dt
import py_compile
import shutil
from pathlib import Path

PROJECT = Path.cwd()
PATCH = Path(__file__).resolve().parent
PAYLOAD = PATCH / "payload" / "app"
STAMP = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
BACKUP = PROJECT / ".patch-backups" / f"chat-processing-{STAMP}"
ROOTS = [Path("app"), Path("backend/app"), Path("local-mvp/app")]

BANNER = (
    '<div id="chat-processing-banner" class="chat-processing-banner hidden" role="status" aria-live="polite">'
    '<span class="chat-processing-spinner" aria-hidden="true"></span>'
    '<div><strong id="chat-processing-title">AI sedang memproses jawaban...</strong>'
    '<span id="chat-processing-text">Proses tetap berjalan di server walau Anda pindah halaman. '
    'Jawaban akan muncul otomatis saat selesai.</span></div></div>'
)

CSS_MARKER = "Persistent Chat AI processing state - v1.0.0"
CSS_PATCH = r'''

/* Persistent Chat AI processing state - v1.0.0 */
.chat-processing-banner{margin:12px 16px 0;padding:12px 14px;display:flex;align-items:center;gap:11px;border:1px solid #bfe1ca;border-radius:12px;background:#f2fbf5;color:#145c37;box-shadow:0 3px 12px rgba(20,92,55,.05)}
.chat-processing-banner.hidden{display:none}
.chat-processing-banner>div{display:grid;gap:2px;min-width:0}
.chat-processing-banner strong{font-size:12.5px;line-height:1.35}
.chat-processing-banner span:not(.chat-processing-spinner){font-size:11px;line-height:1.45;color:#527163}
.chat-processing-spinner{width:16px;height:16px;flex:0 0 16px;border:2px solid #b6ddc4;border-top-color:#16865e;border-radius:50%;animation:asn-chat-spin .78s linear infinite}
.bubble-processing{min-width:210px;color:#355c49}
.bubble-processing-row{display:flex;align-items:center;gap:9px;font-weight:700}
.bubble.failed{border-color:#f0c8c4;background:#fff7f6;color:#8f271f}
.clear-chat-btn.is-disabled,.clear-chat-btn:disabled{opacity:.55;cursor:not-allowed;transform:none!important;box-shadow:none!important}
@keyframes asn-chat-spin{to{transform:rotate(360deg)}}
@media (max-width:700px){.chat-processing-banner{margin:10px 12px 0;align-items:flex-start}.chat-processing-banner span:not(.chat-processing-spinner){font-size:10.5px}}
@media (prefers-reduced-motion:reduce){.chat-processing-spinner{animation-duration:1.5s}}
'''


def backup(relative: Path) -> None:
    source = PROJECT / relative
    if not source.exists():
        return
    destination = BACKUP / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)


def write_utf8(path: Path, text: str) -> None:
    path.write_text(text, encoding="utf-8", newline="")


def replace_version(text: str, asset: str, version: str) -> str:
    import re
    pattern = rf"/static/{re.escape(asset)}\?v=[A-Za-z0-9._-]+"
    return re.sub(pattern, f"/static/{asset}?v={version}", text)


if not (PROJECT / "app").is_dir():
    raise SystemExit("ERROR: Jalankan dari root project ai-speaker-notes-mvp.")

BACKUP.mkdir(parents=True, exist_ok=True)
updated = 0

for base in ROOTS:
    base_path = PROJECT / base
    if not base_path.exists():
        continue

    for relative in (Path("services/chat.py"), Path("api/chat_routes.py"), Path("static/chat.js")):
        target_rel = base / relative
        target = PROJECT / target_rel
        payload = PAYLOAD / relative
        if not target.exists():
            continue
        backup(target_rel)
        shutil.copy2(payload, target)
        print(f"UPDATED: {target_rel}")
        updated += 1

    chat_rel = base / "templates/chat.html"
    chat_path = PROJECT / chat_rel
    if chat_path.exists():
        backup(chat_rel)
        html = chat_path.read_text(encoding="utf-8")
        if 'id="chat-processing-banner"' not in html:
            marker = '<div id="chat-messages"'
            if marker not in html:
                raise SystemExit(f"ERROR: Marker #chat-messages tidak ditemukan di {chat_rel}")
            html = html.replace(marker, BANNER + marker, 1)
        html = replace_version(html, "app.css", "1004")
        html = replace_version(html, "chat.js", "1004")
        write_utf8(chat_path, html)
        print(f"PATCHED: {chat_rel}")
        updated += 1

    css_rel = base / "static/app.css"
    css_path = PROJECT / css_rel
    if css_path.exists():
        backup(css_rel)
        css = css_path.read_text(encoding="utf-8")
        # Handle the old marker too, so reruns after a partially applied earlier patch stay idempotent.
        if CSS_MARKER not in css and "Persistent Chat AI processing state" not in css:
            with css_path.open("a", encoding="utf-8", newline="") as fh:
                fh.write(CSS_PATCH)
            print(f"PATCHED: {css_rel}")
            updated += 1
        else:
            print(f"SKIP (already patched): {css_rel}")

# Fast syntax sanity check for copied Python files in the primary app tree.
for candidate in (PROJECT / "app/services/chat.py", PROJECT / "app/api/chat_routes.py"):
    if candidate.exists():
        py_compile.compile(str(candidate), doraise=True)

print()
print("PASS: Chat background-processing indicator patch applied.")
print(f"Backup: {BACKUP}")
print(f"Files updated/patched: {updated}")
print("Next: rebuild the Docker app container, then hard-refresh /chat.")
