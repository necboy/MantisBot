#!/bin/bash

# MantisBot 前端启动脚本

echo "🎨 启动 MantisBot 前端..."
cd "$(dirname "$0")/web-ui"

# 检查 node_modules
if [ ! -d "node_modules" ]; then
    echo "📦 安装前端依赖..."
    npm install
fi

# 启动开发服务器
echo "🚀 启动开发服务器..."
npm run dev
