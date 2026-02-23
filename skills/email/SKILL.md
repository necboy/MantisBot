---
name: email
description: 通过 IMAP/SMTP 管理邮箱账户，支持收信、发信、搜索、附件等功能。当用户想要查看邮件、发送邮���、搜索邮件、下载附件时使用此技能。
---

# Email Skill

通过 IMAP/SMTP 协议管理邮箱账户，支持 Gmail、Outlook、163.com、126.com、QQ Mail、Feishu Mail 等主流邮箱服务。

## 配置

邮箱账户配置在 `config/config.json` 的 `email` 节点中管理。可通过 Web UI 设置面板的「邮件配置」进行可视化配置。

## 支持的邮件服务商

| 服务商 | IMAP 服务器 | SMTP 服务器 |
|--------|-------------|-------------|
| Gmail | imap.gmail.com:993 | smtp.gmail.com:465 |
| Outlook | outlook.office365.com:993 | smtp.office365.com:587 |
| 163.com | imap.163.com:993 | smtp.163.com:465 |
| 126.com | imap.126.com:993 | smtp.126.com:465 |
| QQ Mail | imap.qq.com:993 | smtp.qq.com:465 |
| Feishu Mail | imap.feishu.cn:993 | smtp.feishu.cn:465 |
| Yahoo | imap.mail.yahoo.com:993 | smtp.mail.yahoo.com:465 |
| iCloud | imap.mail.me.com:993 | smtp.mail.me.com:587 |

**重要提示**：
- Gmail: 需要启用两步验证并生成应用专用密码
- 163/126/QQ: 需要在网页端开启 IMAP/SMTP 服务，使用授权码而非登录密码

## IMAP 命令（收信）

### check - 检查新邮件

```bash
node scripts/imap.js check [--account <账户ID>] [--limit 10] [--mailbox INBOX] [--recent 2h] [--unseen]
```

选项：
- `--account <id>`: 指定账户（可选，默认使用默认账户）
- `--limit <n>`: 最大结果数（默认 10）
- `--mailbox <name>`: 邮箱文件夹（默认 INBOX）
- `--recent <time>`: 只显示最近邮件（如 30m, 2h, 7d）
- `--unseen`: 只显示未读邮件

### fetch - 获取完整邮件

```bash
node scripts/imap.js fetch <uid> [--account <账户ID>] [--mailbox INBOX]
```

### search - 搜索邮件

```bash
node scripts/imap.js search [选项]
```

选项：
- `--account <id>`: 指定账户
- `--unseen`: 只看未读
- `--seen`: 只看已读
- `--from <email>`: 发件人包含
- `--subject <text>`: 主题包含
- `--recent <time>`: 最近时间（如 30m, 2h, 7d）
- `--since <date>`: 指定日期之后（YYYY-MM-DD）
- `--before <date>`: 指定日期之前（YYYY-MM-DD）
- `--limit <n>`: 最大结果数（默认 20）
- `--mailbox <name>`: 邮箱文件夹（默认 INBOX）

### download - 下载附件

```bash
node scripts/imap.js download <uid> [--account <账户ID>] [--mailbox INBOX] [--dir <目录>] [--file <文件名>]
```

选项：
- `--dir <path>`: 保存目录（默认当前目录）
- `--file <filename>`: 只下载指定文件（默认下载全部）

### mark-read / mark-unread - 标记已读/未读

```bash
node scripts/imap.js mark-read <uid> [uid2 uid3...] [--account <账户ID>]
node scripts/imap.js mark-unread <uid> [uid2 uid3...] [--account <账户ID>]
```

### list-mailboxes - 列出邮箱文件夹

```bash
node scripts/imap.js list-mailboxes [--account <账户ID>]
```

## SMTP 命令（发信）

### send - 发送邮件

```bash
node scripts/smtp.js send --to <收件人> --subject <主题> [选项]
```

**必需参数**：
- `--to <email>`: 收件人（多个用逗号分隔）
- `--subject <text>`: 主题

**可选参数**：
- `--account <id>`: 指定账户
- `--body <text>`: 纯文本正文
- `--html`: 将 body 作为 HTML 发送
- `--body-file <file>`: 从文件读取正文
- `--html-file <file>`: 从文件读取 HTML
- `--cc <email>`: 抄送
- `--bcc <email>`: 密送
- `--attach <file>`: 附件（多个用逗号分隔）
- `--from <email>`: 覆盖发件人

**示例**：

```bash
# 简单文本邮件
node scripts/smtp.js send --to recipient@example.com --subject "Hello" --body "World"

# HTML 邮件
node scripts/smtp.js send --to recipient@example.com --subject "Newsletter" --html --body "<h1>Welcome</h1>"

# 带附件
node scripts/smtp.js send --to recipient@example.com --subject "Report" --body "Please find attached" --attach report.pdf

# 多个收件人
node scripts/smtp.js send --to "a@example.com,b@example.com" --cc "c@example.com" --subject "Update" --body "Team update"

# 指定账户
node scripts/smtp.js send --to recipient@example.com --subject "Hello" --body "World" --account gmail-main
```

### test - 发送测试邮件

```bash
node scripts/smtp.js test [--account <账户ID>]
```

发送测试邮件到自己的邮箱。

### verify - 验证连接

```bash
node scripts/smtp.js verify [--account <账户ID>]
```

只验证 SMTP 连接，不发送邮件。

## 使用场景示例

- "帮我查一下有没有新邮件"
- "查看最近 2 小时的未读邮件"
- "给 xxx@example.com 发一封邮件，主题是..."
- "搜索一下关于「项目报告」的邮件"
- "下载这封邮件的附件"
- "把这几封邮件标记为已读"

## 注意事项

1. **密码安全**：邮箱密码/授权码存储在 config.json 中，请妥善保管配置文件
2. **多账户**：支持配置多个邮箱账户，通过 `--account` 参数指定
3. **163.com 兼容**：已实现 IMAP ID 扩展，确保与 163.com 等网易邮箱的兼容性
4. **附件大小**：大附件可能需要较长传输时间，请注意超时设置
