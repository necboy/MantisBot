FROM node:20-bookworm

WORKDIR /app

# 安装编译 native 模块所需的依赖，以及完整的 Python 环境
# 同时安装 Playwright Chromium 所需的系统依赖和中文字体
RUN apt-get update && apt-get install -y \
  python3 \
  python3-pip \
  python3-venv \
  make \
  g++ \
  # Playwright Chromium 依赖
  libnspr4 \
  libnss3 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libdbus-1-3 \
  libcups2 \
  libxkbcommon0 \
  libatspi2.0-0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libasound2 \
  # 中文字体支持（用于 Playwright 截图）
  fonts-wqy-zenhei \
  fonts-wqy-microhei \
  fonts-noto-cjk \
  && rm -rf /var/lib/apt/lists/*

# 创建 Python 虚拟环境目录（用于持久化用户安装的包）
RUN mkdir -p /app/python-venv

# 复制启动脚本
COPY docker-entrypoint.sh /app/
RUN chmod +x /app/docker-entrypoint.sh

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 复制源码（需要在 rebuild 之前，因为某些 native 模块依赖源码）
COPY . .

# 安装依赖（包括 devDependencies，因为需要 tsc）
# 使用 --legacy-peer-deps 解决 zod 版本冲突（openai 需要 zod@3，但项目使用 zod@4）
# PUPPETEER_SKIP_DOWNLOAD=true 跳过 puppeteer 的浏览器下载（项目使用 Playwright，无需 puppeteer 的浏览器）
RUN PUPPETEER_SKIP_DOWNLOAD=true npm ci --legacy-peer-deps

# 重新编译 native 模块（适配 Linux，必须在 npm ci 之后）
RUN npm rebuild better-sqlite3

# 编译 TypeScript
RUN npm run build

# 预装 Playwright Chromium（打包进镜像，避免服务器启动时下载）
RUN npx playwright install chromium

# 备份内置 skills，供首次启动时初始化持久化卷
RUN cp -r /app/skills /app/skills-default

# 备份默认人格文件，供首次启动时初始化
RUN cp -r /app/data/agent-profiles /app/agent-profiles-default

# 暴露端口
EXPOSE 8118

# 启动命令（使用 bash 执行脚本）
CMD ["bash", "/app/docker-entrypoint.sh"]
