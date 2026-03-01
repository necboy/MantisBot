// src/memory/db.ts
// 数据库初始化和连接 - 使用 Node.js 内置 sqlite

import { NodeSqliteDatabase, initMemoryDb, getMemoryDb, closeMemoryDb } from './node-sqlite-db.js';

// 重新导出新的实现
export {
  NodeSqliteDatabase,
  initMemoryDb,
  getMemoryDb,
  closeMemoryDb
};

// 向后兼容的类型别名
export type Database = NodeSqliteDatabase;
