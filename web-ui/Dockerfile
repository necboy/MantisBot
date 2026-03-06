FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# 接收从 Makefile buildx-webui 传入的 VERSION build-arg，
# 设置为环境变量供 vite.config.ts 读取，避免依赖上级目录的 package.json
ARG VERSION=0.0.0
ENV VERSION=${VERSION}

RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
