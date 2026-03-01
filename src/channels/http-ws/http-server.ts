// src/channels/http-ws/http-server.ts

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import multer from 'multer';
import AdmZip from 'adm-zip';
import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import type { SessionManager } from '../../session/manager.js';
import type { ToolRegistry } from '../../agents/tools/registry.js';
import { getConfig, loadConfig, saveConfig } from '../../config/loader.js';
import type { Config, EmailAccount, EmailConfig } from '../../config/schema.js';
import { createAuthMiddleware, computeToken, hashPassword, verifyPassword } from './auth-middleware.js';
import { EMAIL_PROVIDERS } from '../../config/schema.js';
import type { Message } from '../../types.js';
// AgentRunner 已移除，统一使用 ClaudeAgentRunner
import { getFileStorage } from '../../files/index.js';
import { getLLMClient, clearLLMClientCache } from '../../agents/llm-client.js';
import { resetEmbeddingsService } from '../../memory/embeddings.js';
import type { MemoryManager } from '../../memory/manager.js';
import exploreRouter from './explore-api.js';
import storageRouter from './storage-api.js';
import { createCronRoutes } from './cron-routes.js';
import type { CronService } from '../../cron/service.js';
import type { TunnelManager } from '../../tunnel/index.js';
import { createTunnelRoutes } from './tunnel-routes.js';
import profileRoutes from './profile-routes.js';
import evolutionRoutes from './evolution-routes.js';
import { broadcastToClients } from './ws-server.js';
import type { SkillsLoader } from '../../agents/skills/loader.js';
import { installSkillFromSource } from '../../agents/skills/github-installer.js';
import { preferenceDetector } from '../../agents/preference-detector.js';
import { evolutionProposer } from '../../agents/evolution-proposer.js';
import { evolutionStore } from '../../agents/evolution-store.js';
import { channelDefinitions, getChannelDefinition } from '../definitions/index.js';
import { hotStartChannel, hotStopChannel } from '../initializer.js';
import { CommandRegistry, registerHelpCommand } from '../../auto-reply/commands/registry.js';
import { registerClearCommand } from '../../auto-reply/commands/clear.js';
import { registerStatusCommand } from '../../auto-reply/commands/status.js';
import { registerWhoamiCommand } from '../../auto-reply/commands/whoami.js';
import { registerModelCommand } from '../../auto-reply/commands/model.js';
import { workDirManager } from '../../workdir/manager.js';
import { PluginLoader } from '../../plugins/loader.js';
import { createPluginRoutes } from './plugin-routes.js';
import { UnifiedAgentRunner, type IAgentRunner } from '../../agents/unified-runner.js';

// 存储活动的 Agent Runner 实例（用于权限请求响应）
// Key: sessionId, Value: agentRunner instance
const activeAgentRunners = new Map<string, IAgentRunner>();

// Initialize evolution store
evolutionStore.load().catch(err => {
  console.error('[HTTPServer] Failed to load evolution store:', err);
});

/**
 * 检测用户偏好并生成演变提议
 */
async function detectPreferencesAndPropose(sessionMessages: Message[]): Promise<void> {
  try {
    // 获取配置，检查是否禁用
    const config = getConfig();

    // 检查是否禁用 PreferenceDetector
    if (config.agent?.disablePreferenceDetector) {
      console.log('[PreferenceDetector] Disabled by config, skipping');
      return;
    }

    // 检测偏好 (LLM async analysis)
    const preferences = await preferenceDetector.detectPreferences(sessionMessages as any);

    // 检查是否需要触发演变
    if (preferenceDetector.shouldTriggerEvolution(preferences)) {
      console.log('[PreferenceDetector] Detected preferences that should trigger evolution:', preferences);

      // 检查是否禁用 EvolutionProposer
      if (config.agent?.disableEvolutionProposer) {
        console.log('[EvolutionProposer] Disabled by config, skipping proposal generation');
        return;
      }

      // 生成提议
      let proposal = null;
      try {
        proposal = await evolutionProposer.generateProposal(preferences);
      } catch (err) {
        console.error('[EvolutionProposer] Failed to generate proposal:', err);
      }

      if (proposal) {
        // 存储提议
        try {
          await evolutionStore.addProposal(proposal);
          console.log('[EvolutionStore] Created new proposal:', proposal.id);

          // 通过 WebSocket 通知前端
          broadcastToClients('evolution-proposal', {
            proposal: {
              id: proposal.id,
              profileName: proposal.profileName,
              file: proposal.file,
              reason: proposal.reason,
              status: proposal.status,
              createdAt: proposal.createdAt,
            }
          });
        } catch (err) {
          console.error('[EvolutionStore] Failed to save proposal:', err);
        }
      }
    }
  } catch (err) {
    console.error('[PreferenceDetector] Error detecting preferences:', err);
  }
}

export interface HTTPServerOptions {
  sessionManager: SessionManager;
  toolRegistry: ToolRegistry;
  skillsLoader: SkillsLoader;
  pluginLoader?: PluginLoader;
  onMessage: (message: any) => Promise<void>;
  memoryManager?: MemoryManager;
  cronService?: CronService;
  tunnelManager?: TunnelManager;
}

