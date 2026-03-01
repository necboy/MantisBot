// src/agents/openai-compat-runner.ts
// OpenAI 兼容的 Agent Runner 实现
// 支持 OpenAI、通义千问、Gemini 等非 Claude 模型

import { EventEmitter } from 'events';
import { getLLMClient } from './llm-client.js';
import { ToolRegistry } from './tools/registry.js';
import { getConfig } from '../config/loader.js';
import { workDirManager } from '../workdir/manager.js';
import type { LLMMessage, FileAttachment, ToolInfo } from '../types.js';
import {
  type StreamChunk,
  type AgentResult,
  type AgentRunnerOptions,
  type ToolCallInfo,
  type PermissionRequest,
  DANGEROUS_TOOLS,
  BASH_TOOLS,
  DESTRUCTIVE_BASH_PATTERNS,
  MAX_TOOL_RESULT_CHARS,
  TRUNCATION_SUFFIX,
} from './types.js';

/**
 * 工具结果截断
 */
function truncateToolResult(content: string): string {
  if (content.length <= MAX_TOOL_RESULT_CHARS) {
    return content;
  }

  const keepChars = MAX_TOOL_RESULT_CHARS - TRUNCATION_SUFFIX.length;

  // 尽量在换行符处截断
  let cutPoint = keepChars;
  const lastNewline = content.lastIndexOf('\n', keepChars);
  if (lastNewline > keepChars * 0.8) {
    cutPoint = lastNewline;
  }

  return content.slice(0, cutPoint) + TRUNCATION_SUFFIX;
}

/**
 * 从工具结果中收集附件
 */
function collectAttachments(result: unknown, attachments: FileAttachment[]): void {
  if (result && typeof result === 'object') {
    let newItems: FileAttachment[] = [];

    // 如果结果有 attachments 字段
    if ('attachments' in result && Array.isArray(result.attachments)) {
      newItems = result.attachments as FileAttachment[];
    }
    // 如果结果本身就是 FileAttachment 数组
    else if (Array.isArray(result) && result.length > 0 && 'url' in result[0]) {
      newItems = result as FileAttachment[];
    }
    // 如果结果是单个 FileAttachment
    else if ('url' in result && 'name' in result && !Array.isArray(result)) {
      newItems = [result as FileAttachment];
    }

    // 去重
    const existingUrls = new Set(attachments.map(a => a.url));
    for (const item of newItems) {
      if (!existingUrls.has(item.url)) {
        attachments.push(item);
        existingUrls.add(item.url);
      }
    }
  }
}

// 审批模式类型
type ApprovalMode = 'auto' | 'ask' | 'dangerous';

/**
 * OpenAI 兼容的 Agent Runner
 * 支持所有通过 LLMClient 调用的非 Claude 模型
 */
export class OpenAICompatRunner extends EventEmitter {
  private toolRegistry: ToolRegistry;
  private options: {
    model: string;
    systemPrompt: string;
    maxIterations: number;
    approvalMode: ApprovalMode;
  };
  private abortController: AbortController | null = null;

  // 权限请求等待队列
  private pendingPermissions: Map<string, {
    resolve: (approved: boolean) => void;
  }> = new Map();

  // 存储权限请求时的原始输入
  private permissionOriginalInputs = new Map<string, Record<string, unknown>>();

  constructor(
    toolRegistry: ToolRegistry,
    options: AgentRunnerOptions = {}
  ) {
    super();
    this.toolRegistry = toolRegistry;

    // 兼容旧的 autoApprove 参数，转换为 approvalMode
    let approvalMode: ApprovalMode = options.approvalMode || 'dangerous';
    if (options.autoApprove === true && !options.approvalMode) {
      approvalMode = 'auto';
    } else if (options.autoApprove === false && !options.approvalMode) {
      approvalMode = 'dangerous';
    }

    this.options = {
      model: options.model || '',
      systemPrompt: options.systemPrompt || '',
      maxIterations: options.maxIterations || 0, // 0 = 无限制
      approvalMode,
    };

    // 如果没有指定模型，使用配置中的第一个模型
    if (!this.options.model) {
      const config = getConfig();
      this.options.model = config.models[0]?.name || 'gpt-4';
    }

    console.log('[OpenAICompatRunner] Initialized with approvalMode:', approvalMode);
  }

  /**
   * 停止当前执行
   */
  abort(): void {
    if (this.abortController) {
      console.log('[OpenAICompatRunner] Abort requested');
      this.abortController.abort();
    }
  }

