#!/usr/bin/env node

/**
 * SMTP Email CLI for MantisBot
 * Send email via SMTP protocol. Works with Gmail, Outlook, 163.com, and any standard SMTP server.
 * Supports attachments, HTML content, and multiple recipients.
 *
 * Modified from LobsterAI to read config from MantisBot's config.json
 */

const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

// 配置文件路径（相对于项目根目录）
const CONFIG_PATH = path.resolve(__dirname, '../../../config/config.json');

// 读取 MantisBot 配置
function loadConfig() {
  try {
    const configContent = fs.readFileSync(CONFIG_PATH, 'utf8');
    const config = JSON.parse(configContent);
    return config.email || { enabled: false, accounts: [] };
  } catch (err) {
    console.error('Error loading config:', err.message);
    return { enabled: false, accounts: [] };
  }
}

// 获取指定账户配置
function getAccountConfig(accountId) {
  const emailConfig = loadConfig();

  if (!emailConfig.enabled || !emailConfig.accounts || emailConfig.accounts.length === 0) {
    return null;
  }

  // 如果指定了账户 ID，查找该账户
  if (accountId) {
    return emailConfig.accounts.find(a => a.id === accountId && a.enabled);
  }

  // 否则使用默认账户
  const defaultAccount = emailConfig.accounts.find(a => a.isDefault && a.enabled);
  if (defaultAccount) {
    return defaultAccount;
  }

  // 如果没有默认账户，使用第一个启用的账户
  return emailConfig.accounts.find(a => a.enabled);
}

// Parse command-line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const command = args[0];
  const options = {};
  const positional = [];

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = args[i + 1];
      options[key] = value || true;
      if (value && !value.startsWith('--')) i++;
    } else {
      positional.push(arg);
    }
  }

  return { command, options, positional };
}

// Create SMTP transporter from account config
function createTransporter(account) {
  const config = {
    host: account.smtp.host,
    port: account.smtp.port,
    secure: account.smtp.secure,
    auth: {
      user: account.email,
      pass: account.password,
    },
    tls: {
      rejectUnauthorized: true,
    },
  };

  if (!config.host || !config.auth.user || !config.auth.pass) {
    throw new Error('Missing SMTP configuration. Please check account settings in config.json');
  }

  return nodemailer.createTransport(config);
}

// Send email
async function sendEmail(account, options) {
  const transporter = createTransporter(account);

  // Verify connection
  try {
    await transporter.verify();
    console.error('SMTP server is ready to send');
  } catch (err) {
    throw new Error(`SMTP connection failed: ${err.message}`);
  }

  const mailOptions = {
    from: options.from || account.email,
    to: options.to,
    cc: options.cc || undefined,
    bcc: options.bcc || undefined,
    subject: options.subject || '(no subject)',
    text: options.text || undefined,
    html: options.html || undefined,
    attachments: options.attachments || [],
  };

  // If neither text nor html provided, use default text
  if (!mailOptions.text && !mailOptions.html) {
    mailOptions.text = options.body || '';
  }

  const info = await transporter.sendMail(mailOptions);

  return {
    success: true,
    messageId: info.messageId,
    response: info.response,
    to: mailOptions.to,
  };
}

// Read file content for attachments
function readAttachment(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Attachment file not found: ${filePath}`);
  }
  return {
    filename: path.basename(filePath),
    path: path.resolve(filePath),
  };
}

// Send email with file content
async function sendEmailWithContent(account, options) {
  // Handle attachments
  if (options.attach) {
    const attachFiles = options.attach.split(',').map(f => f.trim());
    options.attachments = attachFiles.map(f => readAttachment(f));
  }

  return await sendEmail(account, options);
}

// Test SMTP connection
async function testConnection(account) {
  const transporter = createTransporter(account);

  try {
    await transporter.verify();
    const info = await transporter.sendMail({
      from: account.email,
      to: account.email, // Send to self
      subject: 'SMTP Connection Test from MantisBot',
      text: 'This is a test email from MantisBot email skill.',
      html: '<p>This is a <strong>test email</strong> from MantisBot email skill.</p>',
    });

    return {
      success: true,
      message: 'SMTP connection successful',
      messageId: info.messageId,
    };
  } catch (err) {
    throw new Error(`SMTP test failed: ${err.message}`);
  }
}

// Verify SMTP connection without sending email
async function verifyConnection(account) {
  const transporter = createTransporter(account);

  try {
    await transporter.verify();
    return {
      success: true,
      message: 'SMTP verification successful',
    };
  } catch (err) {
    throw new Error(`SMTP verify failed: ${err.message}`);
  }
}

// Main CLI handler
async function main() {
  const { command, options, positional } = parseArgs();

  try {
    // 获取账户配置
    const account = getAccountConfig(options.account);
    if (!account) {
      throw new Error(`Account not found: ${options.account || 'default'}. Please configure email accounts in config.json.`);
    }

    let result;

    switch (command) {
      case 'send':
        if (!options.to) {
          throw new Error('Missing required option: --to <email>');
        }
        if (!options.subject && !options['subject-file']) {
          throw new Error('Missing required option: --subject <text> or --subject-file <file>');
        }

        // Read subject from file if specified
        if (options['subject-file']) {
          options.subject = fs.readFileSync(options['subject-file'], 'utf8').trim();
        }

        // Read body from file if specified
        if (options['body-file']) {
          const content = fs.readFileSync(options['body-file'], 'utf8');
          if (options['body-file'].endsWith('.html') || options.html) {
            options.html = content;
          } else {
            options.text = content;
          }
        } else if (options['html-file']) {
          options.html = fs.readFileSync(options['html-file'], 'utf8');
        } else if (options.body) {
          options.text = options.body;
        }

        result = await sendEmailWithContent(account, options);
        break;

      case 'test':
        result = await testConnection(account);
        break;

      case 'verify':
        result = await verifyConnection(account);
        break;

      default:
        console.error('Unknown command:', command);
        console.error('Available commands: send, test, verify');
        console.error('');
        console.error('Usage:');
        console.error('  send   --to <email> --subject <text> [--body <text>] [--html] [--cc <email>] [--bcc <email>] [--attach <file>] [--account <id>]');
        console.error('  send   --to <email> --subject <text> --body-file <file> [--html-file <file>] [--attach <file>] [--account <id>]');
        console.error('  test   [--account <id>]  - Send test email to yourself');
        console.error('  verify [--account <id>]  - Verify connection without sending email');
        process.exit(1);
    }

    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
