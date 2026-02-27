// src/memory/db.ts

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = join(__dirname, '../../data');

let db: Database.Database | null = null;
let dbPath: string | null = null;

export function initMemoryDb(workspace?: string): Database.Database {
  const dataDir = workspace || DEFAULT_DATA_DIR;
  dbPath = join(dataDir, 'memory.db');

  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  db = new Database(dbPath);
  initializeSchema(db);
  return db;
}

export function getMemoryDb(): Database.Database {
  if (!db) {
    return initMemoryDb();
  }
  return db;
}

function initializeSchema(db: Database.Database): void {
  // 主向量存储表
  db.exec(`
    CREATE TABLE IF NOT EXISTS chunks_vec (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      session_key TEXT,
      content TEXT NOT NULL,
      embedding BLOB,
      source TEXT,
      created_at INTEGER NOT NULL
    )
  `);

  // FTS5 全文搜索表（含 id UNINDEXED 列，用于可靠的 JOIN）
  // 先检测是否需要 schema 迁移
  migrateFtsSchema(db);

  // 索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_chunks_agent ON chunks_vec(agent_id);
    CREATE INDEX IF NOT EXISTS idx_chunks_session ON chunks_vec(session_key);
    CREATE INDEX IF NOT EXISTS idx_chunks_agent_session ON chunks_vec(agent_id, session_key, created_at DESC);
  `);

  console.log('[Memory] Database initialized');
}

/**
 * 迁移 FTS 表 schema：添加 id UNINDEXED 列
 * 旧版本使用 rowid 做 JOIN（不可靠），新版本在 FTS 表中显式存储 id
 */
function migrateFtsSchema(db: Database.Database): void {
  // 检查 FTS 表是否存在
  const tableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='chunks_fts'"
  ).get();

  if (!tableExists) {
    // 首次创建，直接使用新 schema
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
        id UNINDEXED,
        content,
        content_agent_id UNINDEXED,
        content_session_key UNINDEXED
      )
    `);
    console.log('[Memory] FTS table created with new schema');
    return;
  }

  // 检查是否已有 id 列
  const columns = db.prepare('PRAGMA table_info(chunks_fts)').all() as any[];
  const hasIdColumn = columns.some(col => col.name === 'id');

  if (!hasIdColumn) {
    console.log('[Memory] Migrating FTS schema: adding id column...');

    // 重建 FTS 表（SQLite FTS5 不支持 ALTER TABLE）
    db.exec('DROP TABLE IF EXISTS chunks_fts');
    db.exec(`
      CREATE VIRTUAL TABLE chunks_fts USING fts5(
        id UNINDEXED,
        content,
        content_agent_id UNINDEXED,
        content_session_key UNINDEXED
      )
    `);

    // 从主表回填数据
    const chunks = db.prepare(
      "SELECT id, agent_id, session_key, content FROM chunks_vec WHERE content IS NOT NULL"
    ).all() as any[];

    const insertStmt = db.prepare(
      'INSERT INTO chunks_fts (id, content, content_agent_id, content_session_key) VALUES (?, ?, ?, ?)'
    );
    const backfill = db.transaction(() => {
      for (const chunk of chunks) {
        insertStmt.run(String(chunk.id), chunk.content, chunk.agent_id, chunk.session_key || null);
      }
    });
    backfill();

    console.log(`[Memory] FTS migration complete, re-indexed ${chunks.length} chunks`);
  }
}

export function closeMemoryDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