  /**
   * 检查工具是否为删除类危险操作
   */
  private isDangerousTool(toolName: string): boolean {
    return DANGEROUS_TOOLS.has(toolName.toLowerCase());
  }

  /**
   * 检查 Bash 命令是否匹配危险操作模式
   */
  private isDangerousBashCommand(command: string): boolean {
    return DESTRUCTIVE_BASH_PATTERNS.some(pattern => pattern.test(command));
  }

  /**
   * 检查工具是否需要权限确认，需要时发出事件并等待用户响应
   * 返回 true = 允许执行，false = 拒绝
   */
  private async checkToolPermission(
    toolName: string,
    toolInput: Record<string, unknown>,
    abortSignal?: AbortSignal
  ): Promise<boolean> {
    const approvalMode = this.options.approvalMode;

    if (approvalMode === 'auto') return true;

    const isBash = BASH_TOOLS.has(toolName);
    const command = isBash ? String(toolInput.command || toolInput.cmd || '') : '';
    const isDangerousBash = isBash && this.isDangerousBashCommand(command);
    const isDeleteTool = this.isDangerousTool(toolName);

    const needsPermission = approvalMode === 'ask' || isDangerousBash || isDeleteTool;
    if (!needsPermission) return true;

    const requestId = crypto.randomUUID();
    const request: PermissionRequest = {
      requestId,
      toolName,
      toolInput,
      isDangerous: isDangerousBash || isDeleteTool,
      reason: isBash
        ? `Will execute command: ${command.slice(0, 100)}`
        : `Tool "${toolName}" may perform destructive operation`,
    };

    this.permissionOriginalInputs.set(requestId, toolInput);
    this.emit('permissionRequest', request);

    return this.waitForPermission(requestId, abortSignal);
  }

