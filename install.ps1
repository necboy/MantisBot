# ============================================================
#  MantisBot 智能安装脚本 v1.0  (Windows PowerShell)
#  Intelligent Installer for Windows 10 / 11
#
#  用法 / Usage:
#    1. 以管理员或普通用户运行 PowerShell
#    2. 若提示执行策略限制，先运行：
#       Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
#    3. 执行此脚本：
#       .\install.ps1
#
#  参数 / Parameters:
#    -InstallDir  <path>   指定安装目录
#    -SkipBuild            跳过编译步骤（开发时可用）
#    -Mirror               使用 npmmirror 国内镜像加速
# ============================================================
param(
    [string]$InstallDir  = "",
    [switch]$SkipBuild,
    [switch]$Mirror
)

$ErrorActionPreference = "Stop"

# ── 配置 / Config ─────────────────────────────────────────────
$REPO_URL        = "https://github.com/necboy/MantisBot.git"
$MIN_NODE_MAJOR  = 18
$BACKEND_PORT    = 8118
$FRONTEND_PORT   = 3000
$script:ProjectDir = ""

# ── 颜色辅助 / Color Helpers ──────────────────────────────────
function Write-Banner {
    Write-Host ""
    Write-Host "  ╔══════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "  ║    🤖  MantisBot  智能安装脚本  v1.0             ║" -ForegroundColor Cyan
    Write-Host "  ║        Intelligent Installer for Windows         ║" -ForegroundColor Cyan
    Write-Host "  ╚══════════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Step([string]$msg) {
    Write-Host ""
    Write-Host "  ▶  $msg" -ForegroundColor Blue
}

function Write-Ok([string]$msg) {
    Write-Host "     " -NoNewline
    Write-Host "✓  " -ForegroundColor Green -NoNewline
    Write-Host $msg
}

function Write-Warn([string]$msg) {
    Write-Host "     " -NoNewline
    Write-Host "⚠  " -ForegroundColor Yellow -NoNewline
    Write-Host $msg
}

function Write-Err([string]$msg) {
    Write-Host "     " -NoNewline
    Write-Host "✗  " -ForegroundColor Red -NoNewline
    Write-Host $msg
}

function Write-Info([string]$msg) {
    Write-Host "     $msg" -ForegroundColor DarkGray
}

function Write-Hr {
    Write-Host "     ──────────────────────────────────────────" -ForegroundColor DarkGray
}

function Test-Cmd([string]$cmd) {
    return [bool](Get-Command $cmd -ErrorAction SilentlyContinue)
}

function Get-NodeMajor {
    try {
        $verRaw = node --version 2>$null
        if (-not $verRaw) { return 0 }
        $ver = $verRaw -replace 'v', ''
        return [int]($ver.Split('.')[0])
    } catch { return 0 }
}

# ────────────────────────────────────────────────────────────
# STEP 0: 确保执行策略正常
# ────────────────────────────────────────────────────────────
function Assert-ExecutionPolicy {
    $policy = Get-ExecutionPolicy -Scope CurrentUser
    if ($policy -eq "Restricted" -or $policy -eq "AllSigned") {
        Write-Warn "当前执行策略为 $policy，正在为当前用户设置为 RemoteSigned..."
        try {
            Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force
            Write-Ok "执行策略已更新"
        } catch {
            Write-Err "无法修改执行策略，请以管理员身份运行："
            Write-Info "Set-ExecutionPolicy -Scope CurrentUser RemoteSigned"
            exit 1
        }
    }
}

# ────────────────────────────────────────────────────────────
# STEP 1: 检查系统依赖
# ────────────────────────────────────────────────────────────
function Check-Prerequisites {
    Write-Step "检查系统依赖 / Checking Prerequisites"

    $missing = @()

    # ── Node.js ────────────────────────────────────────────────
    if (Test-Cmd "node") {
        $ver = Get-NodeMajor
        if ($ver -ge $MIN_NODE_MAJOR) {
            Write-Ok "Node.js $(node --version)"
        } else {
            Write-Err "Node.js 版本过低  (当前 v$ver，需要 v$MIN_NODE_MAJOR+)"
            $missing += "nodejs"
        }
    } else {
        Write-Err "未找到 Node.js"
        $missing += "nodejs"
    }

    # ── npm ────────────────────────────────────────────────────
    if (Test-Cmd "npm") {
        Write-Ok "npm $(npm --version)"
    } else {
        Write-Err "未找到 npm"
        $missing += "npm"
    }

    # ── git ────────────────────────────────────────────────────
    if (Test-Cmd "git") {
        $gv = (git --version) -replace "git version ", ""
        Write-Ok "git $gv"
    } else {
        Write-Warn "未找到 git  (克隆仓库必须)"
        $missing += "git"
    }

    # ── 缺失依赖提示 ─────────────────────────────────────��──────
    if ($missing.Count -gt 0) {
        Write-Host ""
        Write-Warn "检测到缺失依赖，安装方法如下："
        Write-Hr

        if ($missing -contains "nodejs") {
            Write-Info "方式 1 (winget，推荐):  winget install OpenJS.NodeJS.LTS"
            Write-Info "方式 2 (官网):          https://nodejs.org/zh-cn/download"
            Write-Info "方式 3 (nvm-windows):   https://github.com/coreybutler/nvm-windows/releases"
        }
        if ($missing -contains "git") {
            Write-Info "安装 git:  winget install Git.Git"
            Write-Info "或从官网:  https://git-scm.com/download/win"
        }

        Write-Host ""
        Write-Err "请安装上述依赖后重新运行脚本"
        exit 1
    }
}

