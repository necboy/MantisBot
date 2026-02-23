// src/channels/definitions/index.ts

export interface FieldDefinition {
  type: 'text' | 'password' | 'textarea' | 'url' | 'boolean';
  label: string;
  labelZh: string;
  required: boolean;
  placeholder?: string;
  placeholderZh?: string;
  description?: string;
  descriptionZh?: string;
}

export interface ChannelDefinition {
  id: string;
  name: string;
  nameZh: string;
  icon: string;
  color: string;
  configSchema: Record<string, FieldDefinition>;
}

export const channelDefinitions: ChannelDefinition[] = [
  {
    id: 'httpWs',
    name: 'Web UI',
    nameZh: '网页客户端',
    icon: '🌐',
    color: '#3B82F6',
    configSchema: {
      enabled: {
        type: 'boolean',
        label: 'Enabled',
        labelZh: '启用',
        required: false,
      },
    },
  },
  // 飞书定义
  {
    id: 'feishu',
    name: 'Feishu',
    nameZh: '飞书',
    icon: '🐦',
    color: '#2DA7E0',
    configSchema: {
      enabled: {
        type: 'boolean',
        label: 'Enabled',
        labelZh: '启用',
        required: false,
      },
      appId: {
        type: 'text',
        label: 'App ID',
        labelZh: 'App ID',
        required: true,
        placeholder: 'cli_xxxxx',
        placeholderZh: 'cli_xxxxx',
      },
      appSecret: {
        type: 'password',
        label: 'App Secret',
        labelZh: 'App Secret',
        required: true,
      },
      verificationToken: {
        type: 'text',
        label: 'Verification Token',
        labelZh: '验证 Token',
        required: false,
      },
      encryptKey: {
        type: 'password',
        label: 'Encrypt Key',
        labelZh: '加密密钥',
        required: false,
      },
    },
  },
  // Slack 定义
  {
    id: 'slack',
    name: 'Slack',
    nameZh: 'Slack',
    icon: '💬',
    color: '#4A154B',
    configSchema: {
      enabled: {
        type: 'boolean',
        label: 'Enabled',
        labelZh: '启用',
        required: false,
      },
      botToken: {
        type: 'password',
        label: 'Bot Token',
        labelZh: 'Bot Token',
        required: true,
        placeholder: 'xoxb-...',
      },
      signingSecret: {
        type: 'password',
        label: 'Signing Secret',
        labelZh: '签名密钥',
        required: true,
      },
      appToken: {
        type: 'password',
        label: 'App Token',
        labelZh: 'App Token',
        required: false,
      },
    },
  },
  // 钉钉定义
  {
    id: 'dingtalk',
    name: 'DingTalk',
    nameZh: '钉钉',
    icon: '📎',
    color: '#0089FF',
    configSchema: {
      enabled: {
        type: 'boolean',
        label: 'Enabled',
        labelZh: '启用',
        required: false,
      },
      agentId: {
        type: 'text',
        label: 'Agent ID',
        labelZh: 'Agent ID',
        required: true,
      },
      appKey: {
        type: 'text',
        label: 'App Key',
        labelZh: 'App Key',
        required: true,
      },
      appSecret: {
        type: 'password',
        label: 'App Secret',
        labelZh: 'App Secret',
        required: true,
      },
      corpId: {
        type: 'text',
        label: 'Corp ID',
        labelZh: '企业 ID',
        required: true,
      },
    },
  },
  // 企业微信定义
  {
    id: 'wecom',
    name: 'WeCom',
    nameZh: '企业微信',
    icon: '💼',
    color: '#007ACC',
    configSchema: {
      enabled: {
        type: 'boolean',
        label: 'Enabled',
        labelZh: '启用',
        required: false,
      },
      corpId: {
        type: 'text',
        label: 'Corp ID',
        labelZh: '企业 ID',
        required: true,
      },
      secret: {
        type: 'password',
        label: 'Secret',
        labelZh: 'Secret',
        required: true,
      },
      agentId: {
        type: 'text',
        label: 'Agent ID',
        labelZh: 'Agent ID',
        required: true,
      },
    },
  },
  // WhatsApp 定义
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    nameZh: 'WhatsApp',
    icon: '📱',
    color: '#25D366',
    configSchema: {
      enabled: {
        type: 'boolean',
        label: 'Enabled',
        labelZh: '启用',
        required: false,
      },
      phoneNumberId: {
        type: 'text',
        label: 'Phone Number ID',
        labelZh: 'Phone Number ID',
        required: true,
      },
      accessToken: {
        type: 'password',
        label: 'Access Token',
        labelZh: 'Access Token',
        required: true,
      },
      webhookVerifyToken: {
        type: 'text',
        label: 'Webhook Verify Token',
        labelZh: 'Webhook 验证 Token',
        required: true,
      },
    },
  },
  // 微信个人号定义
  {
    id: 'wechat',
    name: 'WeChat',
    nameZh: '微信',
    icon: '💬',
    color: '#07C160',
    configSchema: {
      enabled: {
        type: 'boolean',
        label: 'Enabled',
        labelZh: '启用',
        required: false,
      },
      token: {
        type: 'password',
        label: 'PadLocal Token',
        labelZh: 'PadLocal Token',
        required: true,
        description: 'Get your token from pad-local.com',
        descriptionZh: '请从 pad-local.com 获取 Token',
      },
    },
  },
];

export function getChannelDefinition(id: string): ChannelDefinition | undefined {
  return channelDefinitions.find(c => c.id === id);
}
