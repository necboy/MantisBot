# ============================================================
#  MantisBot Intelligent Installer v1.0  (Windows PowerShell)
#  MantisBot 智能安装脚本 v1.0
#
#  Usage / 用法:
#    irm https://raw.githubusercontent.com/necboy/MantisBot/main/install.ps1 | iex
#    .\install.ps1
#
#  Parameters / 参数:
#    -InstallDir <path>   Custom install directory / 自定义安装目录
#    -SkipBuild           Skip build step / 跳过编译步骤
#    -Mirror              Use npmmirror CDN / 使用国内镜像加速
# ============================================================
param(
    [string]$InstallDir = "",
    [switch]$SkipBuild,
    [switch]$Mirror
)

# Ensure param defaults are correct in both file-execution and irm|iex contexts.
# In iex mode the param() block may not initialize typed variables properly.
# irm|iex 模式下 param() 可能无法正常初始化变量，此处补全默认值
if ($null -eq $InstallDir -or $InstallDir -isnot [string]) { $InstallDir = "" }
if ($null -eq $SkipBuild) { $SkipBuild = [switch]$false }
if ($null -eq $Mirror)    { $Mirror    = [switch]$false }

$ErrorActionPreference = "Stop"

# Config / 配置
$REPO_URL       = "https://github.com/necboy/MantisBot.git"
$MIN_NODE_MAJOR = 22
$MIN_NODE_MINOR = 22
$BACKEND_PORT   = 8118
$FRONTEND_PORT  = 3000
$script:ProjectDir = ""

