# MantisBot Backend Launcher (Windows)
# Equivalent to start-backend.sh

param([int]$Port = 8118)

$ErrorActionPreference = 'SilentlyContinue'
$root = $PSScriptRoot

Write-Host "[MantisBot] Stopping old backend processes..." -ForegroundColor Yellow

$killed = @(
    Get-CimInstance Win32_Process |
        Where-Object { $_.CommandLine -match "tsx/esm" -and $_.CommandLine -match "entry\.ts" }
)
foreach ($proc in $killed) {
    Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
    Write-Host "[MantisBot] Killed PID $($proc.ProcessId)" -ForegroundColor DarkYellow
}
if ($killed.Count -eq 0) {
    Write-Host "[MantisBot] No old processes found" -ForegroundColor DarkGray
}

Write-Host "[MantisBot] Freeing port $Port..." -ForegroundColor Yellow
node "$root\scripts\kill-port.cjs" $Port

$portInUse = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($portInUse) {
    Write-Host "[MantisBot] ERROR: Port $Port is still in use. Free it manually and retry." -ForegroundColor Red
    Write-Host "  Run: Stop-Process -Id (Get-NetTCPConnection -LocalPort $Port).OwningProcess -Force" -ForegroundColor DarkGray
    Read-Host "Press Enter to exit"
    exit 1
}

if (-not (Test-Path "$root\node_modules")) {
    Write-Host "[MantisBot] Installing dependencies..." -ForegroundColor Yellow
    npm install
}

$ErrorActionPreference = 'Continue'
Write-Host ""
Write-Host "[MantisBot] Starting backend..." -ForegroundColor Green
Write-Host "[MantisBot] URL: http://localhost:$Port" -ForegroundColor Cyan
Write-Host "[MantisBot] Press Ctrl+C to stop" -ForegroundColor DarkGray
Write-Host ""

Set-Location $root
node --watch --import tsx/esm src/entry.ts
