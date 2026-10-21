$ErrorActionPreference = 'Stop'

$targets = @(
    '.\app\static\app.js',
    '.\backend\app\static\app.js',
    '.\local-mvp\app\static\app.js'
)

$old = @'
${job.status==='completed'?`<a class="btn secondary" href="/chat?job=${job.id}">${t('openChat')}</a>`:''}<button class="danger-btn" type="button" data-delete-job="${job.id}">${t('delete')}</button>
'@

$new = @'
${job.status==='completed'?`<a class="btn primary history-download-btn" href="${job.download_url || `/api/v1/jobs/${job.id}/download`}">${t('download')}</a><a class="btn secondary" href="/chat?job=${job.id}">${t('openChat')}</a>`:''}<button class="danger-btn" type="button" data-delete-job="${job.id}">${t('delete')}</button>
'@

foreach ($file in $targets) {
    if (-not (Test-Path $file)) {
        Write-Warning "SKIP: $file tidak ditemukan"
        continue
    }

    $text = Get-Content $file -Raw
    if ($text.Contains($new.Trim())) {
        Write-Host "ALREADY PATCHED: $file" -ForegroundColor Yellow
        continue
    }

    if (-not $text.Contains($old.Trim())) {
        throw "Pattern history action tidak ditemukan di $file. Patch dihentikan agar tidak merusak source terbaru."
    }

    $text = $text.Replace($old.Trim(), $new.Trim())
    Set-Content $file $text -Encoding UTF8
    Write-Host "PATCHED: $file" -ForegroundColor Green
}

# Cache-bust app.js on Dashboard so browser does not keep the old history renderer.
$templateTargets = @(
    '.\app\templates\index.html',
    '.\backend\app\templates\index.html',
    '.\local-mvp\app\templates\index.html'
)

foreach ($file in $templateTargets) {
    if (-not (Test-Path $file)) { continue }
    $text = Get-Content $file -Raw
    $text = [regex]::Replace($text, '/static/app\.js\?v=[^"''\s<]+', '/static/app.js?v=1002')
    Set-Content $file $text -Encoding UTF8
    Write-Host "CACHE BUST: $file" -ForegroundColor Green
}

Write-Host ''
Write-Host 'DONE. Riwayat completed sekarang menampilkan Unduh PPTX hasil + Buka Chat AI + Hapus.' -ForegroundColor Cyan