# ────────────────────────────────────────────────────────────
# STEP 2: 定位 / 下载项目
# ────────────────────────────────────────────────────────────
function Locate-Project {
    Write-Step "定位项目目录 / Locating Project"

    # 已在项目目录内
    if ((Test-Path "package.json") -and (Select-String -Path "package.json" -Pattern '"name": "mantis-bot"' -Quiet 2>$null)) {
        $script:ProjectDir = (Get-Location).Path
        Write-Ok "已在项目目录：$($script:ProjectDir)"
        return
    }

    # 同级 MantisBot 子目录
    if ((Test-Path "MantisBot\package.json")) {
        $script:ProjectDir = (Join-Path (Get-Location).Path "MantisBot")
        Write-Ok "找到项目目录：$($script:ProjectDir)"
        Set-Location $script:ProjectDir
        return
    }

    # 需要克隆
    if (-not (Test-Cmd "git")) {
        Write-Err "需要 git 来下载项目"
        Write-Info "请手动下载 ZIP：https://github.com/necboy/MantisBot/archive/refs/heads/main.zip"
        Write-Info "解压后进入目录重新运行此脚本"
        exit 1
    }

    $defaultDir = Join-Path (Get-Location).Path "MantisBot"
    if ($InstallDir -ne "") { $defaultDir = $InstallDir }

    Write-Host ""
    $inputDir = Read-Host "     安装目录 (回车使用默认: $defaultDir)"
    if ($inputDir -ne "") { $defaultDir = $inputDir }

    if (Test-Path $defaultDir) {
        Write-Warn "目录已存在：$defaultDir"
        $yn = Read-Host "     继续 / continue? (y/N)"
        if ($yn -ne "y" -and $yn -ne "Y") { Write-Info "已取消"; exit 0 }
    }

    Write-Host ""
    Write-Info "正在克隆仓库，请稍候..."
    git clone --depth=1 $REPO_URL $defaultDir

    if ($LASTEXITCODE -eq 0) {
        $script:ProjectDir = $defaultDir
        Write-Ok "克隆完成：$($script:ProjectDir)"
        Set-Location $script:ProjectDir
    } else {
        Write-Err "克隆失败，请检查网络或手动下载"
        Write-Info "ZIP 下载：https://github.com/necboy/MantisBot/archive/refs/heads/main.zip"
        exit 1
    }
}

# ────────────────────────────────────────────────────────────
# STEP 3: 安装 npm 依赖
# ────────────────────────────────────────────────────────────
function Install-Deps {
    Write-Step "安装 npm 依赖 / Installing Dependencies"
    Write-Info "首次安装可能需要 2~5 分钟，请耐心等待..."
    Write-Host ""

    $npmArgs = @("install")
    if ($Mirror) {
        $npmArgs += "--registry"
        $npmArgs += "https://registry.npmmirror.com"
        Write-Info "使用 npmmirror 镜像加速"
    }

    & npm @npmArgs

    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Ok "依赖安装完成"
    } else {
        Write-Host ""
        Write-Err "依赖安装失败，尝试以下方案："
        Write-Info "1. 国内镜像加速：.\install.ps1 -Mirror"
        Write-Info "2. 清除缓存：npm cache clean --force"
        Write-Info "3. 配置代理：`$env:HTTPS_PROXY='http://127.0.0.1:7890'"
        exit 1
    }
}

# ────────────────────────────────────────────────────────────
# STEP 4: 初始化配置
# ────────────────────────────────────────────────────────────
function Setup-Config {
    Write-Step "初始化配置 / Configuration Setup"

    $cfgFile = "config\config.json"
    $tplFile = "config\config.example.json"

    if (Test-Path $cfgFile) {
        Write-Ok "配置文件已存在：$cfgFile"
    } elseif (Test-Path $tplFile) {
        Copy-Item $tplFile $cfgFile
        Write-Ok "已从示例文件创建：$cfgFile"
    } else {
        Write-Warn "未找到示例配置，后端将在首次运行时自动生成默认配置"
    }

    Write-Host ""
    Write-Host "     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
    Write-Host "       请编辑 $cfgFile 配置 AI 模型 API Key" -ForegroundColor Yellow
    Write-Host "       支持：Anthropic Claude / OpenAI / MiniMax / Qwen / GLM 等" -ForegroundColor DarkGray
    Write-Host "     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
    Write-Host ""

    # 可选：配置 API Key
    $setKey = Read-Host "     是否现在设置 Anthropic API Key 环境变量? (y/N)"
    if ($setKey -eq "y" -or $setKey -eq "Y") {
        # 关闭回显读取密钥
        $secureKey = Read-Host "     输入 API Key (输入不会显示)" -AsSecureString
        $apiKey = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
            [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
        )
        if ($apiKey -ne "") {
            # 写入用户级永久环境变量
            [System.Environment]::SetEnvironmentVariable("ANTHROPIC_API_KEY", $apiKey, "User")
            # 当前会话也生效
            $env:ANTHROPIC_API_KEY = $apiKey
            Write-Ok "API Key 已保存到用户环境变量（重启终端后对所有程序生效）"
        } else {
            Write-Warn "API Key 为空，跳过"
        }
    }
}

