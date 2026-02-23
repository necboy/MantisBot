// src/config/profile.ts

/**
 * Agent 性格配置文件的类型定义
 */

export interface AgentProfile {
  name: string;            // 配置名称
  description?: string;    // 描述
  soul?: string;           // SOUL.md 内容
  identity?: string;        // IDENTITY.md 内容
  user?: string;           // USER.md 内容
  createdAt?: number;      // 创建时间
  updatedAt?: number;      // 更新时间
}

export interface ProfileMeta {
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
}
