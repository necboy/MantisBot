# MantisBot Frontend Launcher (Windows)
# Equivalent to start-frontend.sh

$root = $PSScriptRoot
$webUiDir = Join-Path $root "web-ui"

if (-not (Test-Path "$webUiDir\node_modules")) {
    Write-Host "[MantisBot] Installing frontend dependencies..." -ForegroundColor Yellow
    npm install --prefix $webUiDir
}

Write-Host ""
Write-Host "[MantisBot] Starting frontend..." -ForegroundColor Green
Write-Host "[MantisBot] URL: http://localhost:3000" -ForegroundColor Cyan
Write-Host "[MantisBot] Press Ctrl+C to stop" -ForegroundColor DarkGray
Write-Host ""

Set-Location $webUiDir
npm run dev