# ────────────────────────────────────────────────────────────
# STEP 5: 编译项目
# ────────────────────────────────────────────────────────────
function Build-MantisBot {
    if ($SkipBuild) {
        Write-Step "跳过编译 / Skipping Build (-SkipBuild)"
        return
    }

    Write-Step "编译项目 / Building Project"
    Write-Info "编译 TypeScript 后端 + Vite 前端..."
    Write-Host ""

    npm run build:all

    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Ok "编译完成"
    } else {
        Write-Host ""
        Write-Err "编译失败，请检查错误信息"
        exit 1
    }
}

# ────────────────────────────────────────────────────────────
# STEP 6: 启动
# ────────────────────────────────────────────────────────────
function Start-MantisBot {
    Write-Step "启动 MantisBot / Launch"

    Write-Host ""
    Write-Host "     请选择启动模式 / Choose start mode:" -ForegroundColor White
    Write-Host ""
    Write-Host "     1)  开发模式  " -NoNewline -ForegroundColor White
    Write-Host "(热重载 · 前后端合并输出 · 推荐开发时使用)" -ForegroundColor DarkGray
    Write-Host "     2)  生产模式  " -NoNewline -ForegroundColor White
    Write-Host "(已编译版本 · 推荐正式部署)" -ForegroundColor DarkGray
    Write-Host "     3)  分窗模式  " -NoNewline -ForegroundColor White
    Write-Host "(后端/前端各自在独立窗口运行，使用内置 start.ps1)" -ForegroundColor DarkGray
    Write-Host "     4)  稍后手动启动" -ForegroundColor DarkGray
    Write-Host ""

    $choice = Read-Host "     选择 (1-4，默认 1)"
    if ($choice -eq "") { $choice = "1" }

    switch ($choice) {
        "1" {
            Write-Host ""
            Write-Ok "启动开发模式…"
            Write-Host "     前端: http://localhost:$FRONTEND_PORT   后端: http://localhost:$BACKEND_PORT" -ForegroundColor Cyan
            Write-Host "     按 Ctrl+C 停止" -ForegroundColor DarkGray
            Write-Host ""
            npm run dev
        }
        "2" {
            Write-Host ""
            Write-Ok "启动生产模式…"
            Write-Host "     前端: http://localhost:$FRONTEND_PORT   后端: http://localhost:$BACKEND_PORT" -ForegroundColor Cyan
            Write-Host "     按 Ctrl+C 停止" -ForegroundColor DarkGray
            Write-Host ""
            npm run start
        }
        "3" {
            Write-Host ""
            Write-Ok "以分窗模式启动（调用内置 start.ps1）…"
            Write-Host "     前端: http://localhost:$FRONTEND_PORT   后端: http://localhost:$BACKEND_PORT" -ForegroundColor Cyan
            Write-Host ""
            # 释放端口后启动
            $killScript = Join-Path $script:ProjectDir "scripts\kill-port.cjs"
            if (Test-Path $killScript) {
                node $killScript $BACKEND_PORT 2>$null
            }
            & (Join-Path $script:ProjectDir "start.ps1")
        }
        default {
            Write-Host ""
            Write-Hr
            Write-Ok "安装完成！使用以下命令启动："
            Write-Host ""
            Write-Host "     cd `"$($script:ProjectDir)`"" -ForegroundColor Green
            Write-Host "     npm run dev                   # 开发模式" -ForegroundColor Green
            Write-Host "     npm run start                 # 生产模式" -ForegroundColor Green
            Write-Host "     .\start.ps1                   # 内置分窗启动脚本" -ForegroundColor Green
            Write-Hr
        }
    }
}

# ────────────────────────────────────────────────────────────
# MAIN
# ────────────────────────────────────────────────────────────
function Main {
    Write-Banner
    Assert-ExecutionPolicy
    Check-Prerequisites
    Locate-Project
    Install-Deps
    Setup-Config
    Build-MantisBot
    Start-MantisBot

    Write-Host ""
    Write-Host "  ╔══════════════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "  ║   ✅  MantisBot 安装 & 启动完成！                ║" -ForegroundColor Green
    Write-Host "  ╚══════════════════════════════════════════════════╝" -ForegroundColor Green
    Write-Host ""
}

Main