# -- Color helpers / 颜色辅助 ---------------------------------
function Write-Banner {
    Write-Host ""
    Write-Host "  +--------------------------------------------------+" -ForegroundColor Cyan
    Write-Host "  |  MantisBot  Intelligent Installer  v1.0         |" -ForegroundColor Cyan
    Write-Host "  +--------------------------------------------------+" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Step([string]$msg) {
    Write-Host ""
    Write-Host "  >> $msg" -ForegroundColor Blue
}

function Write-Ok([string]$msg) {
    Write-Host "     [OK] $msg" -ForegroundColor Green
}

function Write-Warn([string]$msg) {
    Write-Host "     [!!] $msg" -ForegroundColor Yellow
}

function Write-Err([string]$msg) {
    Write-Host "     [XX] $msg" -ForegroundColor Red
}

function Write-Info([string]$msg) {
    Write-Host "          $msg" -ForegroundColor DarkGray
}

function Write-Hr {
    Write-Host "     --------------------------------------------------" -ForegroundColor DarkGray
}

# 错误退出前暂停，避免窗口闪退
function Exit-WithPause([int]$code = 1) {
    Write-Host ""
    Read-Host "     Press Enter to exit" | Out-Null
    exit $code
}

function Test-Cmd([string]$cmd) {
    return [bool](Get-Command $cmd -ErrorAction SilentlyContinue)
}

function Get-NodeMajor {
    try {
        $verRaw = & node --version 2>$null
        if (-not $verRaw) { return 0 }
        $clean = ($verRaw -replace 'v', '').Split('.')[0]
        return [int]$clean
    }
    catch { return 0 }
}

function Get-NodeMinor {
    try {
        $verRaw = & node --version 2>$null
        if (-not $verRaw) { return 0 }
        $clean = ($verRaw -replace 'v', '').Split('.')[1]
        return [int]$clean
    }
    catch { return 0 }
}

# ------------------------------------------------------------
# Show usage info and wait for confirmation
# ------------------------------------------------------------
function Show-Info {
    Write-Host "     What this script does:" -ForegroundColor White
    Write-Host "       1.  Check prerequisites  (Node.js $MIN_NODE_MAJOR.$MIN_NODE_MINOR+, npm, git)" -ForegroundColor DarkGray
    Write-Host "       2.  Clone or locate the MantisBot project" -ForegroundColor DarkGray
    Write-Host "       3.  Install npm dependencies" -ForegroundColor DarkGray
    Write-Host "       4.  Initialize configuration" -ForegroundColor DarkGray
    Write-Host "       5.  Build backend + frontend" -ForegroundColor DarkGray
    Write-Host "       6.  Launch  (choose dev / prod / split mode)" -ForegroundColor DarkGray
    Write-Host ""
    Write-Hr
    Write-Host "     Parameters:" -ForegroundColor White
    Write-Host "       -Mirror              " -NoNewline -ForegroundColor Green
    Write-Host "Use npmmirror CDN  (faster in China)" -ForegroundColor DarkGray
    Write-Host "       -SkipBuild           " -NoNewline -ForegroundColor Green
    Write-Host "Skip the TypeScript + frontend build step" -ForegroundColor DarkGray
    Write-Host "       -InstallDir <path>   " -NoNewline -ForegroundColor Green
    Write-Host "Custom install path  (default: .\MantisBot)" -ForegroundColor DarkGray
    Write-Hr
    Write-Host ""
    Read-Host "     Press Enter to begin installation, or Ctrl+C to cancel" | Out-Null
    Write-Host ""
}

# ------------------------------------------------------------
# STEP 0: Fix execution policy if needed
# 修复 PowerShell 执行策略
# ------------------------------------------------------------
function Assert-ExecutionPolicy {
    $policy = Get-ExecutionPolicy -Scope CurrentUser
    if ($policy -eq "Restricted" -or $policy -eq "AllSigned") {
        Write-Warn "Execution policy is '$policy' - updating to RemoteSigned..."
        try {
            Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force
            Write-Ok "Execution policy updated"
        }
        catch {
            Write-Err "Cannot update execution policy. Please run as Administrator:"
            Exit-WithPause 1
        }
    }
}

# ------------------------------------------------------------
# STEP 1: Check prerequisites
# 检查系统依赖
# ------------------------------------------------------------
function Check-Prerequisites {
    Write-Step "Checking Prerequisites"

    $missing          = @()
    $nodeNeedsUpgrade = $false

    # Node.js
    if (Test-Cmd "node") {
        $ver   = Get-NodeMajor
        $minor = Get-NodeMinor
        if ($ver -gt $MIN_NODE_MAJOR -or ($ver -eq $MIN_NODE_MAJOR -and $minor -ge $MIN_NODE_MINOR)) {
            Write-Ok "Node.js $(node --version)"
        }
        else {
            Write-Err "Node.js version too low (current: v$ver.$minor, required: v$MIN_NODE_MAJOR.$MIN_NODE_MINOR+)"
            $missing          += "nodejs"
            $nodeNeedsUpgrade  = $true
        }
    }
    else {
        Write-Err "Node.js not found"
        $missing += "nodejs"
    }

    # npm
    if (Test-Cmd "npm") {
        Write-Ok "npm $(npm --version)"
    }
    else {
        Write-Err "npm not found"
        $missing += "npm"
    }

    # git
    if (Test-Cmd "git") {
        $gv = (git --version) -replace "git version ", ""
        Write-Ok "git $gv"
    }
    else {
        Write-Warn "git not found (required for cloning)"
        $missing += "git"
    }

    if ($missing.Count -gt 0) {
        Write-Host ""
        Write-Warn "Missing dependencies. Install them first:"
        Write-Hr

        if ($missing -contains "nodejs") {
            if ($nodeNeedsUpgrade) {
                Write-Info "Node.js v$MIN_NODE_MAJOR.$MIN_NODE_MINOR+ required. Upgrade options:"
                Write-Info "  winget :  winget upgrade OpenJS.NodeJS.LTS"
                Write-Info "  nvm    :  nvm install $MIN_NODE_MAJOR && nvm use $MIN_NODE_MAJOR"
                Write-Info "  web    :  https://nodejs.org/en/download  (select LTS)"
            }
            else {
                Write-Info "Node.js v$MIN_NODE_MAJOR.$MIN_NODE_MINOR+ not found. Install options:"
                Write-Info "  winget :  winget install OpenJS.NodeJS.LTS"
                Write-Info "  nvm    :  https://github.com/coreybutler/nvm-windows/releases"
                Write-Info "  web    :  https://nodejs.org/en/download  (select LTS)"
            }
        }
        if ($missing -contains "git") {
            Write-Info "Install git:  winget install Git.Git"
            Write-Info "Or from web:  https://git-scm.com/download/win"
        }

        Write-Host ""
        Write-Err "Please install the above and re-run this script"
        Exit-WithPause 1
    }
}

# ------------------------------------------------------------
# STEP 2: Locate or clone project
# 定位/下载项目
# ------------------------------------------------------------
function Locate-Project {
    Write-Step "Locating Project"

    # Already inside project directory / 已在项目目录内
    if ((Test-Path "package.json") -and (Select-String -Path "package.json" -Pattern '"name": "mantis-bot"' -Quiet)) {
        $script:ProjectDir = (Get-Location).Path
        Write-Ok "Already in project: $($script:ProjectDir)"
        return
    }

    # MantisBot subdirectory exists / 同级 MantisBot 子目录
    if (Test-Path "MantisBot\package.json") {
        $script:ProjectDir = (Join-Path (Get-Location).Path "MantisBot")
        Write-Ok "Found project: $($script:ProjectDir)"
        Set-Location $script:ProjectDir
        return
    }

    # Need to clone / 需要克隆
    if (-not (Test-Cmd "git")) {
        Write-Err "git is required to download the project"
        Write-Info "Download ZIP: https://github.com/necboy/MantisBot/archive/refs/heads/main.zip"
        Write-Info "Unzip into a folder and re-run this script from inside it"
        Exit-WithPause 1
    }

    $currentPath = (Get-Location).Path
    $defaultDir  = Join-Path $currentPath "MantisBot"

    # Only override default if -InstallDir was provided and is a valid non-empty string
    # 仅当明确提供 -InstallDir 参数时才覆盖默认路径
    if ($InstallDir -is [string] -and $InstallDir.Trim().Length -gt 0) {
        $defaultDir = $InstallDir
    }

    Write-Host ""
    $inputDir = Read-Host "     Install directory (Enter for default: $defaultDir)"
    if ($inputDir -ne "") { $defaultDir = $inputDir }

    if (Test-Path $defaultDir) {
        Write-Warn "Directory already exists: $defaultDir"
        $yn = Read-Host "     Continue? (y/N)"
        if ($yn -ne "y" -and $yn -ne "Y") {
            Write-Info "Cancelled"
            exit 0
        }
    }

    Write-Host ""
    Write-Info "Cloning repository, please wait..."
    & git clone --depth=1 $REPO_URL $defaultDir

    if ($LASTEXITCODE -eq 0) {
        $script:ProjectDir = $defaultDir
        Write-Ok "Clone complete: $($script:ProjectDir)"
        Set-Location $script:ProjectDir
    }
    else {
        Write-Err "Clone failed. Check network or download manually:"
        Write-Info "ZIP: https://github.com/necboy/MantisBot/archive/refs/heads/main.zip"
        Exit-WithPause 1
    }
}

# ------------------------------------------------------------
# STEP 3: Install npm dependencies
# 安装 npm 依赖
# ------------------------------------------------------------
function Install-Deps {
    Write-Step "Installing Dependencies"
    Write-Info "First install may take 2-5 minutes, please wait..."
    Write-Host ""

    $npmArgs = @("install")
    if ($Mirror) {
        $npmArgs += "--registry"
        $npmArgs += "https://registry.npmmirror.com"
        Write-Info "Using npmmirror registry (faster in China)"
    }

    & npm @npmArgs

    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Ok "Dependencies installed"
    }
    else {
        Write-Host ""
        Write-Err "npm install failed. Try:"
        Write-Info "1. China mirror:  .\install.ps1 -Mirror"
        Write-Info "2. Clear cache:   npm cache clean --force"
        Write-Info "3. Set proxy:     `$env:HTTPS_PROXY='http://127.0.0.1:7890'"
        Exit-WithPause 1
    }
}

