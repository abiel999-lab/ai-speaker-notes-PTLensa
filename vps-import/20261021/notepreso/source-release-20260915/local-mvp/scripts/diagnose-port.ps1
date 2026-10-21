param(
    [int]$Port = 8000
)

$ErrorActionPreference = "Continue"

Write-Host "=== AI Speaker Notes MVP - Windows Port Diagnostic ==="
Write-Host "Target port: $Port"
Write-Host ""

Write-Host "[1/3] TCP listeners using port $Port"
$connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
if ($connections) {
    $connections | Select-Object LocalAddress, LocalPort, State, OwningProcess | Format-Table -AutoSize
    $processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($processId in $processIds) {
        Get-Process -Id $processId -ErrorAction SilentlyContinue |
            Select-Object Id, ProcessName, Path |
            Format-Table -AutoSize
    }
}
else {
    Write-Host "No active TCP listener was found on port $Port."
}

Write-Host ""
Write-Host "[2/3] Windows excluded TCP port ranges"
try {
    netsh interface ipv4 show excludedportrange protocol=tcp
}
catch {
    Write-Warning "Could not read excluded port ranges: $($_.Exception.Message)"
}

Write-Host ""
Write-Host "[3/3] Direct loopback bind test"
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
try {
    $listener.Start()
    Write-Host "PASS: 127.0.0.1:$Port can be bound."
}
catch [System.Net.Sockets.SocketException] {
    Write-Host "FAIL: 127.0.0.1:$Port cannot be bound."
    Write-Host "Socket error: $($_.Exception.SocketErrorCode)"
    Write-Host "Message: $($_.Exception.Message)"
}
finally {
    try { $listener.Stop() } catch { }
}

Write-Host ""
Write-Host "If port $Port is blocked, the normal runner now automatically selects a nearby bindable port."
Write-Host "You can also request another port explicitly, for example:"
Write-Host "  .\scripts\run.ps1 -Port 8765"
