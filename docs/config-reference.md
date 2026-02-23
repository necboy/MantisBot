# MantisBot 配置参考

本文档详细说明 `config/config.json` 中每个配置项的作用和用法。

## 配置文件结构

```json
{
  "server": { ... },
  "models": [ ... ],
  "defaultModel": "...",
  "agent": { ... },
  "channels": { ... },
  "plugins": [ ... ],
  "workspace": "...",
  "allowedPaths": [ ... ],
  "officePreviewServer": "...",
  "enabledSkills": [ ... ],
  "activeProfile": "...",
  "reliability": { ... }
}
```

---

## server - 服务器配置

控制 HTTP/WebSocket 服务器的行为。

| 字段       | 类型    | 默认值        | 说明                                     |
| ---------- | ------- | ------------- | ---------------------------------------- |
| `host`   | string  | `"0.0.0.0"` | 服务器监听地址                           |
| `port`   | number  | `3000`      | 服务器端口                               |
| `cors`   | boolean | `true`      | 是否启用跨域支持                         |
| `wsPath` | string  | `"/ws"`     | WebSocket 路径                           |
| `bind`   | string  | -             | 绑定模式，可选 `"loopback"` 仅本地访问 |

### server.tunnel - 内网穿透配置

用于将本地服务暴露到公网，支持三种穿透方案：

| 字段        | 类型    | 默认值    | 说明             |
| ----------- | ------- | --------- | ---------------- |
| `enabled` | boolean | `false` | 是否启用内网穿透 |

#### DDNSTO 配置

```json
"ddnsto": {
  "enabled": true,
  "token": "your-token",
  "deviceIdx": 0,
  "deviceName": "optional-name"
}
```

| 字段           | 说明              |
| -------------- | ----------------- |
| `token`      | DDNSTO 账户 Token |
| `deviceIdx`  | 设备索引          |
| `deviceName` | 设备名称（可选）  |

#### Cloudflare Tunnel 配置

```json
"cloudflare": {
  "enabled": true,
  "token": "your-token",
  "tunnelId": "optional-tunnel-id",
  "credentialsFile": "optional-credentials-path"
}
```

#### FRP 配置

```json
"frp": {
  "enabled": true,
  "configPath": "/path/to/frpc.ini",
  "serverAddr": "frp.example.com",
  "serverPort": 7000,
  "token": "your-token",
  "localPort": 8118,
  "subdomain": "mantis"
}
```

---

## models - LLM 模型配置

配置可用的语言模型列表。

```json
"models": [
  {
    "name": "gpt-4",
    "protocol": "openai",
    "provider": "openai",
    "model": "gpt-4-turbo",
    "apiKey": "sk-xxx",
    "baseURL": "https://api.openai.com/v1"
  }
]
```

| 字段         | 类型   | 必填 | 说明                                      |
| ------------ | ------ | ---- | ----------------------------------------- |
| `name`     | string | ✅   | 模型显示名称（用于前端选择）              |
| `protocol` | string | -    | 协议类型：`"openai"` 或 `"anthropic"` |
| `provider` | string | -    | 提供商（见下表）                          |
| `model`    | string | ✅   | 实际模型 ID                               |
| `apiKey`   | string | -    | API 密钥（支持环境变量 `${VAR_NAME}`）  |
| `baseURL`  | string | -    | 自定义 API 端点                           |

### 支持的提供商

| provider      | 说明                 | 默认协议  |
| ------------- | -------------------- | --------- |
| `openai`    | OpenAI 官方          | openai    |
| `anthropic` | Anthropic (Claude)   | anthropic |
| `deepseek`  | DeepSeek             | openai    |
| `alibaba`   | 阿里百炼（通义千问） | openai    |
| `moonshot`  | Moonshot AI (Kimi)   | openai    |
| `zhipu`     | 智谱 AI (GLM)        | openai    |
| `minimax`   | MiniMax              | openai    |
| `xai`       | xAI (Grok)           | openai    |
| `google`    | Google AI (Gemini)   | openai    |
| `cohere`    | Cohere               | openai    |
| `ollama`    | Ollama 本地          | openai    |
| `custom`    | 自定义端点           | openai    |

---

## defaultModel - 默认模型

指定默认使用的模型名称，对应 `models` 数组中某个模型的 `name` 字段。

```json
"defaultModel": "gpt-4"
```

---

## agent - Agent 行为配置

控制 Agent 的核心行为。

```json
"agent": {
  "disablePreferenceDetector": true,
  "disableEvolutionProposer": true
}
```

| 字段                          | 类型    | 默认值    | 说明                 |
| ----------------------------- | ------- | --------- | -------------------- |
| `disablePreferenceDetector` | boolean | `false` | 禁用用户偏好检测功能 |
| `disableEvolutionProposer`  | boolean | `false` | 禁用演变提议生成功能 |

---

## channels - 通信渠道配置

配置各个通信渠道的连接信息。

### httpWs - Web UI 渠道

```json
"channels": {
  "httpWs": {
    "enabled": true
  }
}
```

### feishu - 飞书渠道

```json
"channels": {
  "feishu": {
    "enabled": true,
    "appId": "cli_xxx",
    "appSecret": "xxx",
    "verificationToken": "optional",
    "encryptKey": "optional"
  }
}
```

| 字段                  | 说明                       |
| --------------------- | -------------------------- |
| `appId`             | 飞书应用 ID                |
| `appSecret`         | 飞书应用密钥               |
| `verificationToken` | 事件订阅验证 Token（可选） |
| `encryptKey`        | 消息加密 Key（可选）       |

### slack - Slack 渠道