# ------------------------------------------------------------
# STEP 4: Setup configuration
# 初始化配置
# ------------------------------------------------------------
function Setup-Config {
    Write-Step "Configuration Setup"
    $cfgFile = "config\config.json"
    $tplFile = "config\config.example.json"

    if (Test-Path $cfgFile) {
        Write-Ok "Config file exists: $cfgFile"
    }
    elseif (Test-Path $tplFile) {
        Copy-Item $tplFile $cfgFile
        Write-Ok "Config created from template: $cfgFile"
    }
    else {
        Write-Warn "No template found - backend will auto-generate config on first run"
    }

    Write-Host ""
    Write-Host "     ===================================================" -ForegroundColor Yellow
    Write-Host "       Edit $cfgFile to set your AI model API Key" -ForegroundColor Yellow
    Write-Host "       Supported: Anthropic Claude / OpenAI / MiniMax / Qwen" -ForegroundColor DarkGray
    Write-Host "     ===================================================" -ForegroundColor Yellow
    Write-Host ""

    $setKey = Read-Host "     Set ANTHROPIC_API_KEY environment variable now? (y/N)"
    if ($setKey -eq "y" -or $setKey -eq "Y") {
        $secureKey = Read-Host "     Enter API Key (hidden)" -AsSecureString
        $bstr      = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
        $apiKey    = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

        if ($apiKey -ne "") {
            [System.Environment]::SetEnvironmentVariable("ANTHROPIC_API_KEY", $apiKey, "User")
            $env:ANTHROPIC_API_KEY = $apiKey
            Write-Ok "API Key saved to user environment variable (restart terminal to apply globally)"
        }
        else {
            Write-Warn "Empty key, skipping"
        }
    }
}

