$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

if (-not (Test-Path ".venv")) {
    py -3.13 -m venv .venv
}

& .\.venv\Scripts\python.exe -m pip install --upgrade pip

# Remove stale editable-install metadata when upgrading in the same folder.
Get-ChildItem -Path . -Filter "*.egg-info" -Directory -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force
& .\.venv\Scripts\python.exe -m pip install --upgrade -e ".[dev]"

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
}

$installedVersion = & .\.venv\Scripts\python.exe -c "from app.core.version import get_app_version; print(get_app_version())"
Write-Host "Setup complete. App version: $installedVersion"
$distributionVersion = & .\.venv\Scripts\python.exe -c "import importlib.metadata as m; print(m.version('ai-speaker-notes-mvp'))"
Write-Host "Installed package version: $distributionVersion"
Write-Host "Run .\scripts\verify.ps1 first"
Write-Host "AI diagnostic: .\scripts\diagnose-ai.ps1"
Write-Host "Vision preflight (no API cost): .\scripts\test-vision-renderer.ps1"
Write-Host "Cost preflight (no API cost): .\scripts\preflight-cost.ps1 -Path .\presentation.pptx -Vision"
Write-Host "Start server: .\scripts\run.ps1"
