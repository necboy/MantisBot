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

  // Ensure data directory exists
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  db = new Database(dbPath);
  initializeSchema();
  return db;
}

export function getMemoryDb(): Database.Database {
  if (!db) {
    return initMemoryDb();
  }
  return db;
}

function initializeSchema(): void {
  if (!db) return;

  // Create chunks_vec table
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

  // Create FTS table
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
      content,
      content_agent_id,
      content_session_key
    )
  `);

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_chunks_agent ON chunks_vec(agent_id);
    CREATE INDEX IF NOT EXISTS idx_chunks_session ON chunks_vec(session_key);
    CREATE INDEX IF NOT EXISTS idx_chunks_agent_session ON chunks_vec(agent_id, session_key, created_at DESC);
  `);

  console.log('[Memory] Database initialized');
}

export function closeMemoryDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
