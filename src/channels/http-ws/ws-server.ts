// src/channels/http-ws/ws-server.ts

import { WebSocketServer, WebSocket } from 'ws';
import type { Server, IncomingMessage } from 'http';
import { v4 as uuidv4 } from 'uuid';
import type { GlobalErrorHandler } from '../../reliability/global-error-handler.js';

export interface WSMessage {
  type: string;
  payload: any;
}

export interface WSServerOptions {
  onMessage: (ws: WebSocket, message: WSMessage) => Promise<void>;
  errorHandler?: GlobalErrorHandler;
}

let wssInstance: WebSocketServer | null = null;

// 存储客户端信息
const clientInfoMap = new Map<string, {
  id: string;
  userAgent: string;
  ip: string;
  connectedAt: number;
}>();

export function createWSServer(server: Server, options: WSServerOptions) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  wssInstance = wss;

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const clientId = uuidv4();

    // 获取客户端信息
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const ip = req.socket.remoteAddress || 'Unknown';

    // 解析 User-Agent 来识别浏览器
    let browserInfo = 'Unknown';
    if (userAgent.includes('Chrome')) {
      const match = userAgent.match(/Chrome\/(\d+)/);
      browserInfo = match ? `Chrome ${match[1]}` : 'Chrome';
    } else if (userAgent.includes('Firefox')) {
      const match = userAgent.match(/Firefox\/(\d+)/);
      browserInfo = match ? `Firefox ${match[1]}` : 'Firefox';
    } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
      const match = userAgent.match(/Version\/(\d+)/);
      browserInfo = match ? `Safari ${match[1]}` : 'Safari';
    } else if (userAgent.includes('Edg')) {
      const match = userAgent.match(/Edg\/(\d+)/);
      browserInfo = match ? `Edge ${match[1]}` : 'Edge';
    }

    // 存储客户端信息
    clientInfoMap.set(clientId, {
      id: clientId,
      userAgent,
      ip,
      connectedAt: Date.now()
    });

    console.log(`[WSServer] Client connected: ${clientId}`);
    console.log(`[WSServer]   - Browser: ${browserInfo}`);
    console.log(`[WSServer]   - IP: ${ip}`);
    console.log(`[WSServer]   - User-Agent: ${userAgent}`);
    console.log(`[WSServer]   - Total active connections: ${wss.clients.size}`);

    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as WSMessage;
        await options.onMessage(ws, message);
      } catch (error) {
        console.error('[WSServer] Error handling message:', error);

        // 使用GlobalErrorHandler处理错误（简化版本）
        let errorMessage = 'Invalid message format';
        if (options.errorHandler) {
          try {
            console.log('[WSServer] Error handler processing WebSocket error');
            errorMessage = `WebSocket message error: ${(error as Error)?.message || 'Invalid format'}`;
          } catch (handlerError) {
            console.error('[WSServer] Error handler failed:', handlerError);
          }
        }

        // 发送结构化错误响应给客户端
        try {
          ws.send(JSON.stringify({
            type: 'error',
            payload: {
              message: errorMessage,
              timestamp: Date.now(),
              recoverable: true
            }
          }));
        } catch (sendError) {
          console.error('[WSServer] Failed to send error response:', sendError);
        }
      }
    });

    ws.on('close', () => {
      const info = clientInfoMap.get(clientId);
      clientInfoMap.delete(clientId);
      console.log(`[WSServer] Client disconnected: ${clientId}`);
      if (info) {
        console.log(`[WSServer]   - Browser: ${info.userAgent.includes('Chrome') ? 'Chrome' : info.userAgent.includes('Firefox') ? 'Firefox' : 'Other'}`);
        console.log(`[WSServer]   - Duration: ${Math.round((Date.now() - info.connectedAt) / 1000)}s`);
      }
      console.log(`[WSServer]   - Remaining connections: ${wss.clients.size}`);
    });
  });

  return wss;
}

/**
 * 广播消息到所有连接的 WebSocket 客户端
 */
export function broadcastToClients(type: string, payload: any): void {
  if (!wssInstance) {
    console.warn('[WSServer] No WebSocket server instance');
    return;
  }

  const message = JSON.stringify({ type, payload });
  let sentCount = 0;

  wssInstance.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
      sentCount++;
    }
  });

  console.log(`[WSServer] Broadcast to ${sentCount} clients: ${type} (total: ${wssInstance.clients.size})`);
}

/**
 * 发送消息到特定的客户端
 */
export function sendToClient(ws: WebSocket, type: string, payload: any): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, payload }));
  }
}

/**
 * 广播消息（带附件）到所有连接的 WebSocket 客户端
 * 用于定时任务等服务器主动推送场景
 */
export function broadcastToClientsWithAttachments(
  sessionId: string,
  message: string,
  attachments?: Array<{ name: string; url: string }>
): void {
  if (!wssInstance) {
    console.warn('[WSServer] No WebSocket server instance');
    return;
  }

  const payload: any = {
    sessionId,
    message: {
      id: uuidv4(),
      role: 'assistant',
      content: message,
      timestamp: Date.now(),
      attachments: attachments || []
    }
  };

  const wsMessage = JSON.stringify({ type: 'chat-response', payload });
  let sentCount = 0;

  wssInstance.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(wsMessage);
      sentCount++;
    }
  });

  console.log(`[WSServer] Broadcast chat-response to ${sentCount} clients for session ${sessionId}`);
}
