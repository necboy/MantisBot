#!/bin/bash
set -e

# 确保 Python 虚拟环境存在且可用
if [ ! -f "/app/python-venv/bin/activate" ]; then
  echo "[Entrypoint] Creating Python virtual environment..."
  python3 -m venv /app/python-venv
fi

# 激活虚拟环境（使用 . 代替 source，兼容 sh）
. /app/python-venv/bin/activate

# 检查基础包是否已安装，如果没有则安装
if ! python3 -c "import requests" 2>/dev/null; then
  echo "[Entrypoint] Installing Python packages for skills..."

  # 核心包
  pip install --no-cache-dir \
    requests \
    httpx \
    aiohttp \
    beautifulsoup4 \
    lxml \
    defusedxml \
    pyyaml

  # 数据处理
  pip install --no-cache-dir \
    pandas \
    numpy

  # PDF 处理
  pip install --no-cache-dir \
    pypdf \
    pdfplumber \
    pdf2image

  # 图像处理
  pip install --no-cache-dir \
    Pillow

  # Office 文件处理
  pip install --no-cache-dir \
    openpyxl \
    python-docx \
    python-pptx

  # 股票数据
  pip install --no-cache-dir \
    yfinance

  # MCP 和 Claude API
  pip install --no-cache-dir \
    anthropic \
    mcp

  echo "[Entrypoint] Python packages installed successfully!"
fi

# 检查 Playwright Chromium 是否已安装
if [ ! -d "/root/.cache/ms-playwright/chromium-"* ] 2>/dev/null; then
  echo "[Entrypoint] Installing Playwright Chromium..."
  # 使用项目中的 playwright 依赖安装浏览器
  npx playwright install chromium
  echo "[Entrypoint] Playwright Chromium installed successfully!"
fi

# 启��应用
exec node dist/entry.js
