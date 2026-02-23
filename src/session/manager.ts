// src/session/manager.ts

import { v4 as uuidv4 } from 'uuid';
import type { Session, Message } from '../types.js';
import { SessionStorage } from './storage.js';

export class SessionManager {
  private storage: SessionStorage;
  private maxMessages: number;

  constructor(maxMessages: number = 100, workspace?: string) {
    this.storage = new SessionStorage(workspace);
    this.maxMessages = maxMessages;
  }

  createSession(id: string, model: string, name?: string): Session {
    const now = Date.now();
    const session: Session = {
      id: id || uuidv4(),
      name,
      model,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    this.storage.set(session);
    return session;
  }

  getSession(id: string): Session | undefined {
    return this.storage.get(id);
  }

  updateSession(session: Session): void {
    session.updatedAt = Date.now();
    this.storage.set(session);
  }

  deleteSession(id: string): boolean {
    return this.storage.delete(id);
  }

  listSessions(): Session[] {
    return this.storage.list().sort((a, b) => b.updatedAt - a.updatedAt);
  }

  addMessage(sessionId: string, message: Omit<Message, 'id' | 'timestamp'>): Message | undefined {
    const session = this.storage.get(sessionId);
    if (!session) return undefined;

    const messageWithMeta: Message = {
      ...message,
      id: uuidv4(),
      timestamp: Date.now(),
    };

    session.messages.push(messageWithMeta);

    // Trim old messages if needed
    if (session.messages.length > this.maxMessages) {
      session.messages = session.messages.slice(-this.maxMessages);
    }

    this.updateSession(session);
    return messageWithMeta;
  }

  getHistory(sessionId: string, limit?: number): Message[] {
    const session = this.storage.get(sessionId);
    if (!session) return [];

    if (limit) {
      return session.messages.slice(-limit);
    }
    return session.messages;
  }

  clearSession(sessionId: string): boolean {
    const session = this.storage.get(sessionId);
    if (!session) return false;

    session.messages = [];
    this.updateSession(session);
    return true;
  }

  /**
   * 归档过期会话：清空消息但保留会话元数据
   *
   * 策略说明：
   * - 保留 session ID，避免频道渠道（如飞书群聊）再次发消息时 404
   * - 只清空 messages，让下一条消息自然开启新的上下文
   * - 比完全删除更安全，不破坏渠道的 chatId 映射关系
   *
   * @param ttlDays 不活跃超过多少天的会话会被归档（0 = 禁用）
   * @returns 已归档的会话数量
   */
  archiveInactiveSessions(ttlDays: number): number {
    if (ttlDays <= 0) return 0;

    const now = Date.now();
    const ttlMs = ttlDays * 24 * 60 * 60 * 1000;
    const sessions = this.storage.list();
    let archived = 0;

    for (const session of sessions) {
      const inactiveMs = now - session.updatedAt;
      if (inactiveMs > ttlMs && session.messages.length > 0) {
        console.log(
          `[SessionManager] 归档过期会话 ${session.id}` +
          `（最后活跃：${Math.floor(inactiveMs / 86400000)} 天前，` +
          `清除 ${session.messages.length} 条消息）`
        );
        session.messages = [];
        this.storage.set(session);
        archived++;
      }
    }

    if (archived > 0) {
      console.log(`[SessionManager] 本次共归档 ${archived} 个过期会话（TTL=${ttlDays} 天）`);
    }

    return archived;
  }
}
