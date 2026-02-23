import type { ChannelRegistry } from '../channels/registry.js';
import type { IAgentRunner } from '../agents/unified-runner.js';
import type { SessionManager } from '../session/manager.js';
import type { CronJob } from './service.js';
import type { FileAttachment } from '../types.js';

export class CronExecutor {
  constructor(
    private channelRegistry: ChannelRegistry,
    private agentRunner: IAgentRunner,
    private sessionManager: SessionManager
  ) {}

  /**
   * 执行任务 payload
   */
  async executePayload(job: CronJob): Promise<void> {
    const { payload, delivery } = job;

    try {
      if (payload.kind === 'systemEvent') {
        // 为 systemEvent 也创建 session 并存储消息（实现历史留存）
        const sessionId = this.getOrCreateSession(job);
        this.sessionManager.addMessage(sessionId, {
          role: 'assistant',
          content: payload.text
        });
        await this.deliverMessage(payload.text, delivery);
      } else if (payload.kind === 'agentTurn') {
        const sessionId = this.getOrCreateSession(job);

        console.log(`[CronExecutor] Executing agentTurn for job ${job.id}, sessionId: ${sessionId}`);
        const response = await this.agentRunner.run(
          payload.message,
          []
        );
        console.log(`[CronExecutor] Agent response received, length: ${response.response?.length || 0}, attachments: ${response.attachments?.length || 0}`);

        // Deliver response if delivery is configured and there's a response
        if (delivery && delivery.mode !== 'none' && response.response) {
          // 先存储消息到 session（实现历史留存）
          this.sessionManager.addMessage(sessionId, {
            role: 'assistant',
            content: response.response,
            attachments: response.attachments
          });

          // 然后投递消息（包含附件）
          await this.deliverMessage(response.response, delivery, sessionId, response.attachments);
        }
      }
    } catch (error) {
      console.error(`[CronExecutor] Job ${job.id} execution failed:`, error);
      throw error;
    }
  }

  /**
   * 投递消息到渠道
   */
  private async deliverMessage(
    message: string,
    delivery?: CronJob['delivery'],
    sessionIdForDelivery?: string,
    attachments?: FileAttachment[]
  ): Promise<void> {
    if (!delivery || delivery.mode === 'none') return;

    try {
      const channelId = this.resolveChannel(delivery.channel);
      const channel = this.channelRegistry.getByPlatform(channelId);

      if (!channel) {
        console.warn(`[CronExecutor] Channel not found: ${channelId}`);
        if (!delivery.bestEffort) {
          throw new Error(`Channel not found: ${channelId}`);
        }
        return;
      }

      // Use the provided sessionId if available, otherwise resolve from delivery config
      const chatId = sessionIdForDelivery || await this.resolveChatId(channelId, delivery.to);
      console.log(`[CronExecutor] Delivering message to channel ${channelId}, chatId: ${chatId}, attachments: ${attachments?.length || 0}`);
      await channel.sendMessage(chatId, message, attachments);
    } catch (error) {
      console.error('[CronExecutor] Message delivery failed:', error);
      if (!delivery.bestEffort) {
        throw error;
      }
    }
  }

  /**
   * 解析渠道（支持 "last" 模式）
   */
  private resolveChannel(channel?: string | "last"): string {
    if (!channel || channel === "last") {
      return "web";  // HTTPWSChannel 的 platform 是 'web'
    }
    return channel;
  }

  /**
   * 获取或创建会话
   */
  private getOrCreateSession(job: CronJob): string {
    const { sessionTarget } = job;

    if (sessionTarget === 'main') {
      return 'main';
    } else {
      const sessionKey = `cron:${job.id}`;
      let session = this.sessionManager.getSession(sessionKey);
      if (!session) {
        // 使用任务名称作为 session 名称
        session = this.sessionManager.createSession(sessionKey, 'default', job.name);
      }
      return session.id;
    }
  }

  /**
   * 解析目标聊天 ID
   */
  private async resolveChatId(channelId: string, to?: string): Promise<string> {
    return to || 'default';
  }
}
