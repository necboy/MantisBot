// src/auto-reply/dispatch.ts

import type { ChannelMessage, ChannelContext } from '../channels/channel.interface.js';
import type { FileAttachment } from '../types.js';
import type { IAgentRunner } from '../agents/unified-runner.js';
import { SessionManager } from '../session/manager.js';
import { MemoryManager } from '../memory/manager.js';
import { truncateHistory } from '../utils/token-counter.js';
import { getConfig } from '../config/loader.js';

export interface DispatchResult {
  response: string;
  success: boolean;
  files?: FileAttachment[];
}

export class MessageDispatcher {
  private agentRunner: IAgentRunner;
  private sessionManager: SessionManager;
  private memoryManager: MemoryManager;

  constructor(
    agentRunner: IAgentRunner,
    sessionManager: SessionManager,
    memoryManager: MemoryManager
  ) {
    this.agentRunner = agentRunner;
    this.sessionManager = sessionManager;
    this.memoryManager = memoryManager;
  }

  async dispatch(
    message: ChannelMessage,
    context: ChannelContext
  ): Promise<DispatchResult> {
    const { content, userId, chatId } = message;
    const sessionId = chatId;

    try {
      // Get session or create new one
      let session = this.sessionManager.getSession(sessionId);
      if (!session) {
        session = this.sessionManager.createSession(sessionId, 'default');
      }

      // 读取上下文窗口配置（maxInputChars 默认 80000 字符）
      const config = getConfig();
      const maxInputChars = config.session?.maxInputChars ?? 80000;

      // Build conversation history，并进行 token 感知截断
      const rawHistory = session.messages.map(m => ({
        role: m.role,
        content: m.content,
      }));

      // 截断历史，确保传入 LLM 的对话不超过预算
      // 预留约 30% 的空间给 system prompt、记忆上下文和本次用户消息
      const historyBudget = Math.floor(maxInputChars * 0.7);
      const truncated = truncateHistory(rawHistory, historyBudget);
      // 将 role 类型断言回 LLMMessage 兼容类型
      const history = truncated as Array<{ role: 'user' | 'assistant' | 'system' | 'tool'; content: string }>;

      if (rawHistory.length !== truncated.length) {
        console.log(
          `[Dispatch] 会话 ${sessionId}: 历史消息从 ${rawHistory.length} 条截断到 ${truncated.length} 条` +
          `（预算 ${historyBudget} 字符）`
        );
      }

      // Search relevant memories
      // 跨 session 搜索，支持长期记忆
      console.log('[Dispatch] Searching memories for:', content.substring(0, 50));
      const memories = await this.memoryManager.searchHybrid('default', content, {
        limit: 7,
        sessionKey: undefined  // 不限制 session，支持跨 session 记忆
      });
      console.log(`[Dispatch] Found ${memories.length} memories:`,
        memories.map(m => m.content.substring(0, 30)));

      // Build prompt with memory context
      let prompt: string;
      if (memories.length > 0) {
        const memoryContext = memories.map((m, i) =>
          `${i + 1}. ${m.content}`
        ).join('\n');

        prompt = `📋 **相关记忆**（请在回答前先参考这些信息）：
${memoryContext}

---

💬 **用户问题**：
${content}

💡 **提示**：请先查看上面的相关记忆，然后回答用户问题。如果记忆中有相关信息，请直接使用。`;
      } else {
        prompt = content;
      }

      // Run agent
      const result = await this.agentRunner.run(prompt, history);

      // Add messages to session
      this.sessionManager.addMessage(sessionId, {
        role: 'user',
        content,
      });
      this.sessionManager.addMessage(sessionId, {
        role: 'assistant',
        content: result.response,
      });

      return {
        response: result.response,
        success: result.success,
        files: result.attachments,  // 传递 Agent 收集的附件
      };
    } catch (error) {
      console.error('[Dispatch] Error:', error);
      return {
        response: `处理消息时出错: ${error}`,
        success: false,
      };
    }
  }
}
