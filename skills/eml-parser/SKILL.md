---
name: eml-parser
description: 使用 Python email 标准库专业解析 .eml 邮件文件。支持提取发件人、收件人、主题、正文（纯文本/HTML）、附件等。触发词：解析eml、读取邮件文件、eml文件、提取邮件附件、parse email。
---

# EML Parser

解析 .eml 邮件文件，提取完整邮件信息。

## 使用方式

```bash
python ~/.claude/skills/eml-parser/scripts/parse_eml.py <eml_file> [options]
```

### 参数

| 参数 | 说明 |
|------|------|
| `eml_file` | .eml 文件路径（必需） |
| `--output-dir DIR` | 附件保存目录（默认：当前目录） |
| `--save-attachments` | 保存附件到指定目录 |
| `--json` | JSON 格式输出 |
| `--raw` | 输出原始邮件头 |

## 输出内容

1. **邮件头信息**
   - Subject（主题）
   - From（发件人）
   - To / Cc / Bcc（收件人）
   - Date（日期）

2. **邮件正文**
   - 纯文本内容
   - HTML 内容（如有）

3. **附件列表**
   - 文件名
   - MIME 类型
   - 大小

## 示例

```
用户：解析这个邮件文件 /path/to/email.eml
→ 使用此技能运行 parse_eml.py 提取邮件内容

用户：提取 /path/to/email.eml 的附件
→ 运行 parse_eml.py --save-attachments --output-dir ./attachments
```

## 工作流程

1. 读取 .eml 文件
2. 使用 Python email 库解析
3. 提取邮件头、正文、附件信息
4. 根据用户需求保存附件或输出 JSON
