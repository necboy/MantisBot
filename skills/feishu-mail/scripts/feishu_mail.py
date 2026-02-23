#!/usr/bin/env python3
"""
飞书邮箱管理脚本
用法: python3 feishu_mail.py <command> [args]
"""

import imaplib
import email
import json
import sys
import os
from email.header import decode_header

# 邮箱配置
EMAIL = ""
PASSWORD = ""
IMAP_SERVER = "imap.feishu.cn"


def decode_subject(subject):
    """解码邮件主题"""
    if not subject:
        return "(无主题)"
    decoded = decode_header(subject)
    result = ""
    for part, encoding in decoded:
        if isinstance(part, bytes):
            result += part.decode(encoding or 'utf-8', errors='ignore')
        else:
            result += part
    return result


def connect_mailbox():
    """连接邮箱"""
    try:
        mail = imaplib.IMAP4_SSL(IMAP_SERVER)
        mail.login(EMAIL, PASSWORD)
        return mail
    except Exception as e:
        print(f"连接失败: {e}")
        sys.exit(1)


def get_folder_list(mail):
    """获取文件夹列表"""
    try:
        status, folder_list = mail.list()
        folders = []
        for folder in folder_list:
            decode = folder.decode()
            # 解析文件夹名称
            parts = decode.split('"')
            if len(parts) >= 3:
                folder_path = parts[-2]
                # 飞书邮箱中文文件夹名映射
                folder_map = {
                    '&XfJfUmhj-': 'Archive',
                    '&V4NXPpCuTvY-': 'Junk', 
                    '&XfJSIJZk-': 'Trash',
                    '&XfJT0ZAB-': 'Sent',
                    '&g0l6P3ux-': 'Drafts'
                }
                folder_name = folder_map.get(folder_path, folder_path)
            else:
                folder_name = decode.split('/')[-1].strip().strip('"')
            folders.append(folder_name)
        return folders
    except Exception as e:
        print(f"获取文件夹失败: {e}")
        return []


def get_recent_emails(mail, count=5, folder="INBOX"):
    """获取最近邮件"""
    try:
        status, messages = mail.select(folder)
        if status != 'OK':
            print(f"无法打开文件夹: {folder}")
            return []

        num_messages = int(messages[0])
        emails = []

        # 获取最近 N 封邮件
        for i in range(num_messages, num_messages - count, -1):
            try:
                status, msg_data = mail.fetch(str(i), '(RFC822)')
                if status == 'OK' and msg_data and msg_data[0]:
                    full_message = msg_data[0][1]
                    msg = email.message_from_bytes(full_message)
                    
                    # 解析发件人
                    from_header = msg['From']
                    if from_header:
                        from_name, from_addr = email.utils.parseaddr(from_header)
                    else:
                        from_name, from_addr = "", ""
                    
                    # 解析主题
                    subject = decode_subject(msg['Subject'])
                    
                    # 获取日期
                    date = msg['Date']
                    
                    emails.append({
                        'id': i,
                        'from_name': from_name,
                        'from_addr': from_addr,
                        'subject': subject,
                        'date': date
                    })
            except Exception as e:
                continue

        return emails
    except Exception as e:
        print(f"获取邮件失败: {e}")
        return []


def search_emails(mail, keyword, folder="INBOX"):
    """搜索邮件"""
    try:
        status, messages = mail.select(folder)
        if status != 'OK':
            print(f"无法打开文件夹: {folder}")
            return []

        # 搜索主题包含关键词的邮件
        status, message_ids = mail.search(None, f'(SUBJECT "{keyword}")')
        
        if status != 'OK':
            return []

        email_ids = message_ids[0].split()
        emails = []
        
        for email_id in email_ids[-10:]:  # 最多返回10条
            try:
                status, msg_data = mail.fetch(email_id, '(RFC822)')
                if status == 'OK' and msg_data and msg_data[0]:
                    full_message = msg_data[0][1]
                    msg = email.message_from_bytes(full_message)
                    
                    from_header = msg['From']
                    if from_header:
                        from_name, from_addr = email.utils.parseaddr(from_header)
                    else:
                        from_name, from_addr = "", ""
                    
                    subject = decode_subject(msg['Subject'])
                    date = msg['Date']
                    
                    emails.append({
                        'id': email_id.decode(),
                        'from_name': from_name,
                        'from_addr': from_addr,
                        'subject': subject,
                        'date': date
                    })
            except Exception as e:
                continue

        return emails
    except Exception as e:
        print(f"搜索失败: {e}")
        return []


