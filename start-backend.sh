#!/bin/bash

# MantisBot 后端启动脚本（新架构）
# 自动清理旧进程，确保只有一个实例运行

echo "🧹 清理旧进程..."
pkill -f "tsx.*src/entry.ts" 2>/dev/null
sleep 1

# 确认清理完成
REMAINING=$(ps aux | grep -E "tsx.*src/entry.ts" | grep -v grep | wc -l)
if [ "$REMAINING" -gt 0 ]; then
    echo "⚠️  强制清理残留进程..."
    pkill -9 -f "tsx.*src/entry.ts" 2>/dev/null
    sleep 1
fi

echo "✅ 旧进程已清理"

# 检查端口是否被监听（默认 8118，与配置文件一致）
PORT=${PORT:-8118}
if lsof -i :$PORT -sTCP:LISTEN > /dev/null 2>&1; then
    echo "❌ 端口 $PORT 已被占用"
    lsof -i :$PORT -sTCP:LISTEN
    exit 1
fi

echo "🚀 启动 MantisBot 后端..."
cd "$(dirname "$0")"

# 检查 node_modules
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖..."
    npm install
fi

# 启动并保存日志
npx tsx watch src/entry.ts 2>&1 | tee /tmp/mantis-backend.log &

sleep 3
echo "✅ MantisBot 后端已启动"
echo "🌐 访问地址: http://localhost:$PORT"
echo "📋 查看日志: tail -f /tmp/mantis-backend.log"
echo "🔍 查看进程: ps aux | grep 'tsx.*entry.ts'"
