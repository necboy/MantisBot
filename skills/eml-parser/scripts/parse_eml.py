#!/usr/bin/env python3
"""
EML Parser - 专业解析 .eml 邮件文件
使用 Python email 标准库
"""

import argparse
import email
import email.policy
import json
import os
import re
import sys
from email.header import decode_header
from email.utils import parseaddr, parsedate_to_datetime
from pathlib import Path
from typing import Any


def decode_header_value(value: str) -> str:
    """解码邮件头中的编码字符串"""
    if not value:
        return ""

    decoded_parts = []
    for part, charset in decode_header(value):
        if isinstance(part, bytes):
            charset = charset or "utf-8"
            try:
                decoded_parts.append(part.decode(charset, errors="replace"))
            except (LookupError, UnicodeDecodeError):
                decoded_parts.append(part.decode("utf-8", errors="replace"))
        else:
            decoded_parts.append(part)

    return "".join(decoded_parts)


def get_email_address(header_value: str) -> dict:
    """解析邮件地址，返回名称和地址"""
    if not header_value:
        return {"name": "", "address": ""}

    decoded = decode_header_value(header_value)
    name, addr = parseaddr(decoded)
    return {"name": name, "address": addr}


def extract_body(msg: email.message.Message) -> dict:
    """提取邮件正文"""
    body = {"text": "", "html": ""}

    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            content_disposition = str(part.get("Content-Disposition", ""))

            if "attachment" in content_disposition:
                continue

            try:
                payload = part.get_payload(decode=True)
                if payload:
                    charset = part.get_content_charset() or "utf-8"
                    text = payload.decode(charset, errors="replace")

                    if content_type == "text/plain" and not body["text"]:
                        body["text"] = text
                    elif content_type == "text/html" and not body["html"]:
                        body["html"] = text
            except Exception:
                continue
    else:
        try:
            payload = msg.get_payload(decode=True)
            if payload:
                charset = msg.get_content_charset() or "utf-8"
                text = payload.decode(charset, errors="replace")
                content_type = msg.get_content_type()
                if content_type == "text/html":
                    body["html"] = text
                else:
                    body["text"] = text
        except Exception:
            pass

    return body


def extract_attachments(msg: email.message.Message, output_dir: str = None, save: bool = False) -> list:
    """提取附件信息，可选择保存"""
    attachments = []

    for part in msg.walk():
        content_disposition = str(part.get("Content-Disposition", ""))

        if "attachment" in content_disposition or part.get_filename():
            filename = part.get_filename()
            if filename:
                filename = decode_header_value(filename)
                content_type = part.get_content_type()
                payload = part.get_payload(decode=True)
                size = len(payload) if payload else 0

                attachment_info = {
                    "filename": filename,
                    "content_type": content_type,
                    "size": size,
                    "size_human": format_size(size)
                }

                if save and output_dir and payload:
                    os.makedirs(output_dir, exist_ok=True)
                    filepath = Path(output_dir) / filename

                    # 避免文件名冲突
                    counter = 1
                    while filepath.exists():
                        stem = filepath.stem
                        suffix = filepath.suffix
                        filepath = Path(output_dir) / f"{stem}_{counter}{suffix}"
                        counter += 1

                    filepath.write_bytes(payload)
                    attachment_info["saved_to"] = str(filepath)

                attachments.append(attachment_info)

    return attachments


def format_size(size: int) -> str:
    """格式化文件大小"""
    for unit in ["B", "KB", "MB", "GB"]:
        if size < 1024:
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} TB"


def parse_date(date_str: str) -> str:
    """解析邮件日期"""
    if not date_str:
        return ""

    try:
        dt = parsedate_to_datetime(date_str)
        return dt.strftime("%Y-%m-%d %H:%M:%S %Z")
    except Exception:
        return date_str


def parse_eml(filepath: str, output_dir: str = None, save_attachments: bool = False) -> dict:
    """解析 EML 文件"""
    path = Path(filepath)

    if not path.exists():
        raise FileNotFoundError(f"文件不存在: {filepath}")

    with open(path, "rb") as f:
        msg = email.message_from_binary_file(f, policy=email.policy.default)

    # 提取邮件头
    result = {
        "file": str(path.absolute()),
        "headers": {
            "subject": decode_header_value(msg.get("Subject", "")),
            "from": get_email_address(msg.get("From", "")),
            "to": [get_email_address(addr) for addr in msg.get_all("To", [])],
            "cc": [get_email_address(addr) for addr in msg.get_all("Cc", [])],
            "bcc": [get_email_address(addr) for addr in msg.get_all("Bcc", [])],
            "date": parse_date(msg.get("Date", "")),
            "message_id": msg.get("Message-ID", ""),
            "reply_to": get_email_address(msg.get("Reply-To", "")),
        },
        "body": extract_body(msg),
        "attachments": extract_attachments(msg, output_dir, save_attachments),
        "attachment_count": 0
    }

    result["attachment_count"] = len(result["attachments"])

    return result


def print_result(result: dict, show_raw: bool = False):
    """打印解析结果"""
    headers = result["headers"]

    print("\n" + "=" * 60)
    print("📧 邮件信息")
    print("=" * 60)

    print(f"\n📌 主题: {headers['subject']}")

    if headers['from']['address']:
        print(f"👤 发件人: {headers['from']['name']} <{headers['from']['address']}>")

    if headers['to']:
        to_list = [f"{t['name']} <{t['address']}>" if t['name'] else t['address'] for t in headers['to']]
        print(f"📤 收件人: {', '.join(to_list)}")

    if headers['cc']:
        cc_list = [f"{c['name']} <{c['address']}>" if c['name'] else c['address'] for c in headers['cc']]
        print(f"📋 抄送: {', '.join(cc_list)}")

    print(f"📅 日期: {headers['date']}")

    if result['body']['text']:
        print("\n" + "-" * 60)
        print("📝 正文 (纯文本)")
        print("-" * 60)
        # 截断过长的正文
        text = result['body']['text']
        if len(text) > 2000:
            print(text[:2000] + "\n... [已截断，共 {} 字符]".format(len(text)))
        else:
            print(text)

    if result['attachments']:
        print("\n" + "-" * 60)
        print(f"📎 附件 ({result['attachment_count']} 个)")
        print("-" * 60)
        for att in result['attachments']:
            saved_info = f" → {att['saved_to']}" if att.get('saved_to') else ""
            print(f"  • {att['filename']} ({att['size_human']}){saved_info}")

    print("\n" + "=" * 60)

    if show_raw:
        print("\n📋 原始邮件头")
        print("-" * 60)
        with open(result['file'], 'rb') as f:
            msg = email.message_from_binary_file(f)
            for key, value in msg.items():
                print(f"{key}: {value}")


def main():
    parser = argparse.ArgumentParser(
        description="解析 EML 邮件文件",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )

    parser.add_argument("eml_file", help=".eml 文件路径")
    parser.add_argument("--output-dir", "-o", default=".", help="附件保存目录")
    parser.add_argument("--save-attachments", "-s", action="store_true", help="保存附件")
    parser.add_argument("--json", "-j", action="store_true", help="JSON 格式输出")
    parser.add_argument("--raw", "-r", action="store_true", help="显示原始邮件头")

    args = parser.parse_args()

    try:
        result = parse_eml(
            args.eml_file,
            args.output_dir,
            args.save_attachments
        )

        if args.json:
            print(json.dumps(result, ensure_ascii=False, indent=2))
        else:
            print_result(result, args.raw)

    except FileNotFoundError as e:
        print(f"❌ 错误: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"❌ 解析失败: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
