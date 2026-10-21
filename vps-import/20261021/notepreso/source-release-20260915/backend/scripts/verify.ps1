$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
if (-not (Test-Path ".venv\Scripts\python.exe")) {
    throw "Virtual environment not found. Run .\scripts\setup.ps1 first."
}

& .\.venv\Scripts\python.exe -m pytest
if ($LASTEXITCODE -ne 0) {
    throw "Automated tests failed. Fix the failing test(s) before continuing."
}

& .\.venv\Scripts\python.exe .\scripts\verify.py
if ($LASTEXITCODE -ne 0) {
    throw "Deterministic PPTX verification failed."
}

Write-Host "Verification complete. Open examples\demo-output.pptx in Microsoft PowerPoint."
