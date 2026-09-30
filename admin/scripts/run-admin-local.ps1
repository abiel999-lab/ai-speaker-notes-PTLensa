$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

if (-not (Test-Path ".env")) {
    Write-Host "Missing .env" -ForegroundColor Yellow
    Write-Host "Run: Copy-Item .\deploy\admin-local.env.example .\.env"
    Write-Host "Then run this script again."
    exit 1
}

& .\scripts\sync-existing-keycloak-secret.ps1 -ProjectRoot $ProjectRoot

$ClientSecretLine = Get-Content .env | Where-Object { $_ -match '^KEYCLOAK_CLIENT_SECRET=' } | Select-Object -First 1
$ClientSecret = if ($ClientSecretLine) { ($ClientSecretLine -split '=', 2)[1].Trim() } else { '' }
if ([string]::IsNullOrWhiteSpace($ClientSecret) -or $ClientSecret.StartsWith('CHANGE_ME', [System.StringComparison]::OrdinalIgnoreCase)) {
    Write-Host "KEYCLOAK_CLIENT_SECRET is not configured." -ForegroundColor Red
    Write-Host "Copy the current secret from Keycloak > Clients > ai-speaker-notes > Credentials into .env." -ForegroundColor Yellow
    exit 1
}

$AdminLoginSecretLine = Get-Content .env | Where-Object { $_ -match '^KEYCLOAK_ADMIN_LOGIN_CLIENT_SECRET=' } | Select-Object -First 1
$AdminLoginSecret = if ($AdminLoginSecretLine) { ($AdminLoginSecretLine -split '=', 2)[1].Trim() } else { '' }
if ([string]::IsNullOrWhiteSpace($AdminLoginSecret) -or $AdminLoginSecret.StartsWith('CHANGE_ME', [System.StringComparison]::OrdinalIgnoreCase)) {
    Write-Host "KEYCLOAK_ADMIN_LOGIN_CLIENT_SECRET is not configured." -ForegroundColor Red
    Write-Host "Copy the current secret from Keycloak > Clients > ai-speaker-admin-login > Credentials into .env." -ForegroundColor Yellow
    exit 1
}

Write-Host "Starting local PostgreSQL..." -ForegroundColor Cyan
docker compose -f .\docker-compose.admin-local.yml up -d

if (-not (Test-Path ".venv\Scripts\python.exe")) {
    Write-Host "Creating Python virtual environment..." -ForegroundColor Cyan
    python -m venv .venv
}

Write-Host "Installing/updating dependencies..." -ForegroundColor Cyan
& .\.venv\Scripts\python.exe -m pip install -e ".[dev]"

Write-Host "Local app:  http://127.0.0.1:8001/" -ForegroundColor Green
Write-Host "Admin:      http://127.0.0.1:8001/admin" -ForegroundColor Green
Write-Host "User OIDC return:  http://127.0.0.1:8001/auth/callback" -ForegroundColor Cyan
Write-Host "Admin OIDC return: http://127.0.0.1:8001/auth/admin/callback" -ForegroundColor Cyan
Write-Host "User client:  ai-speaker-notes" -ForegroundColor DarkGray
Write-Host "Admin client: ai-speaker-admin-login" -ForegroundColor DarkGray
$AppDbLine = Get-Content .env | Where-Object { $_ -match '^APPLICATION_DATABASE_URL=' } | Select-Object -First 1
$AppDbValue = if ($AppDbLine) { ($AppDbLine -split '=', 2)[1].Trim() } else { '' }
if ([string]::IsNullOrWhiteSpace($AppDbValue)) {
    Write-Host "Activity DB: local DATABASE_URL fallback" -ForegroundColor DarkGray
} else {
    Write-Host "Activity DB: APPLICATION_DATABASE_URL configured" -ForegroundColor Green
}
& .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8001
