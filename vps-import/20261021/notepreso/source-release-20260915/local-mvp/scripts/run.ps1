param(
    [string]$BindAddress = "",
    [int]$Port = 0,
    [switch]$Reload
)

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

if (-not (Test-Path ".venv\Scripts\python.exe")) {
    throw "Virtual environment not found. Run .\scripts\setup.ps1 first."
}

function Get-DotEnvValue {
    param(
        [string]$Name,
        [string]$DefaultValue
    )

    if (-not (Test-Path ".env")) {
        return $DefaultValue
    }

    $match = Get-Content ".env" |
        Where-Object { $_ -match "^\s*$([regex]::Escape($Name))\s*=" } |
        Select-Object -First 1

    if (-not $match) {
        return $DefaultValue
    }

    $value = ($match -split "=", 2)[1].Trim()
    return $value.Trim('"').Trim("'")
}

function Test-LocalPortBindable {
    param(
        [string]$Address,
        [int]$CandidatePort
    )

    $ipAddress = $null
    if ($Address -eq "0.0.0.0") {
        $ipAddress = [System.Net.IPAddress]::Any
    }
    elseif (-not [System.Net.IPAddress]::TryParse($Address, [ref]$ipAddress)) {
        try {
            $ipAddress = [System.Net.Dns]::GetHostAddresses($Address) |
                Where-Object { $_.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork } |
                Select-Object -First 1
        }
        catch {
            return $false
        }
    }

    if ($null -eq $ipAddress) {
        return $false
    }

    $listener = [System.Net.Sockets.TcpListener]::new($ipAddress, $CandidatePort)
    try {
        $listener.Start()
        return $true
    }
    catch [System.Net.Sockets.SocketException] {
        return $false
    }
    finally {
        try { $listener.Stop() } catch { }
    }
}

if ([string]::IsNullOrWhiteSpace($BindAddress)) {
    $BindAddress = Get-DotEnvValue -Name "APP_HOST" -DefaultValue "127.0.0.1"
}

if ($Port -eq 0) {
    $configuredPort = Get-DotEnvValue -Name "APP_PORT" -DefaultValue "8000"
    if (-not [int]::TryParse($configuredPort, [ref]$Port)) {
        throw "APP_PORT in .env must be an integer. Current value: '$configuredPort'."
    }
}

if ($Port -lt 1 -or $Port -gt 65535) {
    throw "Port must be between 1 and 65535."
}

$requestedPort = $Port
if (-not (Test-LocalPortBindable -Address $BindAddress -CandidatePort $Port)) {
    $fallbackPort = $null
    $maxPort = [Math]::Min(65535, $requestedPort + 500)

    for ($candidate = $requestedPort + 1; $candidate -le $maxPort; $candidate++) {
        if (Test-LocalPortBindable -Address $BindAddress -CandidatePort $candidate) {
            $fallbackPort = $candidate
            break
        }
    }

    if ($null -eq $fallbackPort) {
        throw "Cannot bind to $BindAddress starting at port $requestedPort. The port may be occupied or reserved by Windows. Run .\scripts\diagnose-port.ps1 -Port $requestedPort."
    }

    Write-Warning "Port $requestedPort cannot be bound on this Windows host. It may be occupied or reserved. Falling back to port $fallbackPort."
    $Port = $fallbackPort
}

$displayAddress = if ($BindAddress -eq "0.0.0.0") { "127.0.0.1" } else { $BindAddress }
Write-Host "Starting AI Speaker Notes MVP..."
Write-Host "Open: http://${displayAddress}:$Port"
if ($Reload) {
    Write-Host "Development reload: enabled"
}

$uvicornArgs = @(
    "-m", "uvicorn",
    "app.main:app",
    "--host", $BindAddress,
    "--port", "$Port"
)

if ($Reload) {
    $uvicornArgs += "--reload"
}

& .\.venv\Scripts\python.exe @uvicornArgs
exit $LASTEXITCODE
