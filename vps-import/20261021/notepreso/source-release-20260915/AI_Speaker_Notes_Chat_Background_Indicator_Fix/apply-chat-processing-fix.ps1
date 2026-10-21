$ErrorActionPreference = "Stop"

$projectRoot = (Get-Location).Path
$patchRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$payloadRoot = Join-Path $patchRoot "payload\app"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupRoot = Join-Path $projectRoot ".patch-backups\chat-processing-$timestamp"

$roots = @(
    "app",
    "backend\app",
    "local-mvp\app"
)

$banner = @'
<div id="chat-processing-banner" class="chat-processing-banner hidden" role="status" aria-live="polite"><span class="chat-processing-spinner" aria-hidden="true"></span><div><strong id="chat-processing-title">AI sedang memproses jawaban…</strong><span id="chat-processing-text">Proses tetap berjalan di server walau Anda pindah halaman. Jawaban akan muncul otomatis saat selesai.</span></div></div>
'@

$cssMarker = "Persistent Chat AI processing state — v1.0.0"
$cssPatch = @'

/* Persistent Chat AI processing state — v1.0.0 */
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
'@

function Backup-File([string]$relativePath) {
    $source = Join-Path $projectRoot $relativePath
    if (-not (Test-Path $source)) { return }
    $destination = Join-Path $backupRoot $relativePath
    $destinationDir = Split-Path -Parent $destination
    New-Item -ItemType Directory -Path $destinationDir -Force | Out-Null
    Copy-Item $source $destination -Force
}

if (-not (Test-Path (Join-Path $projectRoot "app"))) {
    throw "Jalankan script ini dari root project ai-speaker-notes-mvp."
}

New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null

foreach ($base in $roots) {
    $basePath = Join-Path $projectRoot $base
    if (-not (Test-Path $basePath)) { continue }

    foreach ($relative in @("services\chat.py", "api\chat_routes.py", "static\chat.js")) {
        $targetRelative = Join-Path $base $relative
        $target = Join-Path $projectRoot $targetRelative
        if (-not (Test-Path $target)) { continue }
        Backup-File $targetRelative
        $payload = Join-Path $payloadRoot $relative
        Copy-Item $payload $target -Force
        Write-Host "UPDATED: $targetRelative" -ForegroundColor Green
    }

    $chatRelative = Join-Path $base "templates\chat.html"
    $chatPath = Join-Path $projectRoot $chatRelative
    if (Test-Path $chatPath) {
        Backup-File $chatRelative
        $html = Get-Content $chatPath -Raw
        if ($html -notmatch 'id="chat-processing-banner"') {
            if ($html -notmatch '<div id="chat-messages"') {
                throw "Marker #chat-messages tidak ditemukan di $chatRelative"
            }
            $html = $html -replace '<div id="chat-messages"', ($banner + '<div id="chat-messages"')
        }
        $html = [regex]::Replace($html, '/static/app\.css\?v=[A-Za-z0-9._-]+', '/static/app.css?v=1003')
        $html = [regex]::Replace($html, '/static/chat\.js\?v=[A-Za-z0-9._-]+', '/static/chat.js?v=1003')
        Set-Content $chatPath $html -Encoding UTF8
        Write-Host "PATCHED: $chatRelative" -ForegroundColor Green
    }

    $cssRelative = Join-Path $base "static\app.css"
    $cssPath = Join-Path $projectRoot $cssRelative
    if (Test-Path $cssPath) {
        Backup-File $cssRelative
        $css = Get-Content $cssPath -Raw
        if ($css -notmatch [regex]::Escape($cssMarker)) {
            Add-Content $cssPath $cssPatch -Encoding UTF8
            Write-Host "PATCHED: $cssRelative" -ForegroundColor Green
        } else {
            Write-Host "SKIP (already patched): $cssRelative" -ForegroundColor Yellow
        }
    }
}

Write-Host ""
Write-Host "Chat background-processing indicator patch applied." -ForegroundColor Cyan
Write-Host "Backup: $backupRoot"
Write-Host "Next: rebuild the Docker app container, then hard-refresh /chat." -ForegroundColor Cyan
