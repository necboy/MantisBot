import { useState } from 'react';
import { RotateCcw, Trash2, Copy, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import { SkillChainDisplay } from './SkillChainDisplay';
import { AgentTimeline } from './AgentTimeline';

// ─── Shared types (mirrored from App.tsx) ────────────────────────────────────

export interface FileAttachment {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  url: string;
}

export interface ToolStatus {
  tool: string;
  toolId?: string;
  status: 'start' | 'end';
  args?: Record<string, unknown>;
  result?: unknown;
  isError?: boolean;
  timestamp?: number;
}

export interface AgentInvocationStatus {
  agentName: string;
  agentId: string;
  phase: 'running' | 'done';
  startTime: number;
  endTime?: number;
  task?: string;
}

export interface SkillCall {
  id: string;
  name: string;
  location: string;
  timestamp: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  timestamp: number;
  attachments?: FileAttachment[];
  toolStatus?: ToolStatus[];
  skillChain?: SkillCall[];
  agentInvocations?: AgentInvocationStatus[];
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface MessageBubbleProps {
  msg: Message;
  // 展开/折叠思考内容和工具详情（状态由父组件管理以保持跨渲染一致）
  expandedThinking: Set<string>;
  onToggleExpand: (key: string) => void;
  // 附件操作
  onOpenCanvas: (attachment: FileAttachment) => void;
  // 消息操作
  onResend: (msg: Message) => void;
  onDelete: (msg: Message) => void;
  // 工具名称显示辅助函数（由 App.tsx 传入以保持共享逻辑）
  getToolDisplayName: (toolName: string) => string;
  formatToolArgs: (toolName: string, args: Record<string, unknown> | undefined) => string;
  FileAttachmentCard: React.FC<{ attachment: FileAttachment; onOpenCanvas: () => void }>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MessageBubble({
  msg,
  expandedThinking,
  onToggleExpand,
  onOpenCanvas,
  onResend,
  onDelete,
  getToolDisplayName,
  formatToolArgs,
  FileAttachmentCard,
}: MessageBubbleProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const isUser = msg.role === 'user';

  function handleCopy() {
    navigator.clipboard.writeText(msg.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function handleDelete() {
    if (window.confirm(t('message.confirmDelete'))) {
      onDelete(msg);
    }
  }

  // ── Action buttons ──────────────────────────────────────────────────────────

  const UserActions = (
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
      <button
        onClick={() => onResend(msg)}
        title={t('message.resend')}
        className="p-1.5 rounded-md text-gray-400 hover:text-primary-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <RotateCcw className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={handleDelete}
        title={t('message.delete')}
        className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );

  const AssistantActions = (
    <div className="flex items-center gap-0.5 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
      <button
        onClick={handleCopy}
        title={copied ? t('message.copied') : t('message.copy')}
        className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        {copied ? (
          <><Check className="w-3 h-3 text-green-500" /><span className="text-green-500">{t('message.copied')}</span></>
        ) : (
          <><Copy className="w-3 h-3" /><span>{t('message.copy')}</span></>
        )}
      </button>
      <button
        onClick={handleDelete}
        title={t('message.delete')}
        className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <Trash2 className="w-3 h-3" />
        <span>{t('message.delete')}</span>
      </button>
    </div>
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className={`flex gap-3 group ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* 头像 */}
      <div className="flex-shrink-0">
        {isUser ? (
          <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-white text-sm font-medium">
            U
          </div>
        ) : (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-sm">
            🤖
          </div>
        )}
      </div>

      {/* 消息内容区 */}
      <div className={`flex-1 min-w-0 ${isUser ? 'max-w-[80%] md:max-w-[70%]' : ''}`}>
        {/* 消息头：用户消息在右侧显示操作按钮 */}
        <div className={`flex items-center gap-2 mb-1 ${isUser ? 'justify-end' : ''}`}>
          {/* 用户消息操作按钮（头部左侧，因为气泡在右） */}
          {isUser && UserActions}
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {isUser ? t('message.you', '你') : t('message.assistant', '助手')}
          </span>
        </div>

        {/* 消息主体 */}
        <div
          className={`px-4 py-3 rounded-lg overflow-hidden ${
            isUser
              ? 'bg-primary-600 text-white'
              : 'bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
          }`}
        >
          {isUser ? (
            <div className="break-words whitespace-pre-wrap">{msg.content}</div>
          ) : (
            <div className="space-y-1">
              {/* 思考过程 */}
              {msg.thinking && (
                <div className="text-sm">
                  <button
                    onClick={() => onToggleExpand(msg.id)}
                    className="flex items-center gap-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors py-0.5"
                  >
                    <svg
                      className={`w-3 h-3 transition-transform duration-150 ${expandedThinking.has(msg.id) ? 'rotate-90' : ''}`}
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="text-xs italic">
                      {!msg.content ? (
                        <span className="flex items-center gap-1.5">
                          思考中
                          <span className="flex gap-0.5">
                            <span className="w-1 h-1 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-1 h-1 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-1 h-1 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                          </span>
                        </span>
                      ) : '思考过程'}
                    </span>
                  </button>
                  {expandedThinking.has(msg.id) && (
                    <div className="mt-1 ml-4 pl-3 border-l-2 border-gray-200 dark:border-gray-700">
                      <pre className="text-xs whitespace-pre-wrap text-gray-500 dark:text-gray-400 font-normal leading-relaxed max-h-48 overflow-y-auto">
                        {msg.thinking}
                        {!msg.content && (
                          <span className="inline-block w-1.5 h-3.5 bg-gray-400 animate-pulse ml-0.5 align-text-bottom" />
                        )}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* Agent Teams 时间线 */}
              {msg.agentInvocations && msg.agentInvocations.length > 0 && (
                <AgentTimeline invocations={msg.agentInvocations} />
              )}

              {/* 工具调用展示 */}
              {msg.toolStatus && msg.toolStatus.length > 0 && (
                <div className="space-y-0.5">
                  {msg.toolStatus.map((tool, idx) => {
                    const isRunning = tool.status === 'start';
                    const isError = tool.isError;
                    const toolExpKey = `${msg.id}-tool-${idx}`;

                    // remember 工具专属徽章
                    if (tool.tool === 'remember' && tool.status === 'end' && !isError) {
                      const remResult = tool.result as { content?: string };
                      const savedContent = remResult?.content || '';
                      const truncated = savedContent.length > 40 ? savedContent.slice(0, 40) + '…' : savedContent;
                      return (
                        <div
                          key={idx}
                          className="flex items-start gap-1.5 px-2 py-1.5 rounded-md border border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/40"
                        >
                          <span className="text-xs mt-0.5 flex-shrink-0">📌</span>
                          <div className="min-w-0">
                            <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">已保存到记忆</span>
                            {truncated && (
                              <span className="text-xs text-indigo-500 dark:text-indigo-500 ml-1">"{truncated}"</span>
                            )}
                          </div>
                        </div>
                      );
                    }

                    const formatResult = (result: unknown): string => {
                      if (!result) return '';
                      if (typeof result === 'string') return result;
                      try { return JSON.stringify(result, null, 2); } catch { return String(result); }
                    };

                    const rawPreview = formatToolArgs(tool.tool, tool.args);
                    const argsPreview = rawPreview.slice(0, 60) + (rawPreview.length > 60 ? '…' : '');

                    return (
                      <div key={idx} className="text-sm">
                        <button
                          onClick={() => onToggleExpand(toolExpKey)}
                          className="flex items-center gap-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors py-0.5 w-full text-left"
                        >
                          {isRunning ? (
                            <svg className="w-3 h-3 animate-spin text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                          ) : isError ? (
                            <span className="w-3 h-3 flex-shrink-0 text-red-400 text-xs leading-none">✗</span>
                          ) : (
                            <span className="w-3 h-3 flex-shrink-0 text-green-400 text-xs leading-none">✓</span>
                          )}
                          <svg
                            className={`w-2.5 h-2.5 flex-shrink-0 transition-transform duration-150 ${expandedThinking.has(toolExpKey) ? 'rotate-90' : ''}`}
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                          <span className="text-xs font-mono truncate">
                            <span className={isError ? 'text-red-400' : isRunning ? 'text-blue-400' : 'text-gray-500 dark:text-gray-400'}>
                              {getToolDisplayName(tool.tool)}
                            </span>
                            {argsPreview && (
                              <span className="text-gray-400 dark:text-gray-600">({argsPreview})</span>
                            )}
                          </span>
                        </button>
                        {expandedThinking.has(toolExpKey) && (
                          <div className="mt-0.5 ml-4 pl-3 border-l-2 border-gray-200 dark:border-gray-700 space-y-1">
                            {tool.args && (
                              <pre className="text-xs text-gray-500 dark:text-gray-400 whitespace-pre-wrap break-words">
                                {formatToolArgs(tool.tool, tool.args)}
                              </pre>
                            )}
                            {tool.status === 'end' && (
                              <pre className={`text-xs whitespace-pre-wrap break-words max-h-40 overflow-y-auto ${isError ? 'text-red-400' : 'text-gray-400 dark:text-gray-500'}`}>
                                {formatResult(tool.result) || '(无输出)'}
                              </pre>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 主内容 */}
              {msg.content.trim() || msg.thinking || (msg.toolStatus && msg.toolStatus.length > 0) ? (
                <div className="prose prose-sm dark:prose-invert max-w-none break-words [&_pre]:bg-gray-900 [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_code]:text-sm [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_th]:whitespace-nowrap [&_td]:whitespace-nowrap">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 py-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              )}

              {/* 附件 */}
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="space-y-2">
                  {msg.attachments.map(attachment => (
                    <FileAttachmentCard
                      key={attachment.id}
                      attachment={attachment}
                      onOpenCanvas={() => onOpenCanvas(attachment)}
                    />
                  ))}
                </div>
              )}

              {/* 技能调用链 */}
              {msg.skillChain && msg.skillChain.length > 0 && (
                <SkillChainDisplay skills={msg.skillChain} />
              )}
            </div>
          )}
        </div>

        {/* AI 消息操作按钮（气泡下方） */}
        {!isUser && AssistantActions}
      </div>
    </div>
  );
}
