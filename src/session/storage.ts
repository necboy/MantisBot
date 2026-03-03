// src/session/storage.ts

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Session } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = join(__dirname, '../../data');

/** 防抖延迟（ms）：同一轮对话多次写合并为一次 */
const DEBOUNCE_MS = 300;

export class SessionStorage {
  private sessions: Map<string, Session> = new Map();
  private dataDir: string;
  private sessionsFile: string;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor(workspace?: string) {
    this.dataDir = workspace || DEFAULT_DATA_DIR;
    this.sessionsFile = join(this.dataDir, 'sessions.json');
    this.ensureDataDir();
    this.load();
  }

  private ensureDataDir(): void {
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }
  }

  private load(): void {
    try {
      if (existsSync(this.sessionsFile)) {
        const data = readFileSync(this.sessionsFile, 'utf-8');
        const parsed = JSON.parse(data) as Session[];
        this.sessions = new Map(parsed.map(s => [s.id, s]));
      }
    } catch (error) {
      console.warn('[SessionStorage] Failed to load sessions:', error);
    }
  }

  /** 实际写盘操作（由防抖或 flushSync 调用） */
  private flushToDisk(): void {
    try {
      const data = Array.from(this.sessions.values());
      writeFileSync(this.sessionsFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[SessionStorage] Failed to save sessions:', error);
    }
  }

  /** 安排一次防抖写盘，300ms 内的多次调用合并为一次 */
  private scheduleSave(): void {
    if (this.destroyed) return;
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.flushToDisk();
    }, DEBOUNCE_MS);
  }

  /** 立即将内存数据写入磁盘，取消待执行的防抖计时器（进程退出时调用） */
  flushSync(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.flushToDisk();
  }

  /** 取消待执行的防抖，释放资源 */
  destroy(): void {
    this.destroyed = true;
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  set(session: Session): void {
    this.sessions.set(session.id, session);
    this.scheduleSave();
  }

  delete(id: string): boolean {
    const result = this.sessions.delete(id);
    if (result) this.scheduleSave();
    return result;
  }

  list(): Session[] {
    return Array.from(this.sessions.values());
  }

  clear(): void {
    this.sessions.clear();
    this.scheduleSave();
  }
}