  /**
   * 等待权限响应
   */
  private waitForPermission(
    requestId: string,
    abortSignal?: AbortSignal,
    timeoutMs: number = 60000
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingPermissions.delete(requestId);
        this.permissionOriginalInputs.delete(requestId);
        console.warn(`[OpenAICompatRunner] Permission request timeout: ${requestId}, auto-approving`);
        resolve(true);
      }, timeoutMs);

      const abortHandler = () => {
        clearTimeout(timeout);
        this.pendingPermissions.delete(requestId);
        this.permissionOriginalInputs.delete(requestId);
        resolve(false);
      };
      abortSignal?.addEventListener('abort', abortHandler, { once: true });

      this.pendingPermissions.set(requestId, {
        resolve: (approved: boolean) => {
          clearTimeout(timeout);
          abortSignal?.removeEventListener('abort', abortHandler);
          resolve(approved);
        },
      });
    });
  }

  /**
   * 响应权限请求（供外部调用，如 HTTP Server）
   */
  async respondToPermission(
    requestId: string,
    approved: boolean,
    _updatedInput?: Record<string, unknown>
  ): Promise<void> {
    const pending = this.pendingPermissions.get(requestId);
    if (!pending) {
      console.warn(`[OpenAICompatRunner] No pending permission request for ID: ${requestId}`);
      return;
    }
    this.pendingPermissions.delete(requestId);
    this.permissionOriginalInputs.delete(requestId);
    pending.resolve(approved);
  }

  /**
   * 清理资源
   */
  dispose(): void {
    for (const [, pending] of this.pendingPermissions) {
      pending.resolve(false);
    }
    this.pendingPermissions.clear();
    this.permissionOriginalInputs.clear();
  }

  /**
   * 获取当前会话 ID（OpenAI 兼容模式不支持会话恢复）
   */
  getSessionId(): null {
    return null;
  }

  /**
   * 流式运行
   */
  async *streamRun(
    userMessage: string,
    conversationHistory: LLMMessage[] = [],
    abortSignal?: AbortSignal
  ): AsyncGenerator<StreamChunk> {
    // 创建或复用 AbortController
    if (abortSignal) {
      // 使用传入的 signal
      this.abortController = null; // 外部管理
    } else {
      this.abortController = new AbortController();
      abortSignal = this.abortController.signal;
    }

    const llm = getLLMClient();
    const attachments: FileAttachment[] = [];
    const toolCallsExecuted: { tool: string; result: unknown }[] = [];

    // 构建消息列表
    const messages = this.buildMessages(userMessage, conversationHistory);

    // 获取可用工具
    const tools = this.toolRegistry.listTools();

    let iterations = 0;
    let currentContent = '';

    while (true) {
      // 检查中断信号
      if (abortSignal?.aborted) {
        console.log('[OpenAICompatRunner] Execution aborted by user');
        yield { type: 'error', content: '用户已停止对话' };
        return;
      }

      // 检查迭代限制
      if (this.options.maxIterations > 0 && iterations >= this.options.maxIterations) {
        yield { type: 'complete', attachments: attachments.length > 0 ? attachments : undefined };
        return;
      }

      // 调用 LLM
      const toolCalls: ToolCallInfo[] = [];
      currentContent = '';

      try {
        for await (const chunk of llm.streamChat(messages, this.options.model, tools)) {
          // 检查中断信号
          if (abortSignal?.aborted) {
            console.log('[OpenAICompatRunner] Execution aborted during LLM stream');
            yield { type: 'error', content: '用户已停止对话' };
            return;
          }

          if (chunk.type === 'text' && chunk.content) {
            currentContent += chunk.content;
            yield { type: 'text', content: chunk.content };
          } else if (chunk.type === 'tool_call' && chunk.toolCall) {
            // 解析工具调用参数
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(chunk.toolCall.arguments);
            } catch {
              args = {};
            }
            toolCalls.push({
              id: chunk.toolCall.id,
              name: chunk.toolCall.name,
              arguments: args,
            });
          }
        }
      } catch (error) {
        // 如果是中断导致的错误，返回特定消息
        if (abortSignal?.aborted) {
          console.log('[OpenAICompatRunner] LLM stream interrupted');
          yield { type: 'error', content: '用户已停止对话' };
          return;
        }
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('[OpenAICompatRunner] LLM error:', errorMessage);
        yield { type: 'error', content: errorMessage };
        return;
      }

      // 检查中断信号
      if (abortSignal?.aborted) {
        yield { type: 'error', content: '用户已停止对话' };
        return;
      }

      // 没有工具调用，完成
      if (toolCalls.length === 0) {
        yield { type: 'complete', attachments: attachments.length > 0 ? attachments : undefined };
        return;
      }

      // 处理工具调用
      for (const tc of toolCalls) {
        // 检查中断信号
        if (abortSignal?.aborted) {
          yield { type: 'error', content: '用户已停止对话' };
          return;
        }

        const startTime = Date.now();

        console.log(`\n${'='.repeat(80)}`);
        console.log(`[OpenAICompatRunner] 🔧 Tool Call Started`);
        console.log(`  Tool Name: ${tc.name}`);
        console.log(`  Tool ID: ${tc.id}`);
        console.log(`  Arguments:`, JSON.stringify(tc.arguments, null, 2));
        console.log(`${'='.repeat(80)}`);

        yield { type: 'tool_use', tool: tc.name, toolId: tc.id, args: tc.arguments };

        // 权限检查
        const permitted = await this.checkToolPermission(tc.name, tc.arguments, abortSignal);
        if (!permitted) {
          console.log(`[OpenAICompatRunner] Tool execution denied by user: ${tc.name}`);
          messages.push({
            role: 'assistant',
            content: currentContent,
            tool_calls: [{ id: tc.id, name: tc.name, arguments: tc.arguments }],
          });
          messages.push({
            role: 'tool',
            toolCallId: tc.id,
            content: 'Tool execution was denied by user.',
          });
          yield { type: 'tool_result', tool: tc.name, result: { error: 'Permission denied by user' }, isError: true };
          continue;
        }

        try {
          const result = await this.toolRegistry.execute(tc.name, tc.arguments);

          // 检查中断信号
          if (abortSignal?.aborted) {
            yield { type: 'error', content: '用户已停止对话' };
            return;
          }

          const duration = Date.now() - startTime;
          console.log(`\n[OpenAICompatRunner] ✅ Tool Execution Completed`);
          console.log(`  Tool: ${tc.name}`);
          console.log(`  Duration: ${duration}ms`);
          console.log(`${'='.repeat(80)}\n`);

          // 收集附件
          collectAttachments(result, attachments);

          toolCallsExecuted.push({ tool: tc.name, result });

          // 构建工具结果
          const resultForLLM = (result && typeof result === 'object' && 'message' in result)
            ? { message: (result as Record<string, unknown>).message }
            : result;
          const resultStr = JSON.stringify(resultForLLM);
          const truncatedResult = truncateToolResult(resultStr);

          // 添加到消息列表
          messages.push({
            role: 'assistant',
            content: currentContent,
            tool_calls: [{ id: tc.id, name: tc.name, arguments: tc.arguments }],
          });
          messages.push({
            role: 'tool',
            toolCallId: tc.id,
            content: truncatedResult,
          });

          yield { type: 'tool_result', tool: tc.name, result: resultForLLM };
        } catch (error) {
          const duration = Date.now() - startTime;
          const errorMessage = error instanceof Error ? error.message : String(error);

          console.error(`\n[OpenAICompatRunner] ❌ Tool Execution Failed`);
          console.error(`  Tool: ${tc.name}`);
          console.error(`  Duration: ${duration}ms`);
          console.error(`  Error:`, errorMessage);
          console.error(`${'='.repeat(80)}\n`);

          messages.push({
            role: 'assistant',
            content: currentContent,
            tool_calls: [{ id: tc.id, name: tc.name, arguments: tc.arguments }],
          });
          messages.push({
            role: 'tool',
            toolCallId: tc.id,
            content: `Error: ${errorMessage}`,
          });

          yield { type: 'tool_result', tool: tc.name, result: { error: errorMessage }, isError: true };
        }
      }

      iterations++;
      // 继续循环，让 LLM 基于工具结果继续生成
    }
  }

  /**
   * 非流式运行（兼容旧 API）
   */
  async run(
    userMessage: string,
    conversationHistory: LLMMessage[] = []
  ): Promise<AgentResult> {
    let fullContent = '';
    const toolCalls: AgentResult['toolCalls'] = [];
    const attachments: FileAttachment[] = [];

    for await (const chunk of this.streamRun(userMessage, conversationHistory)) {
      if (chunk.type === 'text' && chunk.content) {
        fullContent += chunk.content;
      } else if (chunk.type === 'tool_result') {
        toolCalls.push({
          tool: chunk.tool || '',
          result: chunk.result,
        });
      } else if (chunk.type === 'complete' || chunk.type === 'error') {
        if (chunk.attachments) {
          attachments.push(...chunk.attachments);
        }
      }
    }

    return {
      response: fullContent,
      success: true,
      toolCalls,
      attachments: attachments.length > 0 ? attachments : undefined,
    };
  }

  /**
   * 过滤无效的 tool 消息
   * OpenAI 兼容 API 要求 tool 消息必须紧跟在包含 tool_calls 的 assistant 消息后面
   */
  private filterInvalidToolMessages(messages: LLMMessage[]): LLMMessage[] {
    const filtered: LLMMessage[] = [];
    let lastAssistantHadToolCalls = false;

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      if (msg.role === 'assistant') {
        const hasToolCalls = !!(msg as any).tool_calls && (msg as any).tool_calls.length > 0;
        lastAssistantHadToolCalls = hasToolCalls;
        filtered.push(msg);
      } else if (msg.role === 'tool') {
        // 只有当前一个 assistant 消息有 tool_calls 时才保留 tool 消息
        if (lastAssistantHadToolCalls) {
          filtered.push(msg);
          lastAssistantHadToolCalls = false;
        } else {
          console.warn('[OpenAICompatRunner] Filtering out invalid tool message (no preceding tool_calls)');
        }
      } else {
        filtered.push(msg);
        lastAssistantHadToolCalls = false;
      }
    }

    return filtered;
  }

  /**
   * 构建消息列表
   */
  private buildMessages(userMessage: string, history: LLMMessage[]): LLMMessage[] {
    const messages: LLMMessage[] = [];

    // 动态读取当前工作目录，注入系统提示词
    const currentCwd = workDirManager.getCurrentWorkDir();
    const basePrompt = this.options.systemPrompt || '';
    const rememberInstruction = `\n\n## 记忆工具\n你有一个 \`remember\` 工具，仅在学到对未来对话有价值的信息时调用：\n- 用户偏好（编码风格、语言偏好、沟通方式）\n- 项目关键事实（技术栈、架构决策、环境信息）\n- 重要决策（用户做出的选择，如"暂不引入 Redis"）\n- 个人上下文（姓名、时区、角色）\n\n不要调用 remember 记录：普通问答、解释说明、调试步骤、或仅与当前任务相关的临时信息。`;
    const systemContent = `${basePrompt}\n\n## 当前工作目录\n${currentCwd}${rememberInstruction}`.trimStart();

    messages.push({
      role: 'system',
      content: systemContent,
    });

    // 添加历史记录（过滤无效的 tool 消息）
    const filteredHistory = this.filterInvalidToolMessages(history);
    messages.push(...filteredHistory);

    // 添加用户消息
    messages.push({
      role: 'user',
      content: userMessage,
    });

    return messages;
  }

  /**
   * 简单对话（不带工具）
   */
  async simpleChat(message: string): Promise<string> {
    const llm = getLLMClient();
    return llm.simpleChat(message);
  }
}
