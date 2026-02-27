// src/channels/http-ws/auth-middleware.ts
// 简单的 HMAC-based 无状态访问验证

import { createHmac, createHash } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { getConfig } from '../../config/loader.js';

const HMAC_SECRET = 'mantisbot-auth-secret';

/**
 * 对明文密码进行 SHA-256 哈希，返回 "sha256:<hex>" 格式
 */
export function hashPassword(plain: string): string {
  const hex = createHash('sha256').update(plain).digest('hex');
  return `sha256:${hex}`;
}

/**
 * 验证提交的明文密码是否与存储值匹配
 * 存储值可以是 "sha256:<hex>"（哈希）或明文（旧格式）
 */
export function verifyPassword(submitted: string, stored: string): boolean {
  if (stored.startsWith('sha256:')) {
    const submittedHash = `sha256:${createHash('sha256').update(submitted).digest('hex')}`;
    return submittedHash === stored;
  }
  // 兼容旧版明文密码
  return submitted === stored;
}

/**
 * 根据用户名和存储密码值计算期望的 token（无状态，重启后仍有效）
 * 注意：使用存储值（可能是哈希）而非明文，确保 token 与存储值绑定
 */
export function computeToken(username: string, storedPassword: string): string {
  return createHmac('sha256', HMAC_SECRET)
    .update(`${username}:${storedPassword}`)
    .digest('hex');
}

/**
 * 从 Authorization 头或 query param 中提取 token
 */
function extractToken(req: Request): string | null {
  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  const queryToken = req.query?.token;
  if (typeof queryToken === 'string' && queryToken) {
    return queryToken;
  }
  return null;
}

/**
 * 创建 Express 鉴权中间件
 * 若 config.server.auth.enabled 为 false 或未配置，直接放行
 */
export function createAuthMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const config = getConfig();
    const authConfig = config.server?.auth;

    // 未启用鉴权，直接放行
    if (!authConfig?.enabled) {
      return next();
    }

    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized', message: '请先登录' });
    }

    const expectedToken = computeToken(authConfig.username, authConfig.password);
    if (token !== expectedToken) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Token 无效' });
    }

    next();
  };
}
