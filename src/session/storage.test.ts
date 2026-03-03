// src/session/storage.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { Session } from '../types.js';

// ── 辅助 ──────────────────────────────────────────────────────────────────────

function makeSession(id: string): Session {
  return {
    id,
    name: `Session ${id}`,
    model: 'test-model',
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function readFile(dir: string): Session[] {
  const file = join(dir, 'sessions.json');
  if (!existsSync(file)) return [];
  return JSON.parse(readFileSync(file, 'utf-8')) as Session[];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SessionStorage', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'mantis-storage-test-'));
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── RED 1: 多次快速 set 只触发一次磁盘写入 ─────────────────────────────────

  it('多次快速 set 在防抖窗口内只写盘一次', async () => {
    const { SessionStorage } = await import('./storage.js');
    const storage = new SessionStorage(tmpDir);

    const writeSpy = vi.spyOn(storage as any, 'flushToDisk');

    storage.set(makeSession('a'));
    storage.set(makeSession('b'));
    storage.set(makeSession('c'));

    // 防抖窗口内：尚未写盘
    expect(writeSpy).toHaveBeenCalledTimes(0);

    // 推进时间触发防抖
    await vi.runAllTimersAsync();

    // 三次 set 合并成一次写盘
    expect(writeSpy).toHaveBeenCalledTimes(1);

    storage.destroy();
  });

  // ── RED 2: 防抖窗口结束后数据确实写入文件 ─────────────────────────────────

  it('防抖触发后数据持久化到文件', async () => {
    const { SessionStorage } = await import('./storage.js');
    const storage = new SessionStorage(tmpDir);

    storage.set(makeSession('x'));
    storage.set(makeSession('y'));

    // 触发前文件不存在或内容为空
    const before = readFile(tmpDir);
    expect(before.find(s => s.id === 'x')).toBeUndefined();

    await vi.runAllTimersAsync();

    const after = readFile(tmpDir);
    expect(after.find(s => s.id === 'x')).toBeDefined();
    expect(after.find(s => s.id === 'y')).toBeDefined();

    storage.destroy();
  });

  // ── RED 3: flushSync 立即写盘（进程退出场景） ──────────────────────────────

  it('flushSync 立即将内存数据写入文件（不等待防抖）', async () => {
    const { SessionStorage } = await import('./storage.js');
    const storage = new SessionStorage(tmpDir);

    storage.set(makeSession('z'));

    // 不推进时间，直接 flush
    storage.flushSync();

    const written = readFile(tmpDir);
    expect(written.find(s => s.id === 'z')).toBeDefined();

    storage.destroy();
  });

  // ── RED 4: destroy 取消待执行的防抖，避免写入已销毁实例 ───────────────────

  it('destroy 后不再触发任何写盘', async () => {
    const { SessionStorage } = await import('./storage.js');
    const storage = new SessionStorage(tmpDir);

    const writeSpy = vi.spyOn(storage as any, 'flushToDisk');
    storage.set(makeSession('gone'));
    storage.destroy();

    await vi.runAllTimersAsync();

    expect(writeSpy).not.toHaveBeenCalled();
  });
});
