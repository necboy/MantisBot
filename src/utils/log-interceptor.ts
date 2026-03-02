// src/utils/log-interceptor.ts
// 拦截 console 输出，通过 WebSocket 实时推送日志到前端

import { v4 as uuidv4 } from 'uuid';
import { broadcastToClients } from '../channels/http-ws/ws-server.js';

export interface LogEntry {
  id: string;
  level: 'log' | 'info' | 'warn' | 'error';
  message: string;
  source: string;
  category: 'agent' | 'system';
  timestamp: number;
}

// Agent 相关的 source 关键字，用于判断 category
const AGENT_SOURCE_KEYWORDS = [
  'Agent', 'Runner', 'Tool', 'Skill', 'LLM', 'Memory', 'Cron',
  'MantisBot', 'ClaudeAgent', 'OpenAICompat', 'ToolRegistry',
  'PreferenceDetector', 'EvolutionProposer', 'AutoReply',
];

function parseSource(args: unknown[]): string {
  const first = args[0];
  if (typeof first === 'string') {
    const match = first.match(/^\[([^\]]+)\]/);
    if (match) return match[1];
  }
  return 'System';
}

function categorize(source: string): 'agent' | 'system' {
  return AGENT_SOURCE_KEYWORDS.some(kw =>
    source.toLowerCase().includes(kw.toLowerCase())
  ) ? 'agent' : 'system';
}

function formatMessage(args: unknown[]): string {
  return args.map(a =>
    typeof a === 'string' ? a :
    a instanceof Error ? `${a.message}\n${a.stack}` :
    JSON.stringify(a, null, 0)
  ).join(' ');
}

let installed = false;
let broadcasting = false; // 防止 broadcastToClients 内部的 console.log 触发递归

export function installLogInterceptor(): void {
  if (installed) return;
  installed = true;

  const originalMethods = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  function intercept(level: LogEntry['level'], originalFn: (...args: unknown[]) => void) {
    return (...args: unknown[]) => {
      // 保留原始终端输出
      originalFn(...args);

      // 避免 broadcastToClients 内部 console.log 触发递归
      if (broadcasting) return;

      try {
        broadcasting = true;
        const source = parseSource(args);
        const entry: LogEntry = {
          id: uuidv4(),
          level,
          message: formatMessage(args),
          source,
          category: categorize(source),
          timestamp: Date.now(),
        };
        broadcastToClients('log', entry);
      } catch {
        // 拦截器本身出错时静默处理，不影响原始日志
      } finally {
        broadcasting = false;
      }
    };
  }

  console.log = intercept('log', originalMethods.log);
  console.info = intercept('info', originalMethods.info);
  console.warn = intercept('warn', originalMethods.warn);
  console.error = intercept('error', originalMethods.error);
}
