#!/bin/bash
# ============================================================
#  MantisBot 智能安装脚本 v1.0
#  Intelligent Installer for macOS / Linux
#
#  用法 / Usage:
#    curl -fsSL https://raw.githubusercontent.com/necboy/MantisBot/main/install.sh | bash
#  或下载后执行 / or run locally:
#    chmod +x install.sh && ./install.sh
# ============================================================

set -e

# ── 颜色 / Colors ───────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# ── 配置 / Config ────────────────────────────────────────────
REPO_URL="https://github.com/necboy/MantisBot.git"
MIN_NODE_MAJOR=22
MIN_NODE_MINOR=22
BACKEND_PORT=8118
FRONTEND_PORT=3000
PROJECT_DIR=""

# ── 安装选项 / Install Options ────────────────────────────────
MIRROR=false
SKIP_BUILD=false
INSTALL_DIR=""

# ── 工具函数 / Helpers ────────────────────────────────────────
print_banner() {
  echo -e "${CYAN}"
  echo "  ╔══════════════════════════════════════════════════╗"
  echo "  ║    🤖  MantisBot  智能安装脚本  v1.0             ║"
  echo "  ║        Intelligent Installer for macOS/Linux     ║"
  echo "  ╚══════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

step()  { echo -e "\n${BOLD}${BLUE}▶  $*${NC}"; }
ok()    { echo -e "   ${GREEN}✓${NC}  $*"; }
warn()  { echo -e "   ${YELLOW}⚠${NC}  $*"; }
err()   { echo -e "   ${RED}✗${NC}  $*"; }
info()  { echo -e "   ${DIM}$*${NC}"; }
hr()    { echo -e "   ${DIM}──────────────────────────────────────────${NC}"; }

cmd_exists() { command -v "$1" >/dev/null 2>&1; }

# ── 帮助信息 / Info ───────────────────────────────────────────
show_info() {
  echo -e "   ${BOLD}What this script does:${NC}"
  echo -e "   ${DIM}  1.  Check prerequisites  (Node.js ${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}+, npm, git)${NC}"
  echo -e "   ${DIM}  2.  Clone or locate the MantisBot project${NC}"
  echo -e "   ${DIM}  3.  Install npm dependencies${NC}"
  echo -e "   ${DIM}  4.  Initialize configuration${NC}"
  echo -e "   ${DIM}  5.  Build backend + frontend${NC}"
  echo -e "   ${DIM}  6.  Launch  (choose dev / prod / background)${NC}"
  echo ""
  hr
  echo -e "   ${BOLD}Options:${NC}"
  echo -e "   ${GREEN}  --mirror${NC}              Use npmmirror CDN  (faster in China)"
  echo -e "   ${GREEN}  --skip-build${NC}          Skip the TypeScript + frontend build step"
  echo -e "   ${GREEN}  --install-dir <path>${NC}  Custom install directory  (default: ./MantisBot)"
  hr
}

confirm_continue() {
  echo ""
  if [[ -e /dev/tty ]]; then
    read -rp "   Press Enter to begin installation, or Ctrl+C to cancel... " </dev/tty 2>/dev/null || true
  fi
  echo ""
}

# 错误退出前暂停，让用户看清提示（仅交互式终端下生效）
pause_exit() {
  local code="${1:-1}"
  echo ""
  if [[ -t 2 ]]; then
    read -rp "   按回车键退出 / Press Enter to exit..." </dev/tty 2>/dev/null || true
  fi
  exit "$code"
}

node_major() {
  node --version 2>/dev/null | sed 's/v//' | cut -d. -f1
}

node_minor() {
  node --version 2>/dev/null | sed 's/v//' | cut -d. -f2
}

# ────────────────────────────────────────────────────────────
# STEP 1: 检查系统依赖
# ────────────────────────────────────────────────────────────
check_prerequisites() {
  step "检查系统依赖 / Checking Prerequisites"

  local missing=()
  local IS_MAC=false
  local NODE_NEEDS_UPGRADE=false
  [[ "$(uname)" == "Darwin" ]] && IS_MAC=true

  # ── Node.js ────────────────────────────────────────────────
  if cmd_exists node; then
    local major minor
    major=$(node_major)
    minor=$(node_minor)
    if [[ "$major" -gt "$MIN_NODE_MAJOR" ]] || \
       [[ "$major" -eq "$MIN_NODE_MAJOR" && "$minor" -ge "$MIN_NODE_MINOR" ]]; then
      ok "Node.js $(node --version)"
    else
      err "Node.js version too low  (current: v${major}.${minor}, required: v${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}+)"
      missing+=("nodejs")
      NODE_NEEDS_UPGRADE=true
    fi
  else
    err "Node.js not found"
    missing+=("nodejs")
  fi

  # ── npm ────────────────────────────────────────────────────
  if cmd_exists npm; then
    ok "npm $(npm --version)"
  else
    err "未找到 npm"
    missing+=("npm")
  fi

  # ── git ────────────────────────────────────────────────────
  if cmd_exists git; then
    ok "git $(git --version | awk '{print $3}')"
  else
    warn "未找到 git  (克隆仓库必须)"
    missing+=("git")
  fi

  # ── 缺失依赖提示 ────────────────────────────────────────────
  if [[ ${#missing[@]} -gt 0 ]]; then
    echo ""
    warn "Missing dependencies detected. How to fix:"
    hr
    if [[ " ${missing[*]} " =~ " nodejs " ]]; then
      if $NODE_NEEDS_UPGRADE; then
        info "Node.js v${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}+ required. Upgrade options:"
      else
        info "Node.js v${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}+ not found. Install options:"
      fi
      if $IS_MAC; then
        if ! cmd_exists brew; then
          info "  brew (install first):  /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
        fi
        if $NODE_NEEDS_UPGRADE; then
          info "  brew:   brew upgrade node  (or: brew install node@${MIN_NODE_MAJOR})"
        else
          info "  brew:   brew install node@${MIN_NODE_MAJOR}"
        fi
      else
        info "  Ubuntu/Debian:  curl -fsSL https://deb.nodesource.com/setup_${MIN_NODE_MAJOR}.x | sudo -E bash - && sudo apt-get install -y nodejs"
        info "  CentOS/RHEL:    curl -fsSL https://rpm.nodesource.com/setup_${MIN_NODE_MAJOR}.x | sudo bash - && sudo yum install -y nodejs"
      fi
      info "  nvm:    nvm install ${MIN_NODE_MAJOR} && nvm use ${MIN_NODE_MAJOR}"
      info "  web:    https://nodejs.org/en/download  (select LTS)"
    fi
    if [[ " ${missing[*]} " =~ " git " ]]; then
      if $IS_MAC; then
        info "  git:    brew install git"
      else
        info "  git:    sudo apt-get install -y git"
      fi
    fi
    echo ""
    err "Please install the above dependencies and re-run this script"
    pause_exit 1
  fi
}

# ────────────────────────────────────────────────────────────
# STEP 2: 定位 / 下载项目
# ───���────────────────────────────────────────────────────────
locate_project() {
  step "定位项目目录 / Locating Project"

  # 已在项目目录内
  if [[ -f "package.json" ]] && grep -q '"name": "mantis-bot"' package.json 2>/dev/null; then
    PROJECT_DIR="$(pwd)"
    ok "已在项目目录：$PROJECT_DIR"
    return
  fi

  # 同级 MantisBot 子目录
  if [[ -d "MantisBot" && -f "MantisBot/package.json" ]]; then
    PROJECT_DIR="$(pwd)/MantisBot"
    ok "找到项目目录：$PROJECT_DIR"
    cd "$PROJECT_DIR"
    return
  fi

  # 需要克隆
  if ! cmd_exists git; then
    err "需要 git 来下载项目"
    info "请手动下载 ZIP：$REPO_URL/archive/refs/heads/main.zip"
    pause_exit 1
  fi

  echo ""
  local default_dir="${INSTALL_DIR:-$(pwd)/MantisBot}"
  read -rp "   Install directory (Enter for default: $default_dir): " input_dir
  local target="${input_dir:-$default_dir}"

  if [[ -d "$target" ]]; then
    warn "目录已存在：$target"
    read -rp "   继续 / continue? (y/N): " yn
    [[ "$yn" != "y" && "$yn" != "Y" ]] && { info "已取消"; exit 0; }
  fi

  echo ""
  info "正在克隆仓库，请稍候..."
  if git clone --depth=1 "$REPO_URL" "$target"; then
    PROJECT_DIR="$target"
    ok "克隆完成：$PROJECT_DIR"
    cd "$PROJECT_DIR"
  else
    err "克隆失败，请检查网络或手动下载"
    pause_exit 1
  fi
}

# ────────────────────────────────────────────────────────────
# STEP 3: 安装 npm 依赖
# ────────────────────────────────────────────────────────────
install_deps() {
  step "安装 npm 依赖 / Installing Dependencies"
  info "首次安装可能需要 2~5 分钟，请耐心等待..."
  echo ""

  local npm_args=(install)
  if $MIRROR; then
    npm_args+=(--registry https://registry.npmmirror.com)
    info "Using npmmirror registry (faster in China)"
  fi

  if npm "${npm_args[@]}"; then
    echo ""
    ok "依赖安装完成"
  else
    echo ""
    err "依赖安装失败，尝试以下方案："
    info "1. 国内镜像加速：npm install --registry https://registry.npmmirror.com"
    info "2. 清除缓存后重试：npm cache clean --force && npm install"
    info "3. 使用代理：export https_proxy=http://127.0.0.1:7890 && npm install"
    pause_exit 1
  fi
}

# ────────────────────────────────────────────────────────────
# STEP 4: 初始化配置
# ────────────────────────────────────────────────────────────
setup_config() {
  step "初始化配置 / Configuration Setup"

  local cfg="config/config.json"
  local tpl="config/config.example.json"

  if [[ -f "$cfg" ]]; then
    ok "配置文件已存在：$cfg"
  elif [[ -f "$tpl" ]]; then
    cp "$tpl" "$cfg"
    ok "已从示例文件创建：$cfg"
  else
    warn "未找到示例配置，后端将在首次运行时自动生成默认配置"
  fi

  echo ""
  echo -e "   ${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "   ${YELLOW}  请编辑 $cfg 配置 AI 模型 API Key${NC}"
  echo -e "   ${DIM}  支持：Anthropic Claude / OpenAI / MiniMax / Qwen / GLM 等${NC}"
  echo -e "   ${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""

  # 可选：配置 API Key 环境变量
  read -rp "   是否现在设置 Anthropic API Key 环境变量? (y/N): " set_key
  if [[ "$set_key" == "y" || "$set_key" == "Y" ]]; then
    read -rsp "   输入 API Key (输入不会显示): " api_key
    echo ""
    if [[ -n "$api_key" ]]; then
      export ANTHROPIC_API_KEY="$api_key"
      # ��入 shell 配置文件
      local shell_rc="$HOME/.bashrc"
      [[ "$SHELL" == *"zsh"* ]] && shell_rc="$HOME/.zshrc"
      # 先移除旧的条目再追加
      if grep -q "ANTHROPIC_API_KEY" "$shell_rc" 2>/dev/null; then
        sed -i.bak '/ANTHROPIC_API_KEY/d' "$shell_rc"
      fi
      echo "export ANTHROPIC_API_KEY=\"$api_key\"" >> "$shell_rc"
      ok "API Key 已写入 $shell_rc，当前会话已生效"
    else
      warn "API Key 为空，跳过"
    fi
  fi
}

# ────────────────────────────────────────────────────────────
# STEP 5: 编译项目
# ─────────────────────────────────────────────────���──────────
build_project() {
  if $SKIP_BUILD; then
    step "Skipping build (--skip-build)"
    return
  fi

  step "编译项目 / Building Project"
  info "编译 TypeScript 后端 + Vite 前端..."
  echo ""

  if npm run build:all; then
    echo ""
    ok "编译完成"
  else
    echo ""
    err "编译失败，请检查错误信息"
    pause_exit 1
  fi
}

# ────────────────────────────────────────────────────────────
# STEP 5b: 安装 Playwright Chromium 浏览器
# ────────────────────────────────────────────────────────────
install_playwright_browser() {
  step "安装 Playwright Chromium 浏览器 / Installing Playwright Chromium Browser"
  info "正在下载 Chromium，用于浏览器自动化功能..."
  echo ""

  if npx playwright install chromium; then
    echo ""
    ok "Chromium 浏览器安装完成"
  else
    echo ""
    warn "Chromium 安装失败，浏览器自动化功能可能无法使用"
    info "可手动重试：npx playwright install chromium"
  fi
}

# ────────────────────────────────────────────────────────────
# STEP 6: 启动
# ────────────────────────────────────────────────────────────
start_project() {
  step "启动 MantisBot / Launch"

  echo ""
  echo -e "   请选择启动模式 / Choose start mode:"
  echo ""
  echo -e "   ${BOLD}1)${NC}  开发模式  ${DIM}(热重载 · 前后端合并日志 · 推荐开发时使用)${NC}"
  echo -e "   ${BOLD}2)${NC}  生产模式  ${DIM}(已编译版本 · 推荐正式部署)${NC}"
  echo -e "   ${BOLD}3)${NC}  后台模式  ${DIM}(后端后台运行，前端另开窗口)${NC}"
  echo -e "   ${BOLD}4)${NC}  稍后手动启动"
  echo ""
  read -rp "   选择 (1-4，默认 1): " choice
  choice="${choice:-1}"

  local cyan_url="${CYAN}http://localhost:${FRONTEND_PORT}${NC}"
  local api_url="${CYAN}http://localhost:${BACKEND_PORT}${NC}"

  case "$choice" in
    1)
      echo ""
      ok "启动开发模式…"
      echo -e "   前端: $cyan_url   后端: $api_url"
      echo -e "   ${DIM}按 Ctrl+C 停止${NC}"
      echo ""
      npm run dev
      ;;
    2)
      echo ""
      ok "启动生产模式…"
      echo -e "   前端: $cyan_url   后端: $api_url"
      echo -e "   ${DIM}按 Ctrl+C 停止${NC}"
      echo ""
      npm run start
      ;;
    3)
      echo ""
      ok "以后台模式启动后端…"
      nohup node dist/entry.js > /tmp/mantis-backend.log 2>&1 &
      local pid=$!
      echo "   后端 PID: $pid  |  日志: tail -f /tmp/mantis-backend.log"
      echo ""
      ok "启动前端开发服务器…"
      echo -e "   前端: $cyan_url   后端: $api_url"
      npm --prefix web-ui run dev
      ;;
    4|*)
      echo ""
      hr
      ok "安装完成！使用以下命令启动："
      echo ""
      echo -e "   ${GREEN}cd ${PROJECT_DIR}${NC}"
      echo -e "   ${GREEN}npm run dev${NC}    ${DIM}# 开发模式${NC}"
      echo -e "   ${GREEN}npm run start${NC}  ${DIM}# 生产模式${NC}"
      echo -e "   ${GREEN}./start.sh${NC}     ${DIM}# 使用内置启动脚本${NC}"
      hr
      ;;
  esac
}

# ────────────────────────────────────────────────────────────
# MAIN
# ────────────────────────────────────────────────────────────
main() {
  # ── 解析命令行参数 ────────────────────────────────────────────
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --mirror)       MIRROR=true; shift ;;
      --skip-build)   SKIP_BUILD=true; shift ;;
      --install-dir)  INSTALL_DIR="${2:-}"; shift 2 ;;
      --help|-h)      print_banner; show_info; exit 0 ;;
      *)              warn "Unknown option: $1"; shift ;;
    esac
  done

  print_banner
  show_info
  confirm_continue

  check_prerequisites
  locate_project
  install_deps
  setup_config
  build_project
  install_playwright_browser
  start_project

  echo ""
  echo -e "${GREEN}${BOLD}  ╔════════════���═════════════════════════════════╗${NC}"
  echo -e "${GREEN}${BOLD}  ║   ✅  MantisBot 安装 & 启动完成！            ║${NC}"
  echo -e "${GREEN}${BOLD}  ╚══════════════════════════════════════════════╝${NC}"
  echo ""
}

main "$@"