export async function createHTTPServer(options: HTTPServerOptions) {
  let config: Config = loadConfig();
  const app = express();

  // 初始化命令注册表（供 /api/chat/stream 和 /api/chat 使用）
  const commandRegistry = new CommandRegistry();
  registerHelpCommand(commandRegistry);
  registerClearCommand(commandRegistry, options.sessionManager);
  registerStatusCommand(commandRegistry, options.sessionManager);
  registerWhoamiCommand(commandRegistry);
  registerModelCommand(commandRegistry);

  // Plugin routes (if pluginLoader is provided)
  if (options.pluginLoader) {
    createPluginRoutes(app, options.pluginLoader);
  }

  // Middleware
  if (config.server.cors) {
    app.use(cors());
  }
  app.use(express.json({ limit: '100mb' })); // 增加请求体大小限制以支持大文件上传

  // Health check
  app.get('/health', (_, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  // 鉴权路由（不受 auth 中间件保护）
  app.post('/api/auth/login', (req, res) => {
    const cfg = getConfig();
    const authCfg = cfg.server?.auth;

    // 鉴权未启用，直接返回成功
    if (!authCfg?.enabled) {
      return res.json({ token: null, authEnabled: false });
    }

    const { username, password } = req.body || {};
    if (username === authCfg.username && verifyPassword(password, authCfg.password)) {
      const token = computeToken(authCfg.username, authCfg.password);
      return res.json({ token, authEnabled: true });
    }
    return res.status(401).json({ error: 'Invalid credentials', message: '账户或密码错误' });
  });

  app.get('/api/auth/check', (req, res) => {
    const cfg = getConfig();
    const authCfg = cfg.server?.auth;

    if (!authCfg?.enabled) {
      return res.json({ authEnabled: false, authenticated: true });
    }

    const authHeader = req.headers['authorization'];
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : (req.query?.token as string);
    const expectedToken = computeToken(authCfg.username, authCfg.password);
    const authenticated = token === expectedToken;
    return res.json({ authEnabled: true, authenticated });
  });

  // 应用鉴权中间件（保护所有 /api/* 路由，/api/auth/* 已在上面注册，不受影响）
  app.use('/api', createAuthMiddleware());

  // 修改鉴权凭据（受 auth 中间件保护）
  app.put('/api/config/auth', async (req, res) => {
    const cfg = getConfig();
    const authCfg = cfg.server?.auth;

    if (!authCfg?.enabled) {
      return res.status(400).json({ error: 'Auth not enabled', message: '鉴权未启用' });
    }

    const { username, currentPassword, newPassword } = req.body || {};

    // 验证当前密码
    if (!verifyPassword(currentPassword, authCfg.password)) {
      return res.status(401).json({ error: 'Invalid credentials', message: '当前密码错误' });
    }

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Invalid password', message: '新密码长度不能少于 6 位' });
    }

    // 存储哈希后的新密码
    const hashedPassword = hashPassword(newPassword);
    const newUsername = (username && username.trim()) ? username.trim() : authCfg.username;

    const newConfig: Config = {
      ...cfg,
      server: {
        ...cfg.server,
        auth: {
          ...authCfg,
          username: newUsername,
          password: hashedPassword,
        },
      },
    };

    try {
      await saveConfig(newConfig);
      // 返回新 token，以便前端更新 localStorage
      const newToken = computeToken(newUsername, hashedPassword);
      return res.json({ success: true, token: newToken, message: '凭据已更新' });
    } catch (err) {
      console.error('[Auth] Failed to save config:', err);
      return res.status(500).json({ error: 'Save failed', message: '保存配置失败' });
    }
  });
  app.get('/api/sessions', (_, res) => {
    const sessions = options.sessionManager.listSessions();
    res.json(sessions.map(s => ({
      id: s.id,
      name: s.name,
      model: s.model,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      messageCount: s.messages.length
    })));
  });

  app.get('/api/sessions/:id', (req, res) => {
    const session = options.sessionManager.getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(session);
  });

  // Update session (包括审批模式)
  app.put('/api/sessions/:id', (req, res) => {
    try {
      const { id } = req.params;
      const { approvalMode, name, model } = req.body;

      const session = options.sessionManager.getSession(id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // 更新字段
      if (approvalMode && ['auto', 'ask', 'dangerous'].includes(approvalMode)) {
        session.approvalMode = approvalMode;
        // 清除缓存的 AgentRunner，下次请求时创建新的
        const oldRunner = activeAgentRunners.get(id);
        if (oldRunner) {
          console.log('[HTTPServer] Disposing old AgentRunner due to approvalMode change:', id);
          if (oldRunner.dispose) {
            oldRunner.dispose();
          }
          activeAgentRunners.delete(id);
        }
      }
      if (name) {
        session.name = name;
      }
      if (model) {
        session.model = model;
      }

      options.sessionManager.updateSession(session);
      console.log('[HTTPServer] Updated session:', id, 'approvalMode:', session.approvalMode);
      res.json(session);
    } catch (error) {
      console.error('[HTTPServer] Update session error:', error);
      res.status(500).json({ error: 'Failed to update session' });
    }
  });

  app.delete('/api/sessions/:id', (req, res) => {
    try {
      const deleted = options.sessionManager.deleteSession(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: 'Session not found' });
      }
      res.status(204).send();
    } catch (error) {
      console.error('[HTTPServer] Delete session error:', error);
      res.status(500).json({ error: 'Failed to delete session' });
    }
  });

  // Create session
  app.post('/api/sessions', (req, res) => {
    const { name, model, approvalMode } = req.body;
    const config = getConfig();
    const session = options.sessionManager.createSession(
      uuidv4(),
      model || config.models[0]?.name
    );
    if (name) {
      session.name = name;
    }
    // 保存审批模式
    if (approvalMode && ['auto', 'ask', 'dangerous'].includes(approvalMode)) {
      session.approvalMode = approvalMode;
    }
    options.sessionManager.updateSession(session);
    res.status(201).json(session);
  });

  // Chat endpoint
  app.post('/api/chat', async (req, res): Promise<void> => {
    try {
      const { sessionId, message, model } = req.body;

      if (!message) {
        res.status(400).json({ error: 'Message is required' });
        return;
      }

      const config = getConfig();
      const chatId = sessionId || uuidv4();

      // Get or create session
      let session = sessionId ? options.sessionManager.getSession(sessionId) : null;
      if (!session) {
        session = options.sessionManager.createSession(
          chatId,
          model || config.models[0]?.name
        );
      } else if (model && session.model !== model) {
        // Update session model if frontend specifies a different model
        session.model = model;
        options.sessionManager.updateSession(session);
      }

      // Use onMessage callback to process through MessageDispatcher
      await options.onMessage({
        id: uuidv4(),
        content: message,
        chatId,
        userId: 'web-user',
        platform: 'web',
        timestamp: Date.now()
      });

      // Get updated session
      const updatedSession = options.sessionManager.getSession(chatId);
      if (!updatedSession) {
        throw new Error('Session not found after processing');
      }

      // Get last assistant message
      const lastMessage = updatedSession.messages[updatedSession.messages.length - 1];
      if (!lastMessage || lastMessage.role !== 'assistant') {
        throw new Error('No assistant response found');
      }

      res.json({
        sessionId: chatId,
        message: lastMessage
      });
    } catch (error) {
      console.error('[HTTPServer] Chat error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // SSE Stream Chat endpoint
  app.post('/api/chat/stream', async (req, res): Promise<void> => {
    try {
      const { sessionId, message, model } = req.body;

      if (!message) {
        res.status(400).json({ error: 'Message is required' });
        return;
      }

      const config = getConfig();

      // 调试日志：显示 session 获取情况
      console.log('[HTTPServer] /api/chat/stream called with sessionId:', sessionId, 'message:', message?.slice(0, 50));

      // Get or create session
      let session = sessionId ? options.sessionManager.getSession(sessionId) : null;
      const chatId = sessionId || uuidv4();
      if (!session) {
        console.log('[HTTPServer] Creating NEW session, chatId:', chatId);
        session = options.sessionManager.createSession(
          chatId,
          model || config.models[0]?.name
        );
      } else {
        console.log('[HTTPServer] Using EXISTING session, message count:', session.messages.length);
      }

      if (model && session.model !== model) {
        // Update session model if frontend specifies a different model
        session.model = model;
        options.sessionManager.updateSession(session);
      }

      // ── 斜杠命令检测 ──────────────────────────────────────────────
      // Web UI 用流式端点，但命令不需要流式，直接以 SSE done 事件返回即可
      const parsed = commandRegistry.parse(message);
      if (parsed) {
        const command = commandRegistry.get(parsed.command);
        if (command) {
          const cmdContext = { chatId, userId: 'web-user', platform: 'http-ws' };
          const response = await command.handler(parsed.args, cmdContext);

          // 把命令响应写入 session（让前端 /api/sessions/:id 能看到历史）
          options.sessionManager.addMessage(chatId, { role: 'user', content: message });
          const assistantMsg = options.sessionManager.addMessage(chatId, { role: 'assistant', content: response });

          // 以 SSE 格式返回（与正常流式响应格式完全一致，前端无需改动）
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');
          res.setHeader('X-Accel-Buffering', 'no');
          res.write(`event: chunk\ndata: ${JSON.stringify({ content: response })}\n\n`);
          res.write(`event: done\ndata: ${JSON.stringify({
            messageId: assistantMsg?.id || uuidv4(),
            attachments: undefined,
            sessionName: session.name
          })}\n\n`);
          res.end();
          console.log(`[HTTPServer] Command /${parsed.command} handled for session ${chatId}`);
          return;
        }
      }
      // ─────────────────────────────────────────────────────────────

      // Validate API key for the selected model — fail fast before any LLM call
      const resolvedModelName = session.model || config.defaultModel || config.models[0]?.name;
      const resolvedModelConfig = (config.models as any[]).find((m: any) => m.name === resolvedModelName);
      if (resolvedModelConfig && !resolvedModelConfig.apiKey?.trim()) {
        res.status(422).json({
          error: 'missing_api_key',
          model: resolvedModelName,
          messageKey: 'error.missingApiKey',
          messageArgs: { model: resolvedModelName },
          message: `模型「${resolvedModelName}」未配置 API Key，请前往「设置 → 模型配置」填写后重试。`
        });
        return;
      }

      // 复用已有的 Agent Runner 实例（保持会话上下文）
      // 如果是已存在的 session，尝试复用之前的 runner
      let agentRunner: IAgentRunner;
      const existingRunner = activeAgentRunners.get(session.id);

      if (existingRunner) {
        console.log('[HTTPServer] Reusing existing UnifiedAgentRunner for session:', session.id);
        agentRunner = existingRunner;
      } else {
        // 使用 session 指定的模型（前端选择），fallback 到配置默认值
        const modelName = session.model || config.defaultModel || config.models[0]?.name || 'MiniMax-M2.5';
        // 获取当前工作目录
        const cwd = workDirManager.getCurrentWorkDir();
        // 从持久化 session 恢复 claudeSessionId（用于 Claude Agent SDK resume）
        const claudeSessionId = session.claudeSessionId;
        if (claudeSessionId) {
          console.log('[HTTPServer] Resuming Claude SDK session:', claudeSessionId);
        }
        // 获取审批模式（默认为 dangerous - 仅危险操作询问）
        const approvalMode = session.approvalMode || 'dangerous';
        console.log('[HTTPServer] Approval mode for session:', session.id, '->', approvalMode);
        agentRunner = new UnifiedAgentRunner(options.toolRegistry, {
          model: modelName,
          maxIterations: 0,
          approvalMode: approvalMode,
          skillsLoader: options.skillsLoader,  // 传入 skillsLoader
          cwd: cwd,  // 传入工作目录
          claudeSessionId: claudeSessionId,  // 恢复 Claude SDK 会话
        });
        // 存储 agentRunner 实例（用于权限请求响应和后续复用）
        activeAgentRunners.set(session.id, agentRunner);
        console.log('[HTTPServer] Created new UnifiedAgentRunner for session:', session.id, 'cwd:', cwd, 'claudeSessionId:', claudeSessionId || '(new)', 'approvalMode:', approvalMode);
      }

      // 监听权限请求事件（通过 EventEmitter，仅 ClaudeAgentRunner 支持）
      if (agentRunner instanceof UnifiedAgentRunner) {
        agentRunner.on('permissionRequest', (permissionRequest) => {
          console.log('[HTTPServer] Permission request received via EventEmitter:', permissionRequest.requestId);
          res.write(`event: permission\ndata: ${JSON.stringify({
            requestId: permissionRequest.requestId,
            toolName: permissionRequest.toolName,
            toolInput: permissionRequest.toolInput,
            isDangerous: permissionRequest.isDangerous,
            reason: permissionRequest.reason,
          })}\n\n`);
          (res as any).flush?.();
        });
      }

      // Add user message
      session.messages.push({
        id: uuidv4(),
        role: 'user',
        content: message,
        timestamp: Date.now()
      });

      // 🚀 在用户提交第一条消息后立即生成标题（不等待 AI 响应完成）
      // 这样用户可以更快看到有意义的会话标题
      const needsTitle = !session.name || session.name === 'New Chat' || session.name === '新对话';
      if (needsTitle && message.trim()) {
        const sessionRef = session;
        const modelName = session.model || config.defaultModel || config.models[0]?.name;
        getLLMClient().generateTitle(message, modelName).then(title => {
          sessionRef.name = title;
          options.sessionManager.updateSession(sessionRef);
          // 通过 WebSocket 广播更新后的 session 名称
          broadcastToClients('session-renamed', { sessionId: sessionRef.id, name: title });
          console.log('[HTTPServer] Title generated (early):', title, 'for session:', sessionRef.id);
        }).catch(err => {
          console.error('[HTTPServer] Failed to generate title (early):', err);
        });
      }

      // Setup SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

      // 调试日志：显示历史消息数量
      console.log('[HTTPServer] Session messages BEFORE adding user message:', session.messages.length, 'messages:', session.messages.map(m => ({ role: m.role, content: m.content?.slice(0, 30) })));

      const history = session.messages.map(m => ({
        role: m.role,
        content: m.content
      }));

      // 调试日志：显示构建的 history
      console.log('[HTTPServer] History built, total messages:', history.length, 'roles:', history.map(m => m.role));

      let fullContent = '';
      const attachments: any[] = [];

      // 记忆检索：在 streamRun 前搜索相关记忆，构建上下文提示词
      let contextualMessage = message;
      if (options.memoryManager) {
        try {
          const memories = await options.memoryManager.searchHybrid('default', message, {
            limit: 7,
            sessionKey: undefined  // 跨 session 搜索
          });
          console.log(`[HTTPServer] Memory search found ${memories.length} memories for stream`);
          if (memories.length > 0) {
            const memoryContext = memories.map((m, i) => `${i + 1}. ${m.content}`).join('\n');
            contextualMessage = `📋 **相关记忆**（请在回答前先参考这些信息）：\n${memoryContext}\n\n---\n\n💬 **用户问题**：\n${message}\n\n💡 **提示**：请先查看上面的相关记忆，然后回答用户问题。如果记忆中有相关信息，请直接使用。`;
          }
        } catch (err) {
          console.error('[HTTPServer] Memory search failed (stream):', err);
        }
      }

      // Stream process
      for await (const chunk of agentRunner.streamRun(contextualMessage, history)) {
        const chunkAny = chunk as any;

        // 思考过程事件 - 流式输出思考内容
        if (chunk.type === 'thinking' && chunk.content) {
          console.log('[HTTPServer] Sending thinking event:', chunk.content.slice(0, 50));
          res.write(`event: thinking\ndata: ${JSON.stringify({ content: chunk.content })}\n\n`);
          (res as any).flush?.();
        } else if (chunk.type === 'text' && chunk.content) {
          fullContent += chunk.content;
          console.log('[HTTPServer] Sending chunk event:', chunk.content.slice(0, 50));
          res.write(`event: chunk\ndata: ${JSON.stringify({ content: chunk.content })}\n\n`);
          (res as any).flush?.();
        } else if (chunk.type === 'tool_use') {
          console.log('[HTTPServer] Tool start:', chunk.tool, chunk.args);
          res.write(`event: tool\ndata: ${JSON.stringify({
            tool: chunk.tool,
            toolId: chunk.toolId,
            status: 'start',
            args: chunk.args
          })}\n\n`);
          (res as any).flush?.();
        } else if (chunk.type === 'tool_result') {
          console.log('[HTTPServer] Tool end:', chunk.tool, 'Args:', chunk.args, 'Result type:', typeof chunk.result);
          res.write(`event: tool\ndata: ${JSON.stringify({
            tool: chunk.tool,
            toolId: chunk.toolId,
            status: 'end',
            args: chunk.args,
            result: chunk.result,
            isError: chunk.isError
          })}\n\n`);
          (res as any).flush?.();
        } else if (chunk.type === 'permission') {
          // 权限请求事件
          const perm = chunkAny.permission;
          console.log('[HTTPServer] Permission request:', perm);
          res.write(`event: permission\ndata: ${JSON.stringify({
            requestId: perm.requestId,
            toolName: perm.toolName,
            toolInput: perm.toolInput,
            isDangerous: perm.isDangerous,
            reason: perm.reason,
          })}\n\n`);
          (res as any).flush?.();
        } else if (chunk.type === 'error') {
          // 错误事件
          console.log('[HTTPServer] Error:', chunk.content);
          res.write(`event: error\ndata: ${JSON.stringify({ content: chunk.content })}\n\n`);
          (res as any).flush?.();
        } else if (chunk.type === 'complete') {
          // Save message to session
          const assistantMessage = {
            id: uuidv4(),
            role: 'assistant' as const,
            content: fullContent,
            timestamp: Date.now(),
            attachments: chunk.attachments
          };
          session.messages.push(assistantMessage);

          // 保存 Claude SDK 的 sessionId 到持久化 session（用于重启后恢复上下文）
          const newClaudeSessionId = agentRunner.getSessionId?.();
          if (newClaudeSessionId && newClaudeSessionId !== session.claudeSessionId) {
            session.claudeSessionId = newClaudeSessionId;
            console.log('[HTTPServer] Saved claudeSessionId to session:', newClaudeSessionId);
          }

          options.sessionManager.updateSession(session);

          // 后台异步存储记忆（不阻塞响应）
          if (options.memoryManager) {
            options.memoryManager.add({
              agentId: 'default',
              sessionKey: chatId,
              content: `用户: ${message}`,
              source: 'user',
              createdAt: Date.now(),
            }).catch(err => console.error('[HTTPServer] 记忆存储失败 (用户消息):', err));
            options.memoryManager.add({
              agentId: 'default',
              sessionKey: chatId,
              content: `助手: ${fullContent}`,
              source: 'assistant',
              createdAt: Date.now(),
            }).catch(err => console.error('[HTTPServer] 记忆存储失败 (助手消息):', err));
          }

          // ⚡ 发送 done 事件（标题已在用户提交消息时提前生成）
          const doneData = {
            messageId: assistantMessage.id,
            attachments: chunk.attachments,
            sessionName: session.name
          };
          console.log('[HTTPServer] Sending done event with attachments:', chunk.attachments?.length || 0);
          res.write(`event: done\ndata: ${JSON.stringify(doneData)}\n\n`);

          // 后台异步：检测用户偏好并生成演变提议（不阻塞响应）
          detectPreferencesAndPropose(session.messages).catch(err => {
            console.error('[HTTPServer] Failed to detect preferences (async):', err);
          });
        }
      }

      res.end();
    } catch (error: any) {
      console.error('[HTTPServer] Stream chat error:', error?.message || error, error?.stack);
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'Internal server error', detail: error?.message })}\n\n`);
      res.end();
    }
  });

  // Config routes
  app.get('/api/config', (_, res) => {
    try {
      const config = getConfig();
      res.json({
        models: config.models.map(m => ({
          name: m.name,
          provider: m.provider || m.protocol || 'openai',
          model: m.model
        })),
        defaultModel: config.defaultModel || (config.models.length > 0 ? config.models[0].name : null),
        officePreviewServer: config.officePreviewServer  // 添加 Office 预览服务器配置
      });
    } catch (error) {
      console.error('[HTTPServer] Config error:', error);
      res.status(500).json({ error: 'Failed to get config' });
    }
  });

  // Allowed paths routes
  app.get('/api/config/allowed-paths', (_, res) => {
    try {
      const config = getConfig();
      res.json({ allowedPaths: config.allowedPaths || [] });
    } catch (error) {
      console.error('[HTTPServer] Allowed paths error:', error);
      res.status(500).json({ error: 'Failed to get allowed paths' });
    }
  });

  app.put('/api/config/allowed-paths', (req, res) => {
    try {
      const { allowedPaths } = req.body;
      if (!Array.isArray(allowedPaths)) {
        return res.status(400).json({ error: 'allowedPaths must be an array' });
      }

      const config = getConfig();
      config.allowedPaths = allowedPaths;
      saveConfig(config);

      res.json({ allowedPaths: config.allowedPaths || [] });
    } catch (error) {
      console.error('[HTTPServer] Allowed paths update error:', error);
      res.status(500).json({ error: 'Failed to update allowed paths' });
    }
  });

  // Firecrawl API Key routes
  app.get('/api/config/firecrawl', (_, res) => {
    try {
      const config = getConfig();
      const apiKey = config.firecrawlApiKey || '';
      res.json({ apiKey: apiKey ? '***configured***' : '', configured: !!apiKey });
    } catch (error) {
      console.error('[HTTPServer] Firecrawl config error:', error);
      res.status(500).json({ error: 'Failed to get firecrawl config' });
    }
  });

  app.put('/api/config/firecrawl', async (req, res) => {
    try {
      const { apiKey } = req.body;
      if (typeof apiKey !== 'string') {
        return res.status(400).json({ error: 'apiKey must be a string' });
      }

      const config = getConfig();
      if (apiKey.trim()) {
        config.firecrawlApiKey = apiKey.trim();
        // 热加载：立即更新当前进程的环境变量
        process.env.FIRECRAWL_API_KEY = apiKey.trim();
      } else {
        delete config.firecrawlApiKey;
        delete process.env.FIRECRAWL_API_KEY;
      }
      await saveConfig(config);

      res.json({ success: true, configured: !!config.firecrawlApiKey });
    } catch (error) {
      console.error('[HTTPServer] Firecrawl config update error:', error);
      res.status(500).json({ error: 'Failed to update firecrawl config' });
    }
  });

  // Reload config from disk
  app.post('/api/config/reload', async (_, res) => {
    try {
      loadConfig();
      res.json({ success: true, message: 'Configuration reloaded from disk' });
    } catch (error) {
      console.error('[HTTPServer] Config reload error:', error);
      res.status(500).json({ error: 'Failed to reload config' });
    }
  });

  // GET /api/models - Get all models
  app.get('/api/models', (_, res) => {
    try {
      const models = config.models.map(m => {
        const model: any = {
          name: m.name,
          model: m.model,
          apiKey: m.apiKey ? '***' : undefined, // Hide API Key
          baseUrl: m.baseUrl,
          baseURL: m.baseURL,
          endpoint: m.endpoint,
        };
        // 新字段
        if ((m as any).protocol) model.protocol = (m as any).protocol;
        if ((m as any).provider) model.provider = (m as any).provider;
        // 向后兼容：也返回 type 字段
        model.type = (m as any).type || (m as any).protocol || 'openai';
        return model;
      });

      res.json({
        models,
        defaultModel: config.defaultModel || (models.length > 0 ? models[0].name : null)
      });
    } catch (error) {
      console.error('[API] Failed to get models:', error);
      res.status(500).json({ error: 'Failed to get models' });
    }
  });

  // Tools API - 列出所有可用工具
  app.get('/api/tools', (_, res) => {
    try {
      const tools = options.toolRegistry.listTools();
      res.json(tools);
    } catch (error) {
      console.error('[HTTPServer] Tools error:', error);
      res.status(500).json({ error: 'Failed to list tools' });
    }
  });

  // Skills API - 获取所有技能及其启用/禁用状态
  // 使用 enabledSkills 配置：只在列表中的才启用（默认禁用模式）
  app.get('/api/skills', (_, res) => {
    try {
      const allSkills = options.skillsLoader.list();
      const enabledSkills = config.enabledSkills || [];

      const skills = allSkills.map(s => ({
        name: s.name,
        description: s.description,
        enabled: enabledSkills.includes(s.name),
        source: s.skill.source,
        filePath: s.skill.filePath
      }));

      res.json({ skills });
    } catch (error) {
      console.error('[API] Failed to get skills:', error);
      res.status(500).json({ error: 'Failed to get skills' });
    }
  });

  // 热重载 skills：重新扫描 skills 目录，无需重启服务（必须在 /:name/toggle 之前注册）
  app.post('/api/skills/reload', async (_, res) => {
    try {
      const { count } = await options.skillsLoader.reload();
      console.log(`[HTTPServer] Skills reloaded: ${count} skills found`);
      res.json({ success: true, count });
    } catch (error) {
      console.error('[HTTPServer] Failed to reload skills:', error);
      res.status(500).json({ error: 'Failed to reload skills' });
    }
  });

  // 从 GitHub 安装 skill：下载仓库并复制到 skills 目录，随后热重载
  app.post('/api/skills/install', async (req, res) => {
    try {
      const { source } = req.body as { source?: string };
      if (!source?.trim()) {
        res.status(400).json({ success: false, error: 'Missing source parameter' });
        return;
      }

      const skillsDir = options.skillsLoader.getSkillsDir();
      const result = await installSkillFromSource(source.trim(), skillsDir);

      if (result.success) {
        // Hot-reload so the newly installed skills are immediately visible
        await options.skillsLoader.reload();
      }

      res.json(result);
    } catch (error) {
      console.error('[HTTPServer] Failed to install skill:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // Toggle skill enabled/disabled status
  // 修改 enabledSkills 列表：添加或移除 skill 名称
  app.post('/api/skills/:name/toggle', async (req, res) => {
    try {
      const skillName = req.params.name;
      const enabledSkills = config.enabledSkills || [];

      // Check if skill exists
      const skill = options.skillsLoader.get(skillName);
      if (!skill) {
        res.status(404).json({ error: `Skill not found: ${skillName}` });
        return;
      }

      const isCurrentlyEnabled = enabledSkills.includes(skillName);

      if (isCurrentlyEnabled) {
        // Disable: remove from enabledSkills
        config.enabledSkills = enabledSkills.filter(s => s !== skillName);
      } else {
        // Enable: add to enabledSkills
        config.enabledSkills = [...enabledSkills, skillName];
      }

      // Save configuration to file
      await saveConfig(config);

      res.json({
        skill: skillName,
        enabled: !isCurrentlyEnabled // Returns new state
      });
    } catch (error) {
      console.error('[API] Failed to toggle skill:', error);
      res.status(500).json({ error: 'Failed to toggle skill' });
    }
  });

  // Download skill as .skill file
  // GET /api/skills/:name/download - 打包并下载 skill 文件
  app.get('/api/skills/:name/download', async (req, res) => {
    const execFileAsync = promisify(execFile);
    let tmpDir: string | null = null;
    try {
      const skillName = req.params.name;
      const loaded = options.skillsLoader.get(skillName);
      if (!loaded) {
        res.status(404).json({ error: `Skill not found: ${skillName}` });
        return;
      }

      const skillFilePath = loaded.skill.filePath;
      if (!skillFilePath) {
        res.status(400).json({ error: 'Skill has no file path' });
        return;
      }

      const skillDir = path.dirname(skillFilePath);
      const skillsDir = options.skillsLoader.getSkillsDir();
      const packageScript = path.join(skillsDir, 'skill-creator/scripts/package_skill.py');

      if (!fs.existsSync(packageScript)) {
        res.status(500).json({ error: 'package_skill.py not found' });
        return;
      }

      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-pkg-'));
      await execFileAsync('python3', [packageScript, skillDir, tmpDir]);

      const outputFile = path.join(tmpDir, `${skillName}.skill`);
      if (!fs.existsSync(outputFile)) {
        res.status(500).json({ error: 'Packaging failed: output file not created' });
        return;
      }

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${skillName}.skill"`);
      const stream = fs.createReadStream(outputFile);
      stream.on('end', () => {
        if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
      });
      stream.pipe(res);
    } catch (error: any) {
      if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
      const stderr = error?.stderr || '';
      console.error('[API] Failed to package skill:', error);
      res.status(500).json({ error: `Packaging failed: ${stderr || String(error)}` });
    }
  });

  // Upload .skill file to install
  // POST /api/skills/upload - 从 .skill 文件安装 skill
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (_req, file, cb) => {
      if (path.extname(file.originalname).toLowerCase() === '.skill') {
        cb(null, true);
      } else {
        cb(new Error('Only .skill files are allowed'));
      }
    }
  });

  app.post('/api/skills/upload', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, error: 'No file uploaded' });
        return;
      }

      const skillsDir = options.skillsLoader.getSkillsDir();
      const zip = new AdmZip(req.file.buffer);
      const entries = zip.getEntries();

      // .skill 文件内部结构：<skillName>/SKILL.md 等
      // 找到顶层目录名作为 skill 名称
      const topDirs = new Set<string>();
      for (const entry of entries) {
        const parts = entry.entryName.split('/');
        if (parts[0]) topDirs.add(parts[0]);
      }

      if (topDirs.size === 0) {
        res.status(400).json({ success: false, error: 'Invalid .skill file: empty archive' });
        return;
      }

      // 解压到 skills 目录
      zip.extractAllTo(skillsDir, true);

      const installed = Array.from(topDirs);
      await options.skillsLoader.reload();

      console.log(`[API] Installed skill(s) from upload: ${installed.join(', ')}`);
      res.json({ success: true, installed });
    } catch (error: any) {
      console.error('[API] Failed to upload skill:', error);
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // List all files in a skill directory
  // GET /api/skills/:name/files
  app.get('/api/skills/:name/files', (req, res) => {
    try {
      const skillName = req.params.name;
      const loaded = options.skillsLoader.get(skillName);
      if (!loaded) {
        res.status(404).json({ error: `Skill not found: ${skillName}` });
        return;
      }
      const skillDir = path.normalize(path.dirname(loaded.skill.filePath));
      const files: string[] = [];
      function walkDir(dir: string) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory() && !entry.isSymbolicLink()) {
            walkDir(fullPath);
          } else if (!entry.isDirectory()) {
            files.push(path.relative(skillDir, fullPath));
          }
        }
      }
      walkDir(skillDir);
      res.json({ files });
    } catch (error) {
      console.error('[API] Failed to list skill files:', error);
      res.status(500).json({ error: 'Failed to list skill files' });
    }
  });

  // Read a specific file from a skill directory
  // GET /api/skills/:name/file?path=relative/path
  app.get('/api/skills/:name/file', async (req, res) => {
    try {
      const skillName = req.params.name;
      const filePath = req.query.path as string;
      if (!filePath) {
        res.status(400).json({ error: 'Missing path query parameter' });
        return;
      }
      const loaded = options.skillsLoader.get(skillName);
      if (!loaded) {
        res.status(404).json({ error: `Skill not found: ${skillName}` });
        return;
      }
      const skillDir = path.normalize(path.dirname(loaded.skill.filePath));
      const targetPath = path.normalize(path.resolve(skillDir, filePath));
      if (!targetPath.startsWith(skillDir + path.sep)) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }
      if (!fs.existsSync(targetPath)) {
        res.status(404).json({ error: 'File not found' });
        return;
      }
      const content = await fs.promises.readFile(targetPath, 'utf-8');
      res.json({ content });
    } catch (error) {
      console.error('[API] Failed to read skill file:', error);
      res.status(500).json({ error: 'Failed to read skill file' });
    }
  });

  // Save a specific file in a skill directory
  // PUT /api/skills/:name/file?path=relative/path
  app.put('/api/skills/:name/file', async (req, res) => {
    try {
      const skillName = req.params.name;
      const filePath = req.query.path as string;
      const { content } = req.body as { content?: string };
      if (!filePath) {
        res.status(400).json({ error: 'Missing path query parameter' });
        return;
      }
      if (content === undefined) {
        res.status(400).json({ error: 'Missing content in request body' });
        return;
      }
      const loaded = options.skillsLoader.get(skillName);
      if (!loaded) {
        res.status(404).json({ error: `Skill not found: ${skillName}` });
        return;
      }
      const skillDir = path.normalize(path.dirname(loaded.skill.filePath));
      const targetPath = path.normalize(path.resolve(skillDir, filePath));
      if (!targetPath.startsWith(skillDir + path.sep)) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }
      await fs.promises.writeFile(targetPath, content, 'utf-8');
      // Hot-reload if SKILL.md was modified to update skill metadata
      if (path.basename(targetPath) === 'SKILL.md') {
        await options.skillsLoader.reload();
      }
      res.json({ success: true });
    } catch (error) {
      console.error('[API] Failed to save skill file:', error);
      res.status(500).json({ error: 'Failed to save skill file' });
    }
  });

  // Commands API - 获取所有 plugin commands
  app.get('/api/commands', (_, res) => {
    try {
      const commands: Array<{ name: string; description: string; plugin: string }> = [];

      // 如果有 pluginLoader，获取 plugin commands
      if (options.pluginLoader) {
        const pluginCommands = options.pluginLoader.getCommands();
        for (const cmd of pluginCommands) {
          commands.push({
            name: `${cmd.pluginName}:${cmd.name}`,
            description: cmd.description,
            plugin: cmd.pluginName
          });
        }
      }

      // 添加内置 commands
      commands.push(
        { name: 'help', description: '显示帮助信息', plugin: 'system' },
        { name: 'clear', description: '清空当前会话消息', plugin: 'system' },
        { name: 'status', description: '显示当前状态', plugin: 'system' },
        { name: 'whoami', description: '显示当前用户信息', plugin: 'system' },
        { name: 'model', description: '查看或切换模型', plugin: 'system' }
      );

      res.json({ commands });
    } catch (error) {
      console.error('[API] Failed to get commands:', error);
      res.status(500).json({ error: 'Failed to get commands' });
    }
  });

  // POST /api/models - Add new model
  app.post('/api/models', async (req, res) => {
    try {
      const { name, protocol, provider, model, apiKey, baseUrl, endpoint } = req.body;

      // Validate required fields
      if (!name || !model) {
        res.status(400).json({ error: 'Missing required fields: name, model' });
        return;
      }

      // 需要有 protocol 或 provider
      if (!protocol && !provider) {
        res.status(400).json({ error: 'Missing required fields: protocol or provider' });
        return;
      }

      // Check if name already exists
      if (config.models.some((m: any) => m.name === name)) {
        res.status(409).json({ error: `Model "${name}" already exists` });
        return;
      }

      // Add new model
      const newModel: any = {
        name,
        model,
        apiKey,
      };

      // 新字段
      if (protocol) newModel.protocol = protocol;
      if (provider) newModel.provider = provider;

      // 端点配置（统一使用 baseURL 字段）
      if (baseUrl || endpoint) {
        newModel.baseURL = baseUrl || endpoint;
      }

      config.models.push(newModel);
      await saveConfig(config);
      clearLLMClientCache(); // 清理客户端缓存，实现热加载
      resetEmbeddingsService(); // 同步重置 embedding 服务（配置可能变更）

      res.json({ success: true, model: newModel });
    } catch (error) {
      console.error('[API] Failed to add model:', error);
      res.status(500).json({ error: 'Failed to add model' });
    }
  });

  // PUT /api/models/default - Set default model (must be before /:name)
  app.put('/api/models/default', async (req, res) => {
    try {
      const { name } = req.body;

      // Validate model exists
      if (!config.models.some(m => m.name === name)) {
        res.status(404).json({ error: `Model "${name}" not found` });
        return;
      }

      config.defaultModel = name;
      await saveConfig(config);
      clearLLMClientCache(); // 清理客户端缓存，实现热加载
      resetEmbeddingsService(); // 同步重置 embedding 服务（配置可能变更）

      res.json({ success: true, defaultModel: name });
    } catch (error) {
      console.error('[API] Failed to set default model:', error);
      res.status(500).json({ error: 'Failed to set default model' });
    }
  });

  // PUT /api/models/:name - Update model configuration
  app.put('/api/models/:name', async (req, res) => {
    try {
      const oldName = req.params.name;
      const { name, protocol, provider, model, apiKey, baseUrl, endpoint } = req.body;

      // Find model
      const modelIndex = config.models.findIndex((m: any) => m.name === oldName);
      if (modelIndex === -1) {
        res.status(404).json({ error: `Model "${oldName}" not found` });
        return;
      }

      // Update all fields (允许编辑模式下修改所有字段)
      const existingModel = config.models[modelIndex] as any;
      const updatedModel: any = {
        ...existingModel,
        name: name || existingModel.name,
      };

      // 更新 API Key（如果传入的是 *** 则保留原值）
      if (apiKey && apiKey !== '***') {
        updatedModel.apiKey = apiKey;
      } else if (apiKey === undefined) {
        // 如果没有传 apiKey，保留原值
        updatedModel.apiKey = existingModel.apiKey;
      }
      // 如果 apiKey === '***'，保留原值（不更新）

      // 更新协议和提供商
      if (protocol !== undefined) updatedModel.protocol = protocol;
      if (provider !== undefined) updatedModel.provider = provider;

      // 更新模型 ID
      if (model !== undefined) updatedModel.model = model;

      // 处理端点配置
      const newEndpoint = baseUrl || endpoint;
      if (newEndpoint !== undefined) {
        updatedModel.baseURL = newEndpoint || undefined;
        // 清理旧字段
        delete updatedModel.endpoint;
        delete updatedModel.baseUrl;
      }

      config.models[modelIndex] = updatedModel;

      // If name changed, update defaultModel if needed
      if (name && name !== oldName && config.defaultModel === oldName) {
        config.defaultModel = name;
      }

      await saveConfig(config);
      clearLLMClientCache(); // 清理客户端缓存，实现热加载
      resetEmbeddingsService(); // 同步重置 embedding 服务（配置可能变更）

      res.json({ success: true, model: config.models[modelIndex] });
    } catch (error) {
      console.error('[API] Failed to update model:', error);
      res.status(500).json({ error: 'Failed to update model' });
    }
  });

  // DELETE /api/models/:name - Delete model
  app.delete('/api/models/:name', async (req, res) => {
    try {
      const name = req.params.name;

      // Find model
      const modelIndex = config.models.findIndex(m => m.name === name);
      if (modelIndex === -1) {
        res.status(404).json({ error: `Model "${name}" not found` });
        return;
      }

      // Check if it's the last model
      if (config.models.length === 1) {
        res.status(400).json({ error: 'Cannot delete the last model' });
        return;
      }

      // Delete model
      config.models.splice(modelIndex, 1);

      // If deleted model was default, switch to first model
      if (config.defaultModel === name) {
        config.defaultModel = config.models[0]?.name;
      }

      await saveConfig(config);
      clearLLMClientCache(); // 清理客户端缓存，实现热加载
      resetEmbeddingsService(); // 同步重置 embedding 服务（配置可能变更）

      res.json({ success: true });
    } catch (error) {
      console.error('[API] Failed to delete model:', error);
      res.status(500).json({ error: 'Failed to delete model' });
    }
  });

  // POST /api/models/test - Test model configuration
  app.post('/api/models/test', async (req, res) => {
    try {
      const { name, protocol, provider, model, apiKey, baseUrl } = req.body;

      // Validate required fields
      if (!model) {
        res.status(400).json({ success: false, error: '模型 ID 不能为空' });
        return;
      }

      // 如果 apiKey 是 ***（前端显示占位符），需要从现有配置中获取真实密钥
      let testApiKey = apiKey;
      if (apiKey === '***' && name) {
        const existingModel = config.models.find((m: any) => m.name === name);
        if (existingModel) {
          testApiKey = existingModel.apiKey;
        }
      }

      if (!testApiKey || testApiKey === '***') {
        res.status(400).json({ success: false, error: 'API 密钥不能为空' });
        return;
      }

      // Determine the protocol to use
      const testProtocol = protocol || 'openai';

      // Determine the endpoint
      let testEndpoint = baseUrl;
      if (!testEndpoint && provider) {
        const { PROVIDER_DEFAULTS } = await import('../../config/schema.js');
        const providerConfig = PROVIDER_DEFAULTS[provider];
        if (providerConfig) {
          testEndpoint = providerConfig[testProtocol as 'openai' | 'anthropic'];
        }
      }

      if (!testEndpoint) {
        res.status(400).json({ success: false, error: 'API 端点不能为空' });
        return;
      }

      console.log(`[API] Testing model config: protocol=${testProtocol}, endpoint=${testEndpoint}, model=${model}`);

      // Test the connection based on protocol
      if (testProtocol === 'anthropic') {
        // Test Anthropic-compatible endpoint
        const Anthropic = (await import('@anthropic-ai/sdk')).default;

        // Check if it's MiniMax or GLM (need Bearer auth)
        const isMiniMax = testEndpoint.includes('minimaxi.com');
        const isGLM = testEndpoint.includes('bigmodel.cn');
        const needsBearerAuth = isMiniMax || isGLM;

        const client = new Anthropic({
          apiKey: needsBearerAuth ? 'placeholder' : testApiKey,
          baseURL: testEndpoint,
          defaultHeaders: needsBearerAuth ? {
            'Authorization': `Bearer ${testApiKey}`
          } : undefined,
        });

        // Send a minimal test request
        const message = await client.messages.create({
          model: model,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Hi' }],
        });

        res.json({
          success: true,
          message: '连接成功！模型响应正常',
          details: {
            model: message.model,
            responseLength: message.content?.length || 0,
          }
        });
      } else {
        // Test OpenAI-compatible endpoint
        const OpenAI = (await import('openai')).default;

        const client = new OpenAI({
          apiKey: testApiKey,
          baseURL: testEndpoint,
        });

        // Send a minimal test request
        const response = await client.chat.completions.create({
          model: model,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Hi' }],
        });

        res.json({
          success: true,
          message: '连接成功！模型响应正常',
          details: {
            model: response.model,
            responseLength: response.choices?.[0]?.message?.content?.length || 0,
          }
        });
      }
    } catch (error: any) {
      console.error('[API] Model test failed:', error);

      // Extract meaningful error message
      let errorMessage = '连接失败';
      if (error?.message) {
        errorMessage = error.message;
      }
      if (error?.error?.message) {
        errorMessage = error.error.message;
      }
      if (error?.status === 401) {
        errorMessage = 'API 密钥无效或已过期';
      }
      if (error?.status === 404) {
        errorMessage = 'API 端点或模型不存在';
      }
      if (error?.code === 'ENOTFOUND' || error?.code === 'ECONNREFUSED') {
        errorMessage = '无法连接到 API 端点';
      }

      res.json({
        success: false,
        error: errorMessage,
        details: error?.message || String(error),
      });
    }
  });

  // ========== Email Configuration APIs ==========

  // GET /api/email/config - 获取邮件配置（密码脱敏）
  app.get('/api/email/config', (_, res) => {
    try {
      const currentConfig = getConfig();
      const emailConfig = currentConfig.email || { enabled: false, accounts: [], defaultAccountId: undefined };

      // 密码脱敏
      const sanitizedAccounts = (emailConfig.accounts || []).map((account: EmailAccount) => ({
        ...account,
        password: account.password ? '***' : '',
      }));

      res.json({
        enabled: emailConfig.enabled || false,
        accounts: sanitizedAccounts,
        defaultAccountId: emailConfig.defaultAccountId,
        providers: EMAIL_PROVIDERS,
      });
    } catch (error) {
      console.error('[API] Failed to get email config:', error);
      res.status(500).json({ error: 'Failed to get email configuration' });
    }
  });

  // PUT /api/email/config - 更新邮件配置
  app.put('/api/email/config', async (req, res) => {
    try {
      const { enabled } = req.body;

      const currentConfig = getConfig();
      const emailConfig = currentConfig.email || { enabled: false, accounts: [], defaultAccountId: undefined };

      // 只更新 enabled 字段
      emailConfig.enabled = enabled ?? emailConfig.enabled;

      currentConfig.email = emailConfig;
      await saveConfig(currentConfig);

      res.json({ success: true, enabled: emailConfig.enabled });
    } catch (error) {
      console.error('[API] Failed to update email config:', error);
      res.status(500).json({ error: 'Failed to update email configuration' });
    }
  });

  // POST /api/email/accounts - 添加邮箱账户
  app.post('/api/email/accounts', async (req, res) => {
    try {
      const { name, email, password, provider, imap, smtp, isDefault } = req.body;

      // 验证必填字段
      if (!email || !password) {
        res.status(400).json({ error: 'Missing required fields: email, password' });
        return;
      }

      const currentConfig = getConfig();
      const emailConfig = currentConfig.email || { enabled: false, accounts: [], defaultAccountId: undefined };

      // 生成唯一 ID
      const accountId = `email-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // 获取提供商预设
      const providerPreset = EMAIL_PROVIDERS[provider] || EMAIL_PROVIDERS.custom;

      const newAccount: EmailAccount = {
        id: accountId,
        name: name || email.split('@')[0],
        email,
        password,
        provider: provider || 'custom',
        imap: imap || providerPreset.imap,
        smtp: smtp || providerPreset.smtp,
        enabled: true,
        isDefault: isDefault ?? emailConfig.accounts?.length === 0,
      };

      // 如果设为默认，取消其他账户的默认状态
      if (newAccount.isDefault) {
        emailConfig.accounts?.forEach((a: EmailAccount) => {
          a.isDefault = false;
        });
        emailConfig.defaultAccountId = accountId;
      }

      emailConfig.accounts = emailConfig.accounts || [];
      emailConfig.accounts.push(newAccount);

      // 如果是第一个账户，自动启用邮件功能
      if (emailConfig.accounts.length === 1) {
        emailConfig.enabled = true;
      }

      currentConfig.email = emailConfig;
      await saveConfig(currentConfig);

      // 返回时脱敏密码
      res.json({
        success: true,
        account: {
          ...newAccount,
          password: '***',
        },
      });
    } catch (error) {
      console.error('[API] Failed to add email account:', error);
      res.status(500).json({ error: 'Failed to add email account' });
    }
  });

  // PUT /api/email/accounts/:id - 更新邮箱账户
  app.put('/api/email/accounts/:id', async (req, res) => {
    try {
      const accountId = req.params.id;
      const { name, email, password, provider, imap, smtp, enabled, isDefault } = req.body;

      const currentConfig = getConfig();
      const emailConfig = currentConfig.email || { enabled: false, accounts: [], defaultAccountId: undefined };

      const accountIndex = (emailConfig.accounts || []).findIndex((a: EmailAccount) => a.id === accountId);
      if (accountIndex === -1) {
        res.status(404).json({ error: `Account not found: ${accountId}` });
        return;
      }

      const account = emailConfig.accounts![accountIndex];

      // 更新字段（如果传入了新值）
      if (name !== undefined) account.name = name;
      if (email !== undefined) account.email = email;
      if (password && password !== '***') account.password = password;
      if (provider !== undefined) account.provider = provider;
      if (imap !== undefined) account.imap = imap;
      if (smtp !== undefined) account.smtp = smtp;
      if (enabled !== undefined) account.enabled = enabled;

      // 处理默认账户设置
      if (isDefault === true && !account.isDefault) {
        emailConfig.accounts?.forEach((a: EmailAccount) => {
          a.isDefault = a.id === accountId;
        });
        emailConfig.defaultAccountId = accountId;
      }
      if (isDefault !== undefined) {
        account.isDefault = isDefault;
      }

      currentConfig.email = emailConfig;
      await saveConfig(currentConfig);

      // 返回时脱敏密码
      res.json({
        success: true,
        account: {
          ...account,
          password: '***',
        },
      });
    } catch (error) {
      console.error('[API] Failed to update email account:', error);
      res.status(500).json({ error: 'Failed to update email account' });
    }
  });

  // DELETE /api/email/accounts/:id - 删除邮箱账户
  app.delete('/api/email/accounts/:id', async (req, res) => {
    try {
      const accountId = req.params.id;

      const currentConfig = getConfig();
      const emailConfig = currentConfig.email || { enabled: false, accounts: [], defaultAccountId: undefined };

      const accountIndex = (emailConfig.accounts || []).findIndex((a: EmailAccount) => a.id === accountId);
      if (accountIndex === -1) {
        res.status(404).json({ error: `Account not found: ${accountId}` });
        return;
      }

      // 删除账户
      emailConfig.accounts?.splice(accountIndex, 1);

      // 如果删除的是默认账户，重新设置默认账户
      if (emailConfig.defaultAccountId === accountId) {
        emailConfig.defaultAccountId = emailConfig.accounts?.[0]?.id;
        if (emailConfig.accounts?.[0]) {
          emailConfig.accounts[0].isDefault = true;
        }
      }

      // 如果没有账户了，禁用邮件功能
      if (emailConfig.accounts?.length === 0) {
        emailConfig.enabled = false;
      }

      currentConfig.email = emailConfig;
      await saveConfig(currentConfig);

      res.json({ success: true });
    } catch (error) {
      console.error('[API] Failed to delete email account:', error);
      res.status(500).json({ error: 'Failed to delete email account' });
    }
  });

  // PUT /api/email/accounts/:id/default - 设置默认账户
  app.put('/api/email/accounts/:id/default', async (req, res) => {
    try {
      const accountId = req.params.id;

      const currentConfig = getConfig();
      const emailConfig = currentConfig.email || { enabled: false, accounts: [], defaultAccountId: undefined };

      const account = (emailConfig.accounts || []).find((a: EmailAccount) => a.id === accountId);
      if (!account) {
        res.status(404).json({ error: `Account not found: ${accountId}` });
        return;
      }

      // 取消其他账户的默认状态
      emailConfig.accounts?.forEach((a: EmailAccount) => {
        a.isDefault = a.id === accountId;
      });
      emailConfig.defaultAccountId = accountId;

      currentConfig.email = emailConfig;
      await saveConfig(currentConfig);

      res.json({ success: true, defaultAccountId: accountId });
    } catch (error) {
      console.error('[API] Failed to set default account:', error);
      res.status(500).json({ error: 'Failed to set default account' });
    }
  });

  // POST /api/email/test - 测试邮件账户连接
  app.post('/api/email/test', async (req, res) => {
    try {
      const { email, imap, smtp, accountId } = req.body;
      let { password } = req.body;

      // 若密码未提供（前端掩码显示 ***），从已保存配置中获取
      if (!password && accountId) {
        const currentConfig = loadConfig();
        const savedAccount = (currentConfig.email?.accounts || []).find(
          (a: EmailAccount) => a.id === accountId
        );
        if (savedAccount?.password) {
          password = savedAccount.password;
        }
      }

      if (!email || !password || !imap?.host || !smtp?.host) {
        res.status(400).json({ success: false, error: 'Missing required fields' });
        return;
      }

      const results: {
        imap: { success: boolean; message: string; durationMs?: number };
        smtp: { success: boolean; message: string; durationMs?: number };
      } = {
        imap: { success: false, message: '' },
        smtp: { success: false, message: '' },
      };

      // 测试 IMAP 连接
      const imapStart = Date.now();
      try {
        const Imap = (await import('imap')).default;
        const imapClient = new Imap({
          user: email,
          password,
          host: imap.host,
          port: imap.port || 993,
          tls: imap.tls !== false,
          connTimeout: 10000,
          authTimeout: 10000,
        });

        await new Promise<void>((resolve, reject) => {
          imapClient.once('ready', () => {
            imapClient.end();
            resolve();
          });
          imapClient.once('error', reject);
          imapClient.connect();
        });

        results.imap = {
          success: true,
          message: 'IMAP 连接成功',
          durationMs: Date.now() - imapStart,
        };
      } catch (err: any) {
        results.imap = {
          success: false,
          message: `IMAP 连接失败: ${err.message}`,
          durationMs: Date.now() - imapStart,
        };
      }

      // 测试 SMTP 连接
      const smtpStart = Date.now();
      try {
        const nodemailer = await import('nodemailer');
        const transporter = nodemailer.default.createTransport({
          host: smtp.host,
          port: smtp.port || 465,
          secure: smtp.secure !== false,
          auth: { user: email, pass: password },
          tls: { rejectUnauthorized: true },
        });

        await transporter.verify();
        transporter.close();

        results.smtp = {
          success: true,
          message: 'SMTP 连接成功',
          durationMs: Date.now() - smtpStart,
        };
      } catch (err: any) {
        results.smtp = {
          success: false,
          message: `SMTP 连接失败: ${err.message}`,
          durationMs: Date.now() - smtpStart,
        };
      }

      const allPassed = results.imap.success && results.smtp.success;

      res.json({
        success: allPassed,
        message: allPassed ? '连接测试成功' : '部分连接失败',
        results,
      });
    } catch (error: any) {
      console.error('[API] Email test failed:', error);
      res.json({
        success: false,
        error: error.message || '连接测试失败',
      });
    }
  });

  // File explore routes
  app.use(exploreRouter);

  // Storage management routes
  app.use(storageRouter);

  // Cron routes
  if (options.cronService) {
    app.use('/api/cron', createCronRoutes(options.cronService));
  }

  // Tunnel routes
  app.use('/api/tunnel', createTunnelRoutes(options.tunnelManager));

  // Profile routes
  app.use('/api', profileRoutes);

  // Evolution routes
  app.use('/api/evolutions', evolutionRoutes);

  // Cron notification routes - 获取 cron 相关的 sessions 作为通知
  app.get('/api/cron/notifications', (req, res) => {
    try {
      const allSessions = options.sessionManager.listSessions();
      // 筛选出 cron 开头的 session
      const cronSessions = allSessions
        .filter(s => s.id.startsWith('cron:'))
        .sort((a, b) => b.updatedAt - a.updatedAt);

      // 获取已读状态（前端通过 localStorage 存储，这里返回所有未读）
      // 前端会维护已读状态，所以后端只需返回消息列表
      const notifications = cronSessions.map(session => {
        const lastMessage = session.messages[session.messages.length - 1];
        return {
          sessionId: session.id,
          jobId: session.id.replace('cron:', ''),
          jobName: session.name || '定时任务',
          message: lastMessage?.content || '',
          preview: lastMessage?.content?.substring(0, 100) || '',
          timestamp: lastMessage?.timestamp || session.updatedAt,
          isRead: false // 前端维护已读状态
        };
      }).filter(n => n.message); // 只返回有消息的

      const unreadCount = notifications.filter(n => !n.isRead).length;

      res.json({ notifications, unreadCount });
    } catch (error) {
      console.error('[HTTPServer] Get notifications error:', error);
      res.status(500).json({ error: 'Failed to get notifications' });
    }
  });

  // 标记通知为已读（后端只需要返回成功，前端自己维护状态）
  app.post('/api/cron/notifications/read', (req, res) => {
    try {
      const { sessionId } = req.body;
      if (!sessionId) {
        return res.status(400).json({ error: 'sessionId is required' });
      }
      // 后端不做额外处理，前端自己维护已读状态
      res.json({ success: true });
    } catch (error) {
      console.error('[HTTPServer] Mark read error:', error);
      res.status(500).json({ error: 'Failed to mark as read' });
    }
  });

  // File routes
  // 文件上传 (base64)
  app.post('/api/files', (req, res) => {
    try {
      const fileStorage = getFileStorage();
      const { filename, content, mimeType } = req.body;

      if (!filename || !content) {
        return res.status(400).json({ error: 'filename and content are required' });
      }

      const attachment = fileStorage.saveFile(filename, content, mimeType || 'application/octet-stream');
      res.status(201).json(attachment);
    } catch (error) {
      console.error('[HTTPServer] File upload error:', error);
      res.status(500).json({ error: 'Failed to save file' });
    }
  });

  // 文件下载
  app.get('/api/files/:filename', (req, res) => {
    try {
      const fileStorage = getFileStorage();
      const filename = req.params.filename;

      const fileInfo = fileStorage.getFileInfo(filename);
      if (!fileInfo) {
        return res.status(404).json({ error: 'File not found' });
      }

      const content = fileStorage.readFile(filename);
      if (!content) {
        return res.status(404).json({ error: 'File not found' });
      }

      res.setHeader('Content-Type', fileInfo.mimeType);
      res.setHeader('Content-Length', fileInfo.size);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      res.send(content);
    } catch (error) {
      console.error('[HTTPServer] File download error:', error);
      res.status(500).json({ error: 'Failed to download file' });
    }
  });

  // Office 预览服务器代理（处理所有 /office-preview/* 请求）
  app.use('/office-preview', async (req, res) => {
    try {
      const config = getConfig();
      const previewServer = config.officePreviewServer;

      if (!previewServer) {
        return res.status(503).json({ error: 'Office preview server not configured' });
      }

      // 构建目标 URL（移除 /office-preview 前缀）
      const pathWithoutPrefix = req.originalUrl.replace(/^\/office-preview/, '') || '/';
      const targetUrl = `${previewServer}${pathWithoutPrefix}`;

      console.log('[HTTPServer] Office preview proxy:', req.originalUrl, '->', targetUrl);

      // 转发请求到 Office 预览服务器
      const response = await fetch(targetUrl, {
        method: req.method,
        headers: {
          ...req.headers as Record<string, string>,
          host: new URL(previewServer).host
        }
      });

      // 转发响应头（移除可能导致冲突的头）
      response.headers.forEach((value, key) => {
        const keyLower = key.toLowerCase();
        // 跳过 Transfer-Encoding，因为我们会用 Content-Length
        // 跳过 Content-Encoding，因为 fetch 已经自动解压了
        // 跳过 Content-Length，我们会重新设置
        if (keyLower === 'transfer-encoding' ||
            keyLower === 'content-encoding' ||
            keyLower === 'content-length') {
          return;
        }
        res.setHeader(key, value);
      });

      // 转发状态码和响应体
      res.status(response.status);
      const buffer = await response.arrayBuffer();
      // 设置正确的 Content-Length（基于解压后的内容）
      res.setHeader('Content-Length', buffer.byteLength);
      res.send(Buffer.from(buffer));
    } catch (error) {
      console.error('[HTTPServer] Office preview proxy error:', error);
      res.status(500).json({ error: 'Failed to proxy to office preview server' });
    }
  });

  // ========== Channel Management APIs ==========

  // 获取所有支持的频道定义
  app.get('/api/channels/definitions', (_, res) => {
    try {
      res.json({
        definitions: channelDefinitions.map(d => ({
          id: d.id,
          name: d.name,
          nameZh: d.nameZh,
          icon: d.icon,
          color: d.color,
          fields: Object.entries(d.configSchema).map(([key, field]) => ({
            key,
            type: field.type,
            label: field.label,
            labelZh: field.labelZh,
            required: field.required,
            placeholder: field.placeholder,
            placeholderZh: field.placeholderZh,
          })),
        })),
      });
    } catch (error) {
      console.error('[HTTPServer] Channel definitions error:', error);
      res.status(500).json({ error: 'Failed to get channel definitions' });
    }
  });

  // 获取所有频道配置和状态
  app.get('/api/channels', (_, res) => {
    try {
      const config = getConfig();
      const channelsConfig = config.channels || {};

      res.json({
        channels: channelDefinitions.map(def => {
          const channelConfig = channelsConfig[def.id as keyof typeof channelsConfig];
          return {
            id: def.id,
            name: def.name,
            nameZh: def.nameZh,
            icon: def.icon,
            color: def.color,
            enabled: channelConfig?.enabled ?? (def.id === 'httpWs'),
            config: channelConfig || {},
          };
        }),
      });
    } catch (error) {
      console.error('[HTTPServer] Channels error:', error);
      res.status(500).json({ error: 'Failed to get channels' });
    }
  });

  // 获取指定频道配置
  app.get('/api/channels/:id', (req, res) => {
    try {
      const { id } = req.params;
      const def = getChannelDefinition(id);
      if (!def) {
        return res.status(404).json({ error: 'Channel not found' });
      }

      const config = getConfig();
      const channelsConfig = config.channels || {};
      const channelConfig = channelsConfig[id as keyof typeof channelsConfig];

      res.json({
        id: def.id,
        name: def.name,
        nameZh: def.nameZh,
        icon: def.icon,
        color: def.color,
        enabled: channelConfig?.enabled ?? false,
        config: channelConfig || {},
      });
    } catch (error) {
      console.error('[HTTPServer] Channel error:', error);
      res.status(500).json({ error: 'Failed to get channel' });
    }
  });

  // 添加/更新频道配置
  app.post('/api/channels', (req, res) => {
    try {
      const { id, enabled, config: channelConfigInput } = req.body;

      const def = getChannelDefinition(id);
      if (!def) {
        return res.status(404).json({ error: 'Channel not found' });
      }

      // 验证必填字段
      for (const [key, field] of Object.entries(def.configSchema)) {
        if (field.required && !channelConfigInput?.[key]) {
          return res.status(400).json({ error: `Missing required field: ${field.label}` });
        }
      }

      // 加载当前配置
      let currentConfig = getConfig();
      const channelsConfig: Record<string, any> = currentConfig.channels || {};

      // 更新指定频道配置
      channelsConfig[id] = {
        ...channelsConfig[id],
        ...channelConfigInput,
        enabled: enabled ?? false,
      };

      // 保存配置
      currentConfig = {
        ...currentConfig,
        channels: channelsConfig,
      };
      saveConfig(currentConfig);

      res.json({
        id,
        name: def.name,
        nameZh: def.nameZh,
        enabled: enabled ?? false,
        config: channelsConfig[id],
      });
    } catch (error) {
      console.error('[HTTPServer] Save channel error:', error);
      res.status(500).json({ error: 'Failed to save channel' });
    }
  });

  // 删除频道配置
  app.delete('/api/channels/:id', (req, res) => {
    try {
      const { id } = req.params;

      if (id === 'httpWs') {
        return res.status(400).json({ error: 'Cannot delete httpWs channel' });
      }

      const def = getChannelDefinition(id);
      if (!def) {
        return res.status(404).json({ error: 'Channel not found' });
      }

      // 加载当前配置
      let currentConfig = getConfig();
      const channelsConfig: Record<string, any> = currentConfig.channels || {};

      // 删除指定频道配置
      delete channelsConfig[id];

      // 保存配置
      currentConfig = {
        ...currentConfig,
        channels: channelsConfig,
      };
      saveConfig(currentConfig);

      res.status(204).send();
    } catch (error) {
      console.error('[HTTPServer] Delete channel error:', error);
      res.status(500).json({ error: 'Failed to delete channel' });
    }
  });

  // 启用/禁用频道（支持热加载）
  app.post('/api/channels/:id/toggle', async (req, res) => {
    try {
      const { id } = req.params;
      const { enabled } = req.body;

      const def = getChannelDefinition(id);
      if (!def) {
        return res.status(404).json({ error: 'Channel not found' });
      }

      // 热加载：动态启动或停止频道
      let result;
      if (enabled) {
        result = await hotStartChannel(id);
      } else {
        result = await hotStopChannel(id);
      }

      if (!result.success) {
        // 如果热加载失败，返回错误（但配置已经保存）
        return res.status(400).json({ error: result.message });
      }

      res.json({
        id,
        enabled,
        message: result.message,
      });
    } catch (error) {
      console.error('[HTTPServer] Toggle channel error:', error);
      res.status(500).json({ error: 'Failed to toggle channel' });
    }
  });

  // 测试频道连接
  app.post('/api/channels/:id/test', async (req, res) => {
    try {
      const { id } = req.params;

      const def = getChannelDefinition(id);
      if (!def) {
        return res.status(404).json({ error: 'Channel not found' });
      }

      // 根据渠道类型执行不同的测试逻辑
      let success = false;
      let message = '';

      if (id === 'feishu') {
        // 飞书连接测试
        const config = getConfig();
        const feishuConfig = config.channels?.feishu;

        if (!feishuConfig?.enabled || !feishuConfig?.appId || !feishuConfig?.appSecret) {
          message = 'Feishu is not configured or disabled';
        } else {
          try {
            // 尝试获取 tenant_access_token
            const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                app_id: feishuConfig.appId,
                app_secret: feishuConfig.appSecret,
              }),
            });
            const data = await response.json() as any;

            if (data.code === 0) {
              success = true;
              message = 'Connection successful';
            } else {
              message = `Feishu API error: ${data.msg}`;
            }
          } catch (err: any) {
            message = `Connection failed: ${err.message}`;
          }
        }
      } else if (id === 'slack') {
        // Slack 连接测试
        const config = getConfig();
        const slackConfig = config.channels?.slack;

        if (!slackConfig?.enabled || !slackConfig?.botToken) {
          message = 'Slack is not configured or disabled';
        } else {
          try {
            const response = await fetch('https://slack.com/api/auth.test', {
              headers: { 'Authorization': `Bearer ${slackConfig.botToken}` },
            });
            const data = await response.json() as any;

            if (data.ok) {
              success = true;
              message = `Connected as ${data.user}`;
            } else {
              message = `Slack API error: ${data.error}`;
            }
          } catch (err: any) {
            message = `Connection failed: ${err.message}`;
          }
        }
      } else if (id === 'httpWs') {
        // Web UI 总是可用的
        success = true;
        message = 'Web UI is always available';
      } else {
        // 其他渠道暂不支持测试
        message = `Connection test not implemented for ${def.name}`;
      }

      res.json({
        success,
        message,
      });
    } catch (error) {
      console.error('[HTTPServer] Test channel error:', error);
      res.status(500).json({ error: 'Failed to test channel' });
    }
  });

  // 工作目录管理 API
  // 获取当前工作目录信息
  app.get('/api/workdir', (_, res) => {
    try {
      const info = workDirManager.getWorkDirInfo();
      res.json(info);
    } catch (error) {
      console.error('[HTTPServer] Get workdir error:', error);
      res.status(500).json({ error: 'Failed to get work directory' });
    }
  });

  // 设置工作目录
  app.post('/api/workdir', (req, res) => {
    try {
      const { path: newDir } = req.body;

      if (!newDir || typeof newDir !== 'string') {
        return res.status(400).json({ error: 'Path is required' });
      }

      const result = workDirManager.setCurrentWorkDir(newDir);

      if (result.success) {
        res.json({
          success: true,
          current: workDirManager.getCurrentWorkDir()
        });
      } else {
        // 返回错误信息，包括是否需要添加权限
        res.status(400).json({
          error: result.error,
          needsPermission: result.needsPermission || false,
          suggestedPath: result.suggestedPath
        });
      }
    } catch (error) {
      console.error('[HTTPServer] Set workdir error:', error);
      res.status(500).json({ error: 'Failed to set work directory' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // 权限请求响应 API
  // 用于前端响应 AgentRunner 发出的权限请求
  // ─────────────────────────────────────────────────────────────────────
  app.post('/api/permission/respond', async (req, res) => {
    try {
      const { sessionId, requestId, approved, updatedInput } = req.body;

      if (!sessionId || !requestId || approved === undefined) {
        res.status(400).json({
          error: 'Missing required fields: sessionId, requestId, approved'
        });
        return;
      }

      const agentRunner = activeAgentRunners.get(sessionId);
      if (!agentRunner) {
        console.log('[HTTPServer] No active agentRunner found for session:', sessionId);
        res.json({
          success: true,
          message: 'No active permission request (no active runner)'
        });
        return;
      }

      // 响应权限请求（仅 ClaudeAgentRunner 支持此功能）
      if (agentRunner.respondToPermission) {
        await agentRunner.respondToPermission(requestId, approved, updatedInput);
        res.json({ success: true });
      } else {
        res.json({
          success: true,
          message: 'Permission management not supported by current runner'
        });
      }
    } catch (error) {
      console.error('[HTTPServer] Permission respond error:', error);
      res.status(500).json({ error: 'Failed to respond to permission request' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // 停止对话 API
  // 用于前端停止当前正在进行的对话
  // ─────────────────────────────────────────────────────────────────────
  app.post('/api/chat/stop', (req, res) => {
    try {
      const { sessionId } = req.body;

      if (!sessionId) {
        res.status(400).json({ error: 'Missing required field: sessionId' });
        return;
      }

      const agentRunner = activeAgentRunners.get(sessionId);
      if (!agentRunner) {
        console.log('[HTTPServer] No active agentRunner found for session:', sessionId);
        res.json({
          success: true,
          message: 'No active conversation to stop'
        });
        return;
      }

      // 调用 abort 方法停止对话
      if (agentRunner instanceof UnifiedAgentRunner) {
        agentRunner.abort();
        console.log('[HTTPServer] Aborted conversation for session:', sessionId);
        res.json({ success: true, message: 'Conversation stopped' });
      } else {
        res.json({
          success: false,
          message: 'Stop not supported by current runner'
        });
      }
    } catch (error) {
      console.error('[HTTPServer] Stop chat error:', error);
      res.status(500).json({ error: 'Failed to stop conversation' });
    }
  });

  return app;
}
