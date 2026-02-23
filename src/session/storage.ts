// src/session/storage.ts

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Session } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = join(__dirname, '../../data');

export class SessionStorage {
  private sessions: Map<string, Session> = new Map();
  private dataDir: string;
  private sessionsFile: string;

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

  private save(): void {
    try {
      const data = Array.from(this.sessions.values());
      writeFileSync(this.sessionsFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[SessionStorage] Failed to save sessions:', error);
    }
  }

  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  set(session: Session): void {
    this.sessions.set(session.id, session);
    this.save();
  }

  delete(id: string): boolean {
    const result = this.sessions.delete(id);
    if (result) this.save();
    return result;
  }

  list(): Session[] {
    return Array.from(this.sessions.values());
  }

  clear(): void {
    this.sessions.clear();
    this.save();
  }
}
