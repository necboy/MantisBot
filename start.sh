#!/bin/bash

# MantisBot 统一启动脚本
# 同时启动前后端服务

echo "🤖 MantisBot 启动中..."
echo "================================"

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 启动后端
echo ""
echo "📡 启动后端服务..."
"$SCRIPT_DIR/start-backend.sh"

# 等待后端启动
sleep 2

# 启动前端
echo ""
echo "🖼️  启动前端服务..."
"$SCRIPT_DIR/start-frontend.sh" &
FRONTEND_PID=$!

echo ""
echo "================================"
echo "✅ MantisBot 已启动！"
echo ""
echo "📌 访问地址:"
echo "   前端: http://localhost:3000"
echo "   后端: http://localhost:8118"
echo ""
echo "📋 日志文件:"
echo "   后端日志: tail -f /tmp/mantis-backend.log"
echo ""
echo "🛑 停止服务:"
echo "   后端: pkill -f 'tsx.*entry.ts'"
echo "   前端: pkill -f 'vite'"
echo ""
echo "按 Ctrl+C 停止所有服务..."

# 等待前端进程
wait $FRONTEND_PID