def get_unread_emails(mail, folder="INBOX"):
    """获取未读邮件"""
    try:
        status, messages = mail.select(folder)
        if status != 'OK':
            print(f"无法打开文件夹: {folder}")
            return []

        status, message_ids = mail.search(None, '(UNSEEN)')
        
        if status != 'OK':
            return []

        email_ids = message_ids[0].split()
        
        if not email_ids:
            return []
        
        emails = []
        
        for email_id in email_ids[-10:]:  # 最多返回10条
            try:
                status, msg_data = mail.fetch(email_id, '(RFC822)')
                if status == 'OK' and msg_data and msg_data[0]:
                    full_message = msg_data[0][1]
                    msg = email.message_from_bytes(full_message)
                    
                    from_header = msg['From']
                    if from_header:
                        from_name, from_addr = email.utils.parseaddr(from_header)
                    else:
                        from_name, from_addr = "", ""
                    
                    subject = decode_subject(msg['Subject'])
                    date = msg['Date']
                    
                    emails.append({
                        'id': email_id.decode(),
                        'from_name': from_name,
                        'from_addr': from_addr,
                        'subject': subject,
                        'date': date
                    })
            except Exception as e:
                continue

        return emails
    except Exception as e:
        print(f"获取未读邮件失败: {e}")
        return []


def read_email(mail, email_id, folder="INBOX"):
    """读取邮件详细内容"""
    try:
        status, messages = mail.select(folder)
        if status != 'OK':
            print(f"无法打开文件夹: {folder}")
            return None

        status, msg_data = mail.fetch(str(email_id), '(RFC822)')
        
        if status != 'OK' or not msg_data or not msg_data[0]:
            print(f"无法获取邮件: {email_id}")
            return None

        full_message = msg_data[0][1]
        msg = email.message_from_bytes(full_message)
        
        # 解析发件人
        from_header = msg['From']
        from_name, from_addr = email.utils.parseaddr(from_header)
        
        # 解析主题
        subject = decode_subject(msg['Subject'])
        
        # 解析日期
        date = msg['Date']
        
        # 解析邮件内容
        body = ""
        if msg.is_multipart():
            for part in msg.walk():
                content_type = part.get_content_type()
                if content_type == 'text/plain':
                    try:
                        body = part.get_payload(decode=True).decode('utf-8', errors='ignore')
                        break
                    except:
                        pass
        else:
            try:
                body = msg.get_payload(decode=True).decode('utf-8', errors='ignore')
            except:
                body = "(无法解析内容)"
        
        return {
            'from_name': from_name,
            'from_addr': from_addr,
            'subject': subject,
            'date': date,
            'body': body[:2000]  # 限制长度
        }
    except Exception as e:
        print(f"读取邮件失败: {e}")
        return None


def print_emails_table(emails, title="邮件列表"):
    """打印邮件表格"""
    if not emails:
        print("没有找到邮件")
        return
    
    print(f"\n📧 {title}")
    print("=" * 80)
    
    for i, email in enumerate(emails, 1):
        from_display = email.get('from_name') or email.get('from_addr', '')
        subject = email.get('subject', '(无主题)')
        date = email.get('date', '')
        
        # 简化日期
        if ',' in date:
            date = date.split(',')[1].strip()[:20]
        
        print(f"{i}. {from_display}")
        print(f"   主题: {subject}")
        print(f"   日期: {date}")
        print("-" * 80)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        print("\n可用命令:")
        print("  recent [数量]    查看最近邮件 (默认5封)")
        print("  search <关键词>  搜索邮件")
        print("  unread          查看未读邮件")
        print("  folders          查看文件夹列表")
        print("  read <邮件ID>    读取邮件详情")
        sys.exit(1)

    mail = connect_mailbox()
    command = sys.argv[1]

    if command == "recent":
        count = int(sys.argv[2]) if len(sys.argv) > 2 else 5
        emails = get_recent_emails(mail, count)
        print_emails_table(emails, f"最近 {len(emails)} 封邮件")

    elif command == "search":
        if len(sys.argv) < 3:
            print("请输入搜索关键词")
            sys.exit(1)
        keyword = sys.argv[2]
        emails = search_emails(mail, keyword)
        print_emails_table(emails, f"搜索结果: {keyword}")

    elif command == "unread":
        emails = get_unread_emails(mail)
        print_emails_table(emails, f"未读邮件 ({len(emails)}封)")

    elif command == "folders":
        folders = get_folder_list(mail)
        print("\n📁 文件夹列表:")
        print("=" * 40)
        for folder in folders:
            print(f"  • {folder}")

    elif command == "read":
        if len(sys.argv) < 3:
            print("请输入邮件ID")
            sys.exit(1)
        email_id = sys.argv[2]
        email_data = read_email(mail, email_id)
        if email_data:
            print("\n📧 邮件详情")
            print("=" * 60)
            print(f"发件人: {email_data['from_name']} <{email_data['from_addr']}>")
            print(f"主题: {email_data['subject']}")
            print(f"日期: {email_data['date']}")
            print("-" * 60)
            print("内容:")
            print(email_data['body'])

    else:
        print(f"未知命令: {command}")
        print("可用命令: recent, search, unread, folders, read")

    mail.logout()


if __name__ == "__main__":
    main()
