param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Stop"
$EnvPath = Join-Path $ProjectRoot ".env"
$LegacyEnv = Join-Path (Split-Path -Parent $ProjectRoot) "ai-speaker-notes-mvp\.env"

function Read-EnvValue([string]$Path, [string]$Name) {
    if (-not (Test-Path $Path)) { return $null }
    $line = Get-Content $Path | Where-Object { $_ -match "^$([regex]::Escape($Name))=" } | Select-Object -First 1
    if (-not $line) { return $null }
    return ($line -split '=', 2)[1].Trim()
}

function Set-EnvValue([string]$Path, [string]$Name, [string]$Value) {
    $lines = if (Test-Path $Path) { [System.Collections.Generic.List[string]](Get-Content $Path) } else { [System.Collections.Generic.List[string]]::new() }
    $found = $false
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match "^$([regex]::Escape($Name))=") {
            $lines[$i] = "$Name=$Value"
            $found = $true
            break
        }
    }
    if (-not $found) { $lines.Add("$Name=$Value") }
    Set-Content -Path $Path -Value $lines -Encoding UTF8
}

if (-not (Test-Path $EnvPath)) { exit 0 }
$current = Read-EnvValue $EnvPath "KEYCLOAK_CLIENT_SECRET"
$needsSecret = [string]::IsNullOrWhiteSpace($current) -or $current.StartsWith("CHANGE_ME", [System.StringComparison]::OrdinalIgnoreCase)

if ($needsSecret -and (Test-Path $LegacyEnv)) {
    $legacySecret = Read-EnvValue $LegacyEnv "KEYCLOAK_CLIENT_SECRET"
    if (-not [string]::IsNullOrWhiteSpace($legacySecret) -and -not $legacySecret.StartsWith("CHANGE_ME", [System.StringComparison]::OrdinalIgnoreCase)) {
        Set-EnvValue $EnvPath "KEYCLOAK_CLIENT_SECRET" $legacySecret
        Write-Host "Synced the existing ai-speaker-notes Keycloak client secret from the sibling MVP .env." -ForegroundColor Green
    }
}

$sessionSecret = Read-EnvValue $EnvPath "SESSION_SECRET"
if ([string]::IsNullOrWhiteSpace($sessionSecret) -or $sessionSecret.StartsWith("CHANGE_ME", [System.StringComparison]::OrdinalIgnoreCase)) {
    $bytes = New-Object byte[] 48
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($bytes)
    }
    finally {
        $rng.Dispose()
    }
    $generated = [Convert]::ToBase64String($bytes)
    Set-EnvValue $EnvPath "SESSION_SECRET" $generated
    Write-Host "Generated a local SESSION_SECRET." -ForegroundColor Green
}