# ------------------------------------------------------------
# STEP 5: Build project
# ------------------------------------------------------------
function Build-MantisBot {
    if ($SkipBuild) {
        Write-Step "Skipping build (-SkipBuild)"
        return
    }

    Write-Step "Building Project"
    Write-Info "Compiling TypeScript backend + Vite frontend..."
    Write-Host ""

    & npm run build:all

    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Ok "Build complete"
    }
    else {
        Write-Host ""
        Write-Err "Build failed - check output above for errors"
        Exit-WithPause 1
    }
}

# ------------------------------------------------------------
# STEP 5b: Install Playwright Chromium browser
# 安装 Playwright Chromium 浏览器
# ------------------------------------------------------------
function Install-PlaywrightBrowser {
    Write-Step "Installing Playwright Chromium Browser"
    Write-Info "Downloading Chromium for browser automation features..."
    Write-Host ""

    & npx playwright install chromium

    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Ok "Chromium browser installed successfully"
    }
    else {
        Write-Host ""
        Write-Warn "Chromium install failed - browser automation features may not work"
        Write-Info "You can retry manually: npx playwright install chromium"
    }
}

# ------------------------------------------------------------
# STEP 5c: Install poppler (PDF text extraction tools)
# 安装 poppler PDF 工具
# ------------------------------------------------------------
function Install-Poppler {
    Write-Step "Installing PDF Tools / 安装 PDF 工具 (poppler)"

    if (Test-Cmd "pdftotext") {
        $ver = (& pdftotext -v 2>&1) | Select-Object -First 1
        Write-Ok "pdftotext already installed: $ver"
        return
    }

    Write-Info "Installing poppler (pdftotext and other PDF command-line tools)..."
    Write-Host ""

    $installed = $false

    # Try Chocolatey
    if (Test-Cmd "choco") {
        Write-Info "Using Chocolatey..."
        & choco install poppler -y 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Ok "poppler installed via Chocolatey"
            $installed = $true
        }
    }

    # Try Scoop
    if (-not $installed -and (Test-Cmd "scoop")) {
        Write-Info "Using Scoop..."
        & scoop install poppler 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Ok "poppler installed via Scoop"
            $installed = $true
        }
    }

    # Try winget
    if (-not $installed -and (Test-Cmd "winget")) {
        Write-Info "Using winget..."
        & winget install --id oschwartz10612.Poppler --silent --accept-package-agreements --accept-source-agreements 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Ok "poppler installed via winget"
            $installed = $true
        }
    }

    if (-not $installed) {
        Write-Warn "Could not auto-install poppler. Manual options:"
        Write-Hr
        Write-Info "  Chocolatey:  choco install poppler"
        Write-Info "  Scoop:       scoop install poppler"
        Write-Info "  Manual ZIP:  https://github.com/oschwartz10612/poppler-windows/releases"
        Write-Info "  (download, unzip, add bin\ folder to PATH)"
        Write-Hr
        Write-Info "PDF text extraction features may not work until poppler is installed."
    }
}

