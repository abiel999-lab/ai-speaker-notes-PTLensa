$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$python = ".\.venv\Scripts\python.exe"
$diagnostic = Join-Path $PSScriptRoot "diagnose_ai.py"

if (-not (Test-Path $python)) {
    Write-Error "Virtual environment not found. Run .\scripts\setup.ps1 first."
}
if (-not (Test-Path $diagnostic)) {
    Write-Error "Diagnostic Python script not found: $diagnostic"
}

& $python $diagnostic
$exitCode = $LASTEXITCODE
if ($exitCode -ne 0) {
    exit $exitCode
}
