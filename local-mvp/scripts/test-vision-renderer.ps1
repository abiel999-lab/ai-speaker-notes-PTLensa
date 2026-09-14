$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$python = ".\.venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    Write-Error "Virtual environment not found. Run .\scripts\setup.ps1 first."
}

& $python .\scripts\create_vision_test_deck.py
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& $python .\scripts\test_vision_renderer.py
exit $LASTEXITCODE