# ------------------------------------------------------------
# STEP 6: Start
# 启动
# ------------------------------------------------------------
function Start-MantisBot {
    Write-Step "Launch / Starting MantisBot"

    Write-Host ""
    Write-Host "     Choose start mode:" -ForegroundColor White
    Write-Host ""
    Write-Host "     1)  Dev mode    " -NoNewline -ForegroundColor White
    Write-Host "(hot-reload, merged logs - recommended for development)" -ForegroundColor DarkGray
    Write-Host "     2)  Prod mode   " -NoNewline -ForegroundColor White
    Write-Host "(compiled build - recommended for deployment)" -ForegroundColor DarkGray
    Write-Host "     3)  Split mode  " -NoNewline -ForegroundColor White
    Write-Host "(backend + frontend in separate windows, uses start.ps1)" -ForegroundColor DarkGray
    Write-Host "     4)  Manual      " -NoNewline -ForegroundColor White
    Write-Host "(finish install, start later)" -ForegroundColor DarkGray
    Write-Host ""

    $choice = Read-Host "     Select (1-4, default: 1)"
    if ($choice -eq "") { $choice = "1" }

    switch ($choice) {
        "1" {
            Write-Host ""
            Write-Ok "Starting dev mode..."
            Write-Host "     Frontend: http://localhost:$FRONTEND_PORT" -ForegroundColor Cyan
            Write-Host "     Backend:  http://localhost:$BACKEND_PORT"  -ForegroundColor Cyan
            Write-Host "     Press Ctrl+C to stop" -ForegroundColor DarkGray
            Write-Host ""
            & npm run dev
        }
        "2" {
            Write-Host ""
            Write-Ok "Starting prod mode..."
            Write-Host "     Frontend: http://localhost:$FRONTEND_PORT" -ForegroundColor Cyan
            Write-Host "     Backend:  http://localhost:$BACKEND_PORT"  -ForegroundColor Cyan
            Write-Host "     Press Ctrl+C to stop" -ForegroundColor DarkGray
            Write-Host ""
            & npm run start
        }
        "3" {
            Write-Host ""
            Write-Ok "Starting split-window mode (using start.ps1)..."
            Write-Host "     Frontend: http://localhost:$FRONTEND_PORT" -ForegroundColor Cyan
            Write-Host "     Backend:  http://localhost:$BACKEND_PORT"  -ForegroundColor Cyan
            Write-Host ""
            $killScript = Join-Path $script:ProjectDir "scripts\kill-port.cjs"
            if (Test-Path $killScript) {
                & node $killScript $BACKEND_PORT 2>$null
            }
            & (Join-Path $script:ProjectDir "start.ps1")
        }
        default {
            Write-Host ""
            Write-Hr
            Write-Ok "Install complete! Start manually:"
            Write-Host ""
            Write-Host "     cd `"$($script:ProjectDir)`"" -ForegroundColor Green
            Write-Host "     npm run dev       # Dev mode"  -ForegroundColor Green
            Write-Host "     npm run start     # Prod mode" -ForegroundColor Green
            Write-Host "     .\start.ps1       # Split-window mode" -ForegroundColor Green
            Write-Hr
        }
    }
}

# ------------------------------------------------------------
# MAIN
# ------------------------------------------------------------
function Main {
    Write-Banner
    Show-Info
    Assert-ExecutionPolicy
    Check-Prerequisites
    Locate-Project
    Install-Deps
    Setup-Config
    Build-MantisBot
    Install-PlaywrightBrowser
    Install-Poppler
    Start-MantisBot

    Write-Host ""
    Write-Host "  +--------------------------------------------------+" -ForegroundColor Green
    Write-Host "  |   MantisBot install & launch complete!           |" -ForegroundColor Green
    Write-Host "  +--------------------------------------------------+" -ForegroundColor Green
    Write-Host ""
}

Main
