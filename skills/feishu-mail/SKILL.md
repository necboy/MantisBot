---
name: feishu-mail
description: 管理飞书邮箱（查询邮件、读取详情、搜索）。当用户想要查看飞书邮箱、查询邮件、搜索邮件时使用。
---

# Feishu Mail

管理飞书企业邮箱。

## 配置

邮箱配置已保存，连接信息：
- IMAP: imap.feishu.cn:993
- SMTP: smtp.feishu.cn:465
- 账户: [用户提供的邮箱地址]

## 使用方法

### 查询最近邮件

运行脚本查看最近邮件：

```bash
python3 scripts/feishu_mail.py recent [数量]
```

示例：
```bash
python3 scripts/feishu_mail.py recent 5
```

### 搜索邮件

按关键词搜索邮件：

```bash
python3 scripts/feishu_mail.py search <关键词>
```

示例：
```bash
python3 scripts/feishu_mail.py search 发票
```

### 查看邮件详情

根据邮件 ID 查看详细内容：

```bash
python3 scripts/feishu_mail.py read <邮件ID>
```

### 查看未读邮件

```bash
python3 scripts/feishu_mail.py unread
```

### 查看文件夹

```bash
python3 scripts/feishu_mail.py folders
```

## 常用场景

- "帮我查一下飞书邮箱"
- "查查最近几封邮件"
- "搜索一下xxx主题的邮件"
- "看看有没有未读邮件"
