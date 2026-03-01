# MantisBot Launcher (Windows)
# Opens backend and frontend in separate PowerShell windows
# Usage: .\start.ps1
# First time: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned

$ErrorActionPreference = 'SilentlyContinue'
$root = $PSScriptRoot

Write-Host ""
Write-Host "  MantisBot Starting..." -ForegroundColor Cyan
Write-Host "  ================================" -ForegroundColor DarkGray
Write-Host ""

# 1. Free backend port
Write-Host "  Freeing port 8118..." -ForegroundColor Yellow
node "$root\scripts\kill-port.cjs" 8118

# 2. Launch backend in a new window
Write-Host "  Launching backend (new window)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList @(
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-NoExit",
    "-File", "$root\start-backend.ps1"
)

# 3. Wait for backend to be ready (TCP check, up to 30s)
Write-Host "  Waiting for backend..." -ForegroundColor DarkGray
$maxWait = 30
$waited = 0
$ready = $false

while (-not $ready -and $waited -lt $maxWait) {
    Start-Sleep -Seconds 1
    $waited++
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $tcp.Connect("127.0.0.1", 8118)
        $tcp.Close()
        $ready = $true
    } catch { }
}

if ($ready) {
    Write-Host "  Backend ready (${waited}s)" -ForegroundColor Green
} else {
    Write-Host "  Backend not responding after ${maxWait}s, starting frontend anyway (it will auto-reconnect)" -ForegroundColor Yellow
}

# 4. Launch frontend in a new window
Write-Host "  Launching frontend (new window)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList @(
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-NoExit",
    "-File", "$root\start-frontend.ps1"
)

$ErrorActionPreference = 'Continue'
Write-Host ""
Write-Host "  ================================" -ForegroundColor DarkGray
Write-Host "  MantisBot is running!" -ForegroundColor Green
Write-Host ""
Write-Host "  Frontend:  http://localhost:3000" -ForegroundColor Cyan
Write-Host "  Backend:   http://localhost:8118" -ForegroundColor Cyan
Write-Host ""
Write-Host "  To stop: press Ctrl+C in each service window" -ForegroundColor DarkGray
Write-Host ""