```json
"channels": {
  "slack": {
    "enabled": true,
    "botToken": "xoxb-xxx",
    "signingSecret": "xxx",
    "appToken": "xapp-xxx"
  }
}
```

### 其他渠道

| 渠道         | 说明       |
| ------------ | ---------- |
| `dingtalk` | 钉钉       |
| `wecom`    | 企业微信   |
| `whatsapp` | WhatsApp   |
| `wechat`   | 微信公众号 |

---

## plugins - 插件配置

控制 Agent 可用的工具（Tools）。

```json
"plugins": [
  { "name": "logger", "enabled": true },
  { "name": "browser", "enabled": true }
]
```

### 可用插件

| 插件名      | 工具                                                             | 说明               |
| ----------- | ---------------------------------------------------------------- | ------------------ |
| `logger`  | `logger`                                                       | 日志记录工具       |
| `browser` | `browser_navigate`, `browser_click`, `browser_snapshot` 等 | 浏览器自动化工具集 |

### 核心工具（始终可用）

以下工具无需配置，始终可用：

| 工具名            | 说明         |
| ----------------- | ------------ |
| `read`          | 读取文件     |
| `write`         | 写入文件     |
| `edit`          | 编辑文件     |
| `exec`          | 执行命令     |
| `read_skill`    | 读取技能内容 |
| `send_file`     | 发送文件附件 |
| `memory_search` | 搜索记忆     |

---

## workspace - 工作目录

Agent 的工作目录，用于存储数据文件。

```json
"workspace": "./data"
```

---

## allowedPaths - 允许访问的路径

Agent 可以访问的宿主机目录列表。

```json
"allowedPaths": [
  "/Users/username",
  "/Users/Shared"
]
```

**安全提示**：仅在 Docker 部署时需要在 `docker-compose.yml` 中挂载这些目录。

---

## officePreviewServer - Office 预览服务

Office 文件预览服务器地址（需要单独部署）。

```json
"officePreviewServer": "http://localhost:8081"
```

---

## enabledSkills - 启用的技能

配置 Agent 可用的技能列表。采用「默认禁用」策略：只有列出的技能才会启用。

```json
"enabledSkills": [
  "brainstorming",
  "docx",
  "pdf",
  "canvas",
  "frontend-design"
]
```

**注意**：自行创建或下载的Skills需要在web页面或者配置文件中启用才可

### 可用技能

运行时从 `skills/` 目录自动加载，当前包含 60+ 个技能。

---

## activeProfile - Agent 性格

指定 Agent 的性格配置。

```json
"activeProfile": "default"
```

---

## reliability - 可靠性配置

控制错误处理和重试机制。

```json
"reliability": {
  "enabled": true,
  "circuitBreaker": {
    "enabled": true,
    "failureThreshold": 5,
    "resetTimeoutMs": 60000,
    "monitoringWindowMs": 120000
  },
  "retry": {
    "enabled": true,
    "maxAttempts": 3,
    "baseDelayMs": 1000,
    "maxDelayMs": 30000,
    "backoffStrategy": "exponential"
  },
  "errorReporting": {
    "enabled": true,
    "logErrors": true,
    "trackMetrics": true
  }
}
```

### circuitBreaker - 熔断器

| 字段                   | 说明                       |
| ---------------------- | -------------------------- |
| `failureThreshold`   | 触发熔断的失败次数         |
| `resetTimeoutMs`     | 熔断后重置等待时间（毫秒） |
| `monitoringWindowMs` | 监控窗口时间（毫秒）       |

### retry - 重试配置

| 字段                | 说明                                                   |
| ------------------- | ------------------------------------------------------ |
| `maxAttempts`     | 最大重试次数                                           |
| `baseDelayMs`     | 基础延迟时间（毫秒）                                   |
| `maxDelayMs`      | 最大延迟时间（毫秒）                                   |
| `backoffStrategy` | 退避策略：`"linear"`, `"exponential"`, `"fixed"` |

### errorReporting - 错误报告

| 字段             | 说明             |
| ---------------- | ---------------- |
| `logErrors`    | 是否记录错误日志 |
| `trackMetrics` | 是否跟踪错误指标 |

---

## 可选配置

以下配置为可选项，通常不需要配置：

### memory - 记忆系统配置

```json
"memory": {
  "enabled": true,
  "vectorDimension": 1536
}
```

### session - 会话配置

```json
"session": {
  "maxInputChars": 80000,
  "maxMessages": 100,
  "ttlDays": 30
}
```

| 字段              | 说明                         |
| ----------------- | ---------------------------- |
| `maxInputChars` | 传入 LLM 的最大字符数        |
| `maxMessages`   | 单个会话最多保留的消息数     |
| `ttlDays`       | 会话过期天数（0 表示不过期） |

---

## 环境变量

配置值支持使用环境变量：

```json
{
  "apiKey": "${ANTHROPIC_API_KEY}"
}
```

系统会自动将 `${VAR_NAME}` 替换为对应的环境变量值。

---

## 完整配置示例

```json
{
  "server": {
    "host": "0.0.0.0",
    "port": 8118,
    "cors": true,
    "wsPath": "/ws",
    "bind": "loopback",
    "tunnel": {
      "enabled": false
    }
  },
  "models": [
    {
      "name": "claude",
      "protocol": "anthropic",
      "provider": "anthropic",
      "model": "claude-sonnet-4-20250514",
      "apiKey": "${ANTHROPIC_API_KEY}"
    }
  ],
  "defaultModel": "claude",
  "plugins": [
    { "name": "logger", "enabled": true },
    { "name": "browser", "enabled": true }
  ],
  "workspace": "./data",
  "allowedPaths": ["/Users/username"],
  "enabledSkills": ["brainstorming", "pdf"],
  "activeProfile": "default"
}
```
