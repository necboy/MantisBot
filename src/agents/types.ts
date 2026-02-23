// src/agents/types.ts
// 统一的 Agent Runner 类型定义

import type { FileAttachment } from '../types.js';

/**
 * 权限请求
 */
export interface PermissionRequest {
  requestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  isDangerous: boolean;
  reason?: string;
}

/**
 * 流式输出块
 */
export interface StreamChunk {
  // 消息类型
  type: 'thinking' | 'text' | 'tool_use' | 'tool_result' | 'permission' | 'complete' | 'error' | 'system';
  // 文本内容
  content?: string;
  // 工具相关
  tool?: string;
  toolId?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  isError?: boolean;
  // 权限请求
  permission?: PermissionRequest;
  // 附件
  attachments?: FileAttachment[];
  // 元数据
  messageId?: string;
}

/**
 * Agent 执行结果
 */
export interface AgentResult {
  response: string;
  success: boolean;
  toolCalls?: { tool: string; result: unknown }[];
  attachments?: FileAttachment[];
}

// 审批模式类型（与 src/types.ts 保持同步）
export type ApprovalMode = 'auto' | 'ask' | 'dangerous';

/**
 * Agent Runner 选项
 */
export interface AgentRunnerOptions {
  model?: string;                      // 指定模型
  systemPrompt?: string;               // 自定义系统提示词
  maxIterations?: number;              // 最大迭代次数（0 = 无限制）
  /** @deprecated 使用 approvalMode 代替 */
  autoApprove?: boolean;               // 是否自动批准所有工具调用（向后兼容）
  approvalMode?: ApprovalMode;         // 审批模式：auto=自动批准所有, ask=每次询问, dangerous=仅危险操作询问
  skillsLoader?: any;                  // Skills 加载器
  pluginSkillsPrompt?: string;         // Plugin skills 提示词（来自 plugins 目录）
  cwd?: string;                        // 工作目录
  claudeSessionId?: string;            // 用于 resume 的会话 ID（仅 Claude SDK）
  abortSignal?: AbortSignal;           // 用于中断执行的信号
}

/**
 * Agent Runner 统一接口
 */
export interface IAgentRunner {
  /**
   * 流式运行
   */
  streamRun(
    userMessage: string,
    conversationHistory: import('../types.js').LLMMessage[],
    abortSignal?: AbortSignal
  ): AsyncGenerator<StreamChunk>;

  /**
   * 非流式运行
   */
  run(
    userMessage: string,
    conversationHistory: import('../types.js').LLMMessage[],
    abortSignal?: AbortSignal
  ): Promise<AgentResult>;

  /**
   * 响应权限请求（可选，仅需要权限管理的实现需要）
   */
  respondToPermission?(
    requestId: string,
    approved: boolean,
    updatedInput?: Record<string, unknown>
  ): Promise<void>;

  /**
   * 获取会话 ID（可选，仅支持会话恢复的实现需要）
   */
  getSessionId?(): string | null;

  /**
   * 清理资源（可选）
   */
  dispose?(): void;
}

/**
 * 工具调用信息
 */
export interface ToolCallInfo {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * 工具执行结果
 */
export interface ToolExecutionResult {
  success: boolean;
  result?: unknown;
  error?: string;
  attachments?: FileAttachment[];
}

/**
 * 敏感工具列表
 */
export const DANGEROUS_TOOLS = new Set([
  'delete', 'remove', 'unlink', 'rmdir',
  'Bash', 'bash', 'exec',
  'Write', 'write', 'Edit', 'edit'
]);

/**
 * 工具结果截断配置
 */
export const MAX_TOOL_RESULT_CHARS = 6000;
export const MIN_KEEP_CHARS = 1000;
export const TRUNCATION_SUFFIX = `\n\n⚠️ [结果已截断 - 原始内容过大。如需更多内容，请明确指定需要哪部分。]`;
