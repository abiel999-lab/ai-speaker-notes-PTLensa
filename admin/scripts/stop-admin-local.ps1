$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot
docker compose -f .\docker-compose.admin-local.yml down
Write-Host "Local admin PostgreSQL stopped." -ForegroundColor Green
