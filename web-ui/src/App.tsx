import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageCircle, Settings, Plus, Bot, FileText, Download, Image, Trash2, ExternalLink, Clock, LayoutDashboard, Wifi, FolderOpen, Square, LogOut } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CanvasPanel, FileItem, BrowserSnapshot, TerminalOutput } from './components/CanvasPanel';
import { CronPanel } from './components/CronPanel';
import { TunnelPanel } from './components/TunnelPanel';
import { NotificationBell } from './components/NotificationBell';
import PermissionModal from './components/PermissionModal';
import { NotificationPanel, Notification } from './components/NotificationPanel';
import { NotificationDetail } from './components/NotificationDetail';
import { FileReferenceTags } from './components/FileReferenceTags';  // 新增
import { SettingsPanel } from './components/SettingsPanel';
import { ModelConfigPrompt, useModelConfigCheck, markModelConfigPending, markModelConfigured } from './components/ModelConfigPrompt';
import { LoginPage } from './components/LoginPage';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { SkillChainDisplay } from './components/SkillChainDisplay';
import { CommandPalette } from './components/CommandPalette';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useTranslation } from 'react-i18next';
import i18n from './i18n';
import { appendTokenToWsUrl, appendTokenToUrl, authFetch, clearAuthToken } from './utils/auth';
import { generateUUID } from './utils/uuid';

interface FileAttachment {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  url: string;
}

interface ToolStatus {
  tool: string;
  toolId?: string;
  status: 'start' | 'end';
  args?: Record<string, unknown>;
  result?: unknown;
  isError?: boolean;
  timestamp?: number;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;  // 思考内容（折叠显示）
  timestamp: number;
  attachments?: FileAttachment[];
  toolStatus?: ToolStatus[];  // 新增：工具调用状态
  skillChain?: SkillCall[];   // 新增：技能调用链
}

// 技能调用记录
interface SkillCall {
  id: string;
  name: string;
  location: string;
  timestamp: number;
}

// 审批模式类型
type ApprovalMode = 'auto' | 'ask' | 'dangerous';

interface Session {
  id: string;
  name: string;
  model: string;
  approvalMode?: ApprovalMode;  // 审批模式
}

interface Config {
  models: { name: string; type: string; model: string }[];
  officePreviewServer?: string;  // Office 文件预览服务器地址
}

// 新增：文件引用类型
interface FileReference {
  id: string;
  path: string;
  name: string;
  type: 'file' | 'directory';
  size?: number;
  ext?: string;
  mimeType?: string;
  addedAt: number;
}

// 格式化文件大小
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// 获取文件图标
function getFileIcon(mimeType: string | undefined) {
  if (mimeType?.startsWith('image/')) return Image;
  return FileText;
}

// 工具名称友好显示
function getToolDisplayName(toolName: string): string {
  const toolNames: Record<string, string> = {
    'read': i18n.t('tool.read'),
    'write': i18n.t('tool.write'),
    'edit': i18n.t('tool.edit'),
    'exec': i18n.t('tool.exec'),
    'read_skill': i18n.t('tool.readSkill'),
    'send_file': i18n.t('tool.sendFile'),
    'memory_search': i18n.t('tool.memorySearch'),
    'document': i18n.t('tool.document'),
    'logger': i18n.t('tool.logger'),
    'browser_navigate': i18n.t('tool.browserNavigate'),
    'browser_screenshot': i18n.t('tool.browserScreenshot'),
    'browser_click': i18n.t('tool.browserClick'),
    'browser_type': i18n.t('tool.browserType'),
    'browser_scroll': i18n.t('tool.browserScroll'),
    'browser_wait': i18n.t('tool.browserWait'),
    'cron_manage': i18n.t('tool.cronManage'),
  };
  return toolNames[toolName] || toolName;
}

// 格式化工具参数，显示关键信息
function formatToolArgs(toolName: string, args: Record<string, unknown> | undefined): string {
  if (!args) return '';

  switch (toolName) {
    case 'read':
    case 'Read':
      return args.file_path ? i18n.t('toolArgs.reading', { filename: String(args.file_path).split('/').pop() }) : '';
    case 'write':
    case 'Write':
      return args.file_path ? i18n.t('toolArgs.writing', { filename: String(args.file_path).split('/').pop() }) : '';
    case 'edit':
    case 'Edit':
      return args.file_path ? i18n.t('toolArgs.editing', { filename: String(args.file_path).split('/').pop() }) : '';
    case 'exec':
      return args.command ? i18n.t('toolArgs.executing', { command: args.command }) : '';
    case 'Bash':
      // Claude SDK 内置的 Bash 工具
      return args.command ? String(args.command) : '';
    case 'Glob':
      // Claude SDK 内置的 Glob 工具
      return args.pattern ? String(args.pattern) : '';
    case 'Grep':
      // Claude SDK 内置的 Grep 工具
      return args.pattern ? String(args.pattern) : '';
    case 'browser_navigate':
      return args.url ? i18n.t('toolArgs.visiting', { url: args.url }) : '';
    case 'memory_search':
      return args.query ? i18n.t('toolArgs.searching', { query: args.query }) : '';
    default:
      // 默认：尝试显示常见的参数字段
      return args.command ? String(args.command) :
             args.pattern ? String(args.pattern) :
             args.file_path ? (String(args.file_path).split('/').pop() || String(args.file_path)) :
             args.query ? String(args.query) : '';
  }
}

// 文件附件组件
function FileAttachmentCard({ attachment, onOpenCanvas }: { attachment: FileAttachment; onOpenCanvas: () => void }) {
  const { t } = useTranslation();
  const Icon = getFileIcon(attachment.mimeType);
  const isImage = attachment.mimeType?.startsWith('image/');

  return (
    <div className="flex items-center gap-3 p-3 bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 hover:border-primary-400 transition-colors">
      <div className="flex-shrink-0">
        {isImage ? (
          <img
            src={attachment.url}
            alt={attachment.name}
            className="w-12 h-12 object-cover rounded"
          />
        ) : (
          <Icon className="w-8 h-8 text-gray-500 dark:text-gray-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
          {attachment.name}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {formatFileSize(attachment.size)}
        </p>
      </div>
      <button
        onClick={onOpenCanvas}
        className="flex-shrink-0 p-2 text-gray-500 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400 transition-colors"
        title={t('file.openInCanvas')}
      >
        <ExternalLink className="w-5 h-5" />
      </button>
      <a
        href={attachment.url}
        download={attachment.name}
        className="flex-shrink-0 p-2 text-gray-500 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400 transition-colors"
        title={t('file.download')}
      >
        <Download className="w-5 h-5" />
      </a>
    </div>
  );
}

function App() {
  const { t } = useTranslation();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSession, setCurrentSession] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(false);  // 会话切换加载状态
  const [config, setConfig] = useState<Config | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('gpt-4');
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>('dangerous');  // 审批模式，默认仅危险操作询问
  const [canvasOpen, setCanvasOpen] = useState(true);
  const [currentFile, setCurrentFile] = useState<FileItem | null>(null);
  const [cronOpen, setCronOpen] = useState(false);
  const [tunnelOpen, setTunnelOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  // 后端连接状态
  const [backendStatus, setBackendStatus] = useState<'checking' | 'connected' | 'reconnecting'>('checking');
  const [retryCount, setRetryCount] = useState(0);
  const [healthError, setHealthError] = useState('');
  const [showHealthDetail, setShowHealthDetail] = useState(false);

  // 聊天消息自动滚动相关
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // 停止对话相关
  const abortControllerRef = useRef<AbortController | null>(null);

  // 通知相关状态
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);

  // 画布相关状态：浏览器截图和终端输出
  const [browserSnapshots, setBrowserSnapshots] = useState<BrowserSnapshot[]>([]);
  const [terminalOutputs, setTerminalOutputs] = useState<TerminalOutput[]>([]);
  const [canvasForceMode, setCanvasForceMode] = useState<'preview' | 'files' | 'browser' | 'terminal' | undefined>(undefined);
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);

  // 多标签预览：打开的文件列表
  const [openFiles, setOpenFiles] = useState<FileItem[]>([]);

  // 权限请求状态
  interface PendingPermission {
    requestId: string;
    toolName: string;
    toolInput: Record<string, unknown>;
    isDangerous: boolean;
    reason?: string;
  }
  const [pendingPermission, setPendingPermission] = useState<PendingPermission | null>(null);

  // 保存最新的浏览器快照信息（用于关联截图）
  const latestBrowserSnapshotRef = useRef<{ url: string; title?: string }>({ url: 'unknown' });

  // NAS 默认路径：用户主目录
  const [homeDirectory, setHomeDirectory] = useState<string>('/');

  // ���前工作目录
  const [currentWorkDir, setCurrentWorkDir] = useState<string>('/');

  // 新增：文件引用状态
  const [fileReferences, setFileReferences] = useState<FileReference[]>([]);

  // 设置面板状态
  const [settingsOpen, setSettingsOpen] = useState(false);

  // 首次启动模型配置提示状态
  const [modelConfigPromptOpen, setModelConfigPromptOpen] = useState(false);

  // 鉴权状态：authChecked=true 表示已完成检查（无论是否登录）
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authEnabled, setAuthEnabled] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  // 当前使用的 skill（来自 plugin）- 仅用于即时显示
  const [activeSkill, setActiveSkill] = useState<{ name: string; location: string } | null>(null);

  // 全局错误状态
  const [globalError, setGlobalError] = useState<{ message: string; recoverable: boolean } | null>(null);
  const [expandedThinking, setExpandedThinking] = useState<Set<string>>(new Set());  // 展开的思考内容

  // 后端健康检查
  useEffect(() => {
    let retryTimer: ReturnType<typeof setTimeout>;
    let isMounted = true;
    let failureCount = 0;   // 连续失败次数（用于区分启动等待与真实断线）
    let hasConnected = false; // 是否曾经成功连接过

    const checkBackendHealth = async () => {
      try {
        const response = await fetch('/health', {
          method: 'GET',
          headers: { 'Cache-Control': 'no-cache' }
        });

        if (!isMounted) return;

        if (response.ok) {
          hasConnected = true;
          failureCount = 0;
          setBackendStatus('connected');
          setRetryCount(0);
          setHealthError('');
        } else {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }
      } catch (error) {
        if (!isMounted) return;

        failureCount++;
        const msg = error instanceof Error ? error.message : String(error);
        setHealthError(msg.includes('Failed to fetch') || msg.includes('fetch') ? '无法连接到服务器' : msg);
        setRetryCount(prev => prev + 1);

        // 曾经连接过（真实断开）或启动等待超 2 次（10 秒），才切换到 reconnecting
        // 初次启动时给后端 10 秒宽限，避免出现短暂的橙色报错闪烁
        if (hasConnected || failureCount > 2) {
          setBackendStatus('reconnecting');
        }

        // 5 秒后重试
        retryTimer = setTimeout(checkBackendHealth, 5000);
      }
    };

    // 首次检查
    checkBackendHealth();

    // 定期健康检查（每 30 秒）
    const healthCheckInterval = setInterval(() => {
      if (backendStatus === 'connected') {
        checkBackendHealth();
      }
    }, 30000);

    return () => {
      isMounted = false;
      clearTimeout(retryTimer);
      clearInterval(healthCheckInterval);
    };
  }, []);

  // 鉴权检查：页面加载后验证 token 是否有效
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await authFetch('/api/auth/check');
        if (res.ok) {
          const data = await res.json();
          setIsAuthenticated(data.authenticated === true);
          setAuthEnabled(data.authEnabled === true);
        } else {
          setIsAuthenticated(false);
        }
      } catch {
        // 后端未就绪时跳过，稍后健康检查恢复后会重新触发
        setIsAuthenticated(false);
      } finally {
        setAuthChecked(true);
      }
    }
    checkAuth();
  }, []);

  // 监听 authFetch 派发的 401 事件，无需 reload 即可跳转到登录页
  useEffect(() => {
    const handler = () => setIsAuthenticated(false);
    window.addEventListener('auth:unauthorized', handler);
    return () => window.removeEventListener('auth:unauthorized', handler);
  }, []);

  // 首次启动模型配置检测
  const handleModelConfigPromptRequired = useCallback(() => {
    setModelConfigPromptOpen(true);
  }, []);

  // 在后端连接成功后进行模型配置检测
  useModelConfigCheck(handleModelConfigPromptRequired);

  // 调试：跟踪 activeSkill 变化
  useEffect(() => {
    console.log('[React] activeSkill changed:', activeSkill);
  }, [activeSkill]);

  // 新增：添加文件引用（防止重复）
  const addFileReference = (item: { path: string; name: string; type: 'file' | 'directory'; size?: number; ext?: string }) => {
    setFileReferences(prev => {
      // 防止重复添加
      if (prev.some(ref => ref.path === item.path)) {
        return prev;
      }
      return [...prev, {
        id: generateUUID(),
        path: item.path,
        name: item.name,
        type: item.type,
        size: item.size,
        ext: item.ext,
        addedAt: Date.now()
      }];
    });
  };

  // 新增：删除单个引用
  const removeFileReference = (id: string) => {
    setFileReferences(prev => prev.filter(ref => ref.id !== id));
  };

  // 新增：清空所有引用
  const clearFileReferences = () => {
    setFileReferences([]);
  };

  // 新增：更新工作目录（复用函数）
  const updateWorkDir = (newDir: string) => {
    if (newDir && newDir !== currentWorkDir) {
      authFetch('/api/workdir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: newDir })
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setCurrentWorkDir(data.current);
          } else {
            // 检查是否需要添加权限
            if (data.needsPermission && data.suggestedPath) {
              // 询问用户是否要添加权限
              const shouldAdd = confirm(
                `${data.error}\n\n是否要将以下目录添加到允许列表？\n${data.suggestedPath}`
              );

              if (shouldAdd) {
                // 添加权限
                addAllowedPath(data.suggestedPath, newDir);
              }
            } else {
              alert(data.error || t('error.setWorkDirFailed'));
            }
          }
        })
        .catch(err => {
          console.error('Failed to set work directory:', err);
          alert(t('error.setWorkDirFailed'));
        });
    }
  };

  // 新增：添加允许路径并切换工作目录
  const addAllowedPath = (pathToAdd: string, targetWorkDir: string) => {
    authFetch('/api/config/allowed-paths')
      .then(res => res.json())
      .then(data => {
        const currentPaths = data.allowedPaths || [];
        const newPaths = [...currentPaths, pathToAdd];

        // 更新允许路径
        authFetch('/api/config/allowed-paths', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ allowedPaths: newPaths })
        })
          .then(res => res.json())
          .then(() => {
            // 权限添加成功，再次尝试切换工作目录
            authFetch('/api/workdir', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path: targetWorkDir })
            })
              .then(res => res.json())
              .then(data => {
                if (data.success) {
                  setCurrentWorkDir(data.current);
                  alert(t('success.permissionAdded'));
                } else {
                  alert(data.error || t('error.setWorkDirFailed'));
                }
              })
              .catch(err => {
                console.error('Failed to set work directory after adding permission:', err);
                alert(t('error.setWorkDirFailed'));
              });
          })
          .catch(err => {
            console.error('Failed to add allowed path:', err);
            alert(t('error.addPermissionFailed'));
          });
      })
      .catch(err => {
        console.error('Failed to get allowed paths:', err);
        alert(t('error.getPermissionFailed'));
      });
  };

  // 新增：防止权限弹窗重复的标志
  const pendingPermissionPathRef = useRef<string | null>(null);

  // 新增：处理文件浏览器中的权限错误
  const handlePermissionError = (path: string, onSuccess: () => void) => {
    // 防止重复弹窗：如果已经在处理这个路径的权限请求，直接返回
    if (pendingPermissionPathRef.current === path) {
      console.log('[Permission] Duplicate permission request for:', path);
      return;
    }

    // 标记正在处理这个路径
    pendingPermissionPathRef.current = path;

    // 询问用户是否要添加权限
    const shouldAdd = confirm(
      `目录 ${path} 不在允许列表中。\n\n是否要将此目录添加到允许列表？`
    );

    if (shouldAdd) {
      // 添加权限
      authFetch('/api/config/allowed-paths')
        .then(res => res.json())
        .then(data => {
          const currentPaths = data.allowedPaths || [];
          const newPaths = [...currentPaths, path];

          // 更新允许路径
          authFetch('/api/config/allowed-paths', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ allowedPaths: newPaths })
          })
            .then(res => res.json())
            .then(() => {
              // 权限添加成功，直接更新工作目录状态（避免再次触发权限检查）
              setCurrentWorkDir(path);
              alert(t('success.permissionAdded'));
              // 清除标志
              pendingPermissionPathRef.current = null;
              onSuccess();
            })
            .catch(err => {
              console.error('Failed to add allowed path:', err);
              alert(t('error.addPermissionFailed'));
              // 清除标志
              pendingPermissionPathRef.current = null;
            });
        })
        .catch(err => {
          console.error('Failed to get allowed paths:', err);
          alert(t('error.getPermissionFailed'));
          // 清除标志
          pendingPermissionPathRef.current = null;
        });
    } else {
      // 用户点击取消，清除标志
      pendingPermissionPathRef.current = null;
    }
  };

  // 获取用户主目录（鉴权确认后才请求）
  useEffect(() => {
    if (!isAuthenticated) return;
    authFetch('/api/explore/home')
      .then(res => res.json())
      .then(data => {
        if (data.home) {
          setHomeDirectory(data.home);
        }
      })
      .catch(err => {
        console.error('Failed to get home directory:', err);
      });
  }, [isAuthenticated]);

  // 获取当前工作目录（鉴权确认后才请求）
  useEffect(() => {
    if (!isAuthenticated) return;
    authFetch('/api/workdir')
      .then(res => res.json())
      .then(data => {
        if (data.current) {
          setCurrentWorkDir(data.current);
        }
      })
      .catch(err => {
        console.error('Failed to get work directory:', err);
      });
  }, [isAuthenticated]);

  // 使用 ref 存储已读状态，确保 fetchNotifications 可以访问最新值
  // ��时使用 localStorage 持久化
  const readNotificationIdsRef = useRef<Set<string>>(new Set());

  // 初始化已读状态
  useEffect(() => {
    try {
      const stored = localStorage.getItem('readNotificationIds');
      if (stored) {
        readNotificationIdsRef.current = new Set(JSON.parse(stored));
      }
    } catch {
      // ignore
    }
  }, []);

  // 保存已读状态到 localStorage
  const saveReadIds = (ids: Set<string>) => {
    localStorage.setItem('readNotificationIds', JSON.stringify([...ids]));
  };

  // 固定的定时任务通知会话 ID
  const CRON_NOTIFICATION_SESSION_ID = 'cron-notification';

  // Use refs to avoid unnecessary reconnections
  const currentSessionRef = useRef(currentSession);
  const sessionsRef = useRef(sessions);
  const backendStatusRef = useRef(backendStatus);
  currentSessionRef.current = currentSession;
  sessionsRef.current = sessions;
  backendStatusRef.current = backendStatus;

  // 键盘快捷键：Cmd/Ctrl + K 打开命令面板，Esc 停止对话
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K 打开命令面板
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
      // Esc 停止当前对话
      if (e.key === 'Escape' && loading) {
        e.preventDefault();
        stopChat();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loading]); // 依赖 loading，确保回调中能获取最新状态

  // 停止当前对话
  async function stopChat() {
    if (!loading || !currentSession) return;

    console.log('[App] Stopping chat for session:', currentSession);

    // 1. 先调用后端 API 通知停止
    try {
      await authFetch('/api/chat/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSession })
      });
    } catch (error) {
      console.error('[App] Failed to call stop API:', error);
    }

    // 2. 中断本地的 fetch 请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // 3. 更新状态
    setLoading(false);

    // 4. 在当前助手消息末尾添加停止标记
    setMessages(prev => {
      const lastMsg = prev[prev.length - 1];
      if (lastMsg?.role === 'assistant') {
        // 如果消息为空，显示已停止；否则追加停止标记
        const stoppedText = lastMsg.content.trim()
          ? '\n\n⚠️ 对话已停止'
          : '⚠️ 对话已停止';
        return prev.map((msg, idx) =>
          idx === prev.length - 1
            ? { ...msg, content: lastMsg.content + stoppedText }
            : msg
        );
      }
      return prev;
    });
  }

  // 监听输入框，当用户输入 / 时自动打开命令面板
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInput(value);

    // 如果用户输入 / 且不在命令面板中，打开命令面板
    if (value === '/' && !commandPaletteOpen) {
      setCommandPaletteOpen(true);
    }
  };

  // WebSocket connection for push notifications
  // 使用 ref 防止 React 严格模式导致的重复连接
  const wsRef = useRef<{ ws: WebSocket | null; isConnected: boolean }>({ ws: null, isConnected: false });

  useEffect(() => {
    const wsHost = window.location.host; // 使用与后端相同的 host
    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempts = 0;
    let isConnecting = false;  // 防止重复连接
    const MAX_RECONNECT_ATTEMPTS = 10;

    // 如果已经有连接，跳过
    if (wsRef.current.isConnected && wsRef.current.ws) {
      console.log('[WebSocket] Already connected, skipping...');
      return;
    }

    function connect() {
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.log('[WebSocket] Max reconnection attempts reached, stopping');
        return;
      }

      // 防止重复连接
      if (isConnecting) {
        console.log('[WebSocket] Already connecting, skipping...');
        return;
      }

      // 后端未就绪时等待，避免产生 ECONNREFUSED 代理错误
      if (backendStatusRef.current !== 'connected') {
        if (!reconnectTimeout) {
          reconnectTimeout = setTimeout(() => {
            reconnectTimeout = null;
            connect();
          }, 2000);
        }
        return;
      }

      // 每次连接都重新读取最新 token，避免 token 更新后仍用旧 URL 重连
      const wsUrl = appendTokenToWsUrl(`${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${wsHost}/ws`);

      isConnecting = true;
      console.log(`[WebSocket] Connecting to ${wsUrl} (attempt ${reconnectAttempts + 1})`);
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[WebSocket] Connected');
        reconnectAttempts = 0; // Reset on successful connection
        isConnecting = false;
        // 标记已连接
        wsRef.current = { ws, isConnected: true };
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[WebSocket] Received:', data);

          // 处理错误响应
          if (data.type === 'error') {
            console.error('[WebSocket] Server error:', data.payload);

            // 设置全局错误状态
            setGlobalError({
              message: data.payload?.message || 'Unknown server error',
              recoverable: data.payload?.recoverable !== false
            });

            // 如果错误不可恢复，可能需要重新连接
            if (!data.payload?.recoverable) {
              console.error('[WebSocket] Critical error, may need reconnection');
            }
            return;
          }

          if (data.type === 'chat-response') {
            const { sessionId, message } = data.payload;
            console.log('[WebSocket] sessionId:', sessionId, 'currentSession:', currentSessionRef.current);

            // For cron jobs (sessionId starts with 'cron:'), redirect to cron-notification session
            // For any new session, show the message
            // Note: 'default' is a normal user session, not a cron job
            const isCronJob = sessionId.startsWith('cron:');
            const displaySessionId = isCronJob ? CRON_NOTIFICATION_SESSION_ID : sessionId;
            const isNewSession = !sessionsRef.current.find(s => s.id === displaySessionId);
            const isCurrentSession = displaySessionId === currentSessionRef.current;

            console.log('[WebSocket] isCronJob:', isCronJob, 'displaySessionId:', displaySessionId, 'isNewSession:', isNewSession, 'isCurrentSession:', isCurrentSession);

            if (isCronJob || isNewSession || isCurrentSession) {
              console.log('[WebSocket] Adding message to display');
              // Switch to this session and show message
              setCurrentSession(displaySessionId);

              // Append to existing messages if already viewing this session, otherwise replace
              if (isCurrentSession && !isCronJob) {
                setMessages(prev => [...prev, {
                  id: message.id,
                  role: message.role,
                  content: message.content,
                  timestamp: message.timestamp,
                  attachments: message.attachments || []
                }]);
              } else {
                setMessages([{
                  id: message.id,
                  role: message.role,
                  content: message.content,
                  timestamp: message.timestamp,
                  attachments: message.attachments || []
                }]);
              }
              // Refresh sessions list in background (only for non-cron sessions)
              if (!isCronJob) {
                fetchSessions();
              }
              // Refresh notifications list for cron jobs
              if (isCronJob) {
                fetchNotifications();
              }
            }
          }

          // 处理会话重命名事件（后台 generateTitle 完成后推送）
          if (data.type === 'session-renamed') {
            const { sessionId, name } = data.payload;
            console.log('[WebSocket] Session renamed:', sessionId, '->', name);
            setSessions(prev => prev.map(s =>
              s.id === sessionId ? { ...s, name } : s
            ));
          }

          // 处理 skill 使用事件
          if (data.type === 'skill-used') {
            console.log('[WebSocket] Skill used event received:', data);
            const { skillName, location, timestamp } = data.payload;
            console.log('[WebSocket] Skill used:', skillName, location);

            // 即时显示（3秒后自动清除）
            setActiveSkill({ name: skillName, location });
            setTimeout(() => {
              setActiveSkill(prev => {
                if (prev?.name === skillName) {
                  return null;
                }
                return prev;
              });
            }, 3000);

            // 创建技能调用记录
            const newSkillCall: SkillCall = {
              id: generateUUID(),
              name: skillName,
              location,
              timestamp: timestamp || Date.now()
            };

            // 将技能调用添加到当前助手消息中
            // 找到最后一个 assistant 消息，添加 skillChain
            // 添加去重逻辑：避免同一技能被添加多次
            setMessages(prev => {
              const newMessages = [...prev];
              // 找到最后一个 assistant 消息（从后往前找）
              let lastAssistantIndex = -1;
              for (let i = newMessages.length - 1; i >= 0; i--) {
                if (newMessages[i].role === 'assistant') {
                  lastAssistantIndex = i;
                  break;
                }
              }
              if (lastAssistantIndex !== -1) {
                const lastAssistant = newMessages[lastAssistantIndex];
                const existingChain = lastAssistant.skillChain || [];

                // 去重：检查是否已经存在相同的技能（根据 name + location 判断）
                const isDuplicate = existingChain.some(
                  skill => skill.name === skillName && skill.location === location
                );

                if (!isDuplicate) {
                  newMessages[lastAssistantIndex] = {
                    ...lastAssistant,
                    skillChain: [...existingChain, newSkillCall]
                  };
                }
              }
              return newMessages;
            });
          }
        } catch (e) {
          console.error('[WebSocket] Failed to parse message:', e);
        }
      };

      ws.onclose = (event) => {
        isConnecting = false;
        // 服务端因 token 无效主动关闭（4401）：清除失效 token，跳转到登录页
        // 不停止重连，而是延迟重试——等用户登录后 connect() 会读取新 token
        if (event.code === 4401) {
          console.warn('[WebSocket] Unauthorized (4401), clearing token and waiting for re-login');
          clearAuthToken();
          setIsAuthenticated(false);
          // 重置计数，保证登录后的重连不受 MAX_RECONNECT_ATTEMPTS 限制
          reconnectAttempts = 0;
          if (!reconnectTimeout) {
            reconnectTimeout = setTimeout(() => {
              reconnectTimeout = null;
              connect();
            }, 5000); // 给用户 5 秒登录时间
          }
          return;
        }
        console.log(`[WebSocket] Disconnected (code: ${event.code}), reconnecting in 3s...`);
        // 只有在没有待处理的连接时才重连
        if (!reconnectTimeout) {
          reconnectAttempts++;
          reconnectTimeout = setTimeout(() => {
            reconnectTimeout = null;
            connect();
          }, 3000);
        }
      };

      ws.onerror = (event) => {
        console.error('[WebSocket] Error:', event);
        // onerror 可能会在 onclose 之前或之后触发，不在这里处理重连
      };
    }

    connect();

    return () => {
      if (ws) ws.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      // 重置连接状态，防止 React 严格模式导致重复连接
      wsRef.current = { ws: null, isConnected: false };
    };
  }, []);

  // 鉴权确认后才加载配置和会话列表，避免在未登录时发出 401 请求引发循环
  useEffect(() => {
    if (!isAuthenticated) return;
    fetchConfig();
    fetchSessions();
    fetchNotifications();
  }, [isAuthenticated]);

  async function fetchConfig() {
    try {
      const res = await authFetch('/api/config');
      const data = await res.json();
      setConfig(data);
      if (data.models?.length > 0) {
        // 优先使用 defaultModel，否则使用第一个模型
        const defaultModelName = data.defaultModel || data.models[0].name;
        setSelectedModel(defaultModelName);
      }
    } catch (e) {
      console.error('Failed to fetch config:', e);
    }
  }

  async function fetchSessions() {
    try {
      const res = await authFetch('/api/sessions');
      const data = await res.json();
      setSessions(data);
      if (data.length > 0 && !currentSession) {
        selectSession(data[0].id);
      }
    } catch (e) {
      console.error('Failed to fetch sessions:', e);
    }
  }

  // 获取通知列表
  async function fetchNotifications() {
    try {
      const res = await authFetch('/api/cron/notifications');
      const data = await res.json();

      // 合并已读状态
      const notificationsWithReadState = (data.notifications || []).map((n: Notification) => ({
        ...n,
        isRead: readNotificationIdsRef.current.has(n.sessionId)
      }));

      setNotifications(notificationsWithReadState);
      setUnreadCount(notificationsWithReadState.filter((n: Notification) => !n.isRead).length);
    } catch (e) {
      console.error('Failed to fetch notifications:', e);
    }
  }

  // 聊天消息列表滚动处理：检测用户是否滚动到底部
  const handleMessagesScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    // 如果滚动到距离底部小于 100px，认为在底部
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
    setAutoScroll(isAtBottom);
  };

  // 聊天消息自动滚动：当有新消息且用户在底部时，自动滚动到底部
  useEffect(() => {
    if (autoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, autoScroll]);

  // 点击通知项
  function handleNotificationClick(notification: Notification) {
    setSelectedNotification(notification);
    // 标记为已读
    if (!readNotificationIdsRef.current.has(notification.sessionId)) {
      readNotificationIdsRef.current.add(notification.sessionId);
      saveReadIds(readNotificationIdsRef.current);
      // 更新本地状态
      setNotifications(prev => prev.map(n =>
        n.sessionId === notification.sessionId ? { ...n, isRead: true } : n
      ));
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
  }

  async function selectSession(id: string) {
    // 如果已经在当前会话，不需要重新加载
    if (currentSession === id) return;

    // 立即显示加载状态
    setSessionLoading(true);
    setCurrentSession(id);
    // 切换会话时清空截图和终端输出（每个会话独立）
    setBrowserSnapshots([]);
    setTerminalOutputs([]);
    // 先清空消息，避免显示旧会话内容
    setMessages([]);

    try {
      const res = await authFetch(`/api/sessions/${id}`);
      const data = await res.json();
      setMessages(data.messages || []);
      // 切换会话时，更新审批模式为当前会话的设置
      if (data.approvalMode) {
        setApprovalMode(data.approvalMode as ApprovalMode);
      } else {
        // 如果会话没有设置，使用默认值
        setApprovalMode('dangerous');
      }
    } catch (e) {
      console.error('Failed to fetch session:', e);
    } finally {
      setSessionLoading(false);
    }
  }

  async function createSession() {
    try {
      const res = await authFetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selectedModel, approvalMode })
      });
      const session = await res.json();
      setSessions(prev => [session, ...prev]);
      setCurrentSession(session.id);
      setMessages([]);
      // 创建新会话时清空截图和终端输出
      setBrowserSnapshots([]);
      setTerminalOutputs([]);
    } catch (e) {
      console.error('Failed to create session:', e);
    }
  }

  async function deleteSession(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(i18n.t('confirm.deleteSession'))) return;

    try {
      const res = await authFetch(`/api/sessions/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setSessions(prev => prev.filter(s => s.id !== id));
        if (currentSession === id) {
          const remaining = sessions.filter(s => s.id !== id);
          if (remaining.length > 0) {
            selectSession(remaining[0].id);
          } else {
            setCurrentSession(null);
            setMessages([]);
          }
        }
      }
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  }

  // Office 文件扩展名列表
  const officeExtensions = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];

  // 打开画布并选择文件（从附件）
  function openCanvasFromAttachment(attachment: FileAttachment) {
    const ext = attachment.name.split('.').pop()?.toLowerCase() || '';

    // 判断是否为 Office 文件
    if (officeExtensions.includes(ext) && config?.officePreviewServer) {
      // Office 文件：使用 OnlyOffice 预览服务器打开
      const filename = attachment.url.replace('/api/files/', '');
      const filePath = `data/uploads/${filename}`;

      // 文件 URL：OnlyOffice 服务端需要从这个地址下载���件
      // 使用 /api/explore/binary 端点，因为它支持正确的 MIME 类型
      const backendPort = '8118';
      const fileUrl = appendTokenToUrl(`${window.location.port === '3081' ? 'http://localhost:' + backendPort : window.location.origin}/api/explore/binary?path=${encodeURIComponent(filePath)}`);

      // 构建预览 URL
      // 开发模式：前端在 3081，需要直接访问 OnlyOffice (8081)
      // 生产模式：通过 /office-preview/ 代理
      const isDev = window.location.port === '3081';
      const previewUrl = isDev
        ? `${config.officePreviewServer}/#/?url=${encodeURIComponent(fileUrl)}`
        : `/office-preview/#/?url=${encodeURIComponent(fileUrl)}`;

      window.open(previewUrl, '_blank');
      return;
    }

    // 检查是否是 /api/files/ 开头的 URL（保存的附件）
    // 这种情况下，图片可以直接通过 /api/files/xxx.png 访问
    // 但画布预览需要文件路径，所以仍然转换
    let filePath: string;
    if (attachment.url.startsWith('/api/files/')) {
      // 从 /api/files/xxx.png 提取文件名，构造 data/uploads/xxx.png 路径
      const filename = attachment.url.replace('/api/files/', '');
      filePath = `data/uploads/${filename}`;
    } else {
      // 其他情况（如直接的文件路径）
      filePath = attachment.url;
    }

    setCurrentFile({
      name: attachment.name,
      path: filePath,
      type: 'file',
      size: attachment.size,
      ext: ext,
      fileApiUrl: attachment.url.startsWith('/api/files/') ? attachment.url : undefined  // 保存原始 /api/files/ URL
    });
    // 添加到打开的文件列表（避免重复）
    setOpenFiles(prev => {
      const existingPaths = new Set(prev.map(f => f.path));
      if (!existingPaths.has(filePath)) {
        return [...prev, {
          name: attachment.name,
          path: filePath,
          type: 'file',
          size: attachment.size,
          ext: ext,
          fileApiUrl: attachment.url.startsWith('/api/files/') ? attachment.url : undefined
        }];
      }
      return prev;
    });
    setCanvasOpen(true);
    setCanvasForceMode('preview');
  }

  // 打开画布并选择文件（从文件浏览器）
  function handleFileSelect(file: FileItem) {
    setCurrentFile(file);
    // 添加到打开的文件列表（避免重复）
    setOpenFiles(prev => {
      const existingPaths = new Set(prev.map(f => f.path));
      if (!existingPaths.has(file.path)) {
        return [...prev, file];
      }
      return prev;
    });
    setCanvasOpen(true);
  }

  // 处理权限请求响应
  async function handlePermissionRespond(approved: boolean, updatedInput?: Record<string, unknown>) {
    if (!pendingPermission || !currentSession) {
      console.warn('[App] No pending permission or session to respond to');
      setPendingPermission(null);
      return;
    }

    try {
      const res = await authFetch('/api/permission/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSession,
          requestId: pendingPermission.requestId,
          approved,
          updatedInput,
        }),
      });

      const data = await res.json();
      console.log('[App] Permission response sent:', data);
    } catch (error) {
      console.error('[App] Failed to send permission response:', error);
    } finally {
      setPendingPermission(null);
    }
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setLoading(true);

    // 新增：构建完整的用户消息（包含文件引用）
    let fullMessage = userMessage;

    if (fileReferences.length > 0) {
      const referencesInfo = fileReferences.map(ref => {
        const parts = [
          `${ref.type === 'directory' ? '📁' : '📄'} ${ref.name}`,
          `路径: ${ref.path}`
        ];

        if (ref.type === 'file') {
          if (ref.size) parts.push(`大小: ${formatFileSize(ref.size)}`);
          if (ref.ext) parts.push(`扩展名: ${ref.ext}`);
        }

        return parts.join('\n');
      }).join('\n\n');

      fullMessage = `[引用的文件/目录]\n${referencesInfo}\n\n${userMessage}`;
    }

    // 使用 generateUUID() 生成唯一 ID
    const userMsgId = generateUUID();
    const assistantMsgId = generateUUID();

    // Optimistic update - 添加用户消息
    setMessages(prev => [...prev, {
      id: userMsgId,
      role: 'user',
      content: fullMessage,
      timestamp: Date.now()
    }]);

    // 添加一个助手消息占位符（空内容，等待流式事件填充）
    setMessages(prev => [...prev, {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now()
    }]);

    // 创建 AbortController 用于中断请求
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const res = await authFetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSession,
          message: fullMessage,
          model: selectedModel
        }),
        signal: abortController.signal
      });

      // 非 2xx 响应：立即提取错误信息显示在助手气泡中，不走 SSE 解析
      if (!res.ok) {
        let errMsg = t('error.sendFailed');
        try {
          const errData = await res.json();
          if (errData.messageKey) {
            errMsg = t(errData.messageKey, errData.messageArgs || {}) as string;
          } else if (errData.message) {
            errMsg = errData.message;
          }
        } catch { /* 忽略解析失败 */ }
        setMessages(prev => prev.map(msg =>
          msg.id === assistantMsgId ? { ...msg, content: errMsg } : msg
        ));
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let buffer = '';
      let isFirstTextChunk = true;   // 标记是否是第一个文本 chunk（用于清空占位符）
      let isFirstThinkingChunk = true; // 标记是否是第一个 thinking chunk
      let currentEvent = '';  // 当前事件类型
      let currentAssistantMsgId = assistantMsgId; // 当前正在写入的气泡 ID
      let hadToolAfterText = false; // 上一段文本之后是否发生了工具调用（触发新气泡）

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // 解析 SSE 事件
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 保留最后一个不完整的行

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            // 记录当前事件类型
            currentEvent = line.slice(7);
            continue;
          }
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            try {
              const parsed = JSON.parse(data);

              // 处理 thinking 事件（思考过程流式输出）
              if (currentEvent === 'thinking' && parsed.content !== undefined) {
                setMessages(prev => prev.map(msg => {
                  if (msg.id === currentAssistantMsgId) {
                    const currentThinking = isFirstThinkingChunk ? '' : (msg.thinking || '');
                    isFirstThinkingChunk = false;
                    return { ...msg, thinking: currentThinking + parsed.content };
                  }
                  return msg;
                }));
              }

              // 处理 chunk 事件（文本流式输出）
              if (currentEvent === 'chunk' && parsed.content !== undefined) {
                // 工具调用完成后的第一个 chunk，且当前气泡已有内容 → 开新气泡
                if (hadToolAfterText && !isFirstTextChunk) {
                  const newMsgId = generateUUID();
                  currentAssistantMsgId = newMsgId;
                  isFirstTextChunk = true;
                  isFirstThinkingChunk = true;
                  hadToolAfterText = false;
                  setMessages(prev => [...prev, {
                    id: newMsgId,
                    role: 'assistant' as const,
                    content: '',
                    timestamp: Date.now()
                  }]);
                } else {
                  hadToolAfterText = false;
                }
                setMessages(prev => prev.map(msg => {
                  if (msg.id === currentAssistantMsgId) {
                    const currentContent = isFirstTextChunk ? '' : msg.content;
                    isFirstTextChunk = false;
                    return { ...msg, content: currentContent + parsed.content };
                  }
                  return msg;
                }));
              }

              // 处理 tool 事件（工具调用）
              if (currentEvent === 'tool') {
                console.log('[App] Tool event received:', { status: parsed.status, tool: parsed.tool, args: parsed.args });
                setMessages(prev => prev.map(msg => {
                  if (msg.id === currentAssistantMsgId) {
                    // 工具调用追加到当前气泡的 toolStatus 列表
                    const existing = msg.toolStatus || [];
                    // start 事件：追加新条目；end 事件：更新对应条目的结果
                    let newToolStatus;
                    if (parsed.status === 'start') {
                      newToolStatus = [...existing, {
                        tool: parsed.tool,
                        toolId: parsed.toolId,
                        status: parsed.status,
                        args: parsed.args,
                        timestamp: Date.now()
                      }];
                    } else {
                      // end 事件：找到对应的 start 条目更新，或追加
                      let idx = -1;
                      for (let i = existing.length - 1; i >= 0; i--) {
                        if ((existing[i] as any).tool === parsed.tool && (existing[i] as any).status === 'start') {
                          idx = i;
                          break;
                        }
                      }
                      if (idx >= 0) {
                        newToolStatus = existing.map((t: any, i: number) =>
                          i === idx ? {
                            ...t,
                            status: 'end',
                            // 保留原有的 args，如果 end 事件中有 args 则使用 end 的
                            args: parsed.args || t.args,
                            result: parsed.result,
                            isError: parsed.isError
                          } : t
                        );
                      } else {
                        newToolStatus = [...existing, {
                          tool: parsed.tool,
                          toolId: parsed.toolId,
                          status: parsed.status,
                          args: parsed.args,
                          result: parsed.result,
                          isError: parsed.isError,
                          timestamp: Date.now()
                        }];
                      }
                    }
                    return { ...msg, toolStatus: newToolStatus };
                  }
                  return msg;
                }));

                // 工具完成后标记，下次 chunk 开新气泡
                if (parsed.status === 'end') {
                  hadToolAfterText = true;
                }

                // 处理浏览器快照（tool_end + browser_snapshot）
                // 保存 URL 和 title 供后续截图使用
                if (parsed.status === 'end' && parsed.tool === 'browser_snapshot' && parsed.result) {
                  const result = parsed.result as any;
                  if (result.url) {
                    latestBrowserSnapshotRef.current = {
                      url: result.url,
                      title: result.title
                    };
                  }
                }

                // 处理浏览器截图（tool_end + browser_screenshot）
                if (parsed.status === 'end' && parsed.tool === 'browser_screenshot' && parsed.result) {
                  const result = parsed.result as any;
                  if (result.image) {  // 后端返回的是 image 字段，不是 screenshot
                    // 添加到浏览器截图列表（直接使用result中的url和title）
                    setBrowserSnapshots(prev => [...prev, {
                      id: generateUUID(),
                      url: result.url || 'unknown',        // 使用 result 中的 url
                      timestamp: Date.now(),
                      screenshot: result.image,             // 使用 image 字段
                      title: result.title                   // 使用 result 中的 title
                    }]);
                    // 自动打开画布并切换到浏览器标签
                    setCanvasOpen(true);
                    setCanvasForceMode('browser');
                  }
                }

                // 处理命令执行（tool_end + exec 或 Bash）
                // exec: OpenAICompatRunner 使用的自定义工具
                // Bash: ClaudeAgentRunner (Claude SDK) 内置工具
                console.log("[App] Tool event check:", { status: parsed.status, tool: parsed.tool, hasResult: !!parsed.result, args: parsed.args });
                if (parsed.status === 'end' && (parsed.tool === 'exec' || parsed.tool === 'Bash') && parsed.result) {
                  const result = parsed.result as any;
                  console.log('[App] Bash/exec tool result:', { tool: parsed.tool, args: parsed.args, result: result?.slice?.(0, 100) || result });
                  // 处理不同格式的结果
                  // exec: { output: "...", error: "..." }
                  // Bash (SDK): 可能是字符串，或者 { stdout: "...", stderr: "..." }
                  let output = '';
                  let error = '';

                  if (typeof result === 'string') {
                    // Bash SDK 可能直接返回字符串
                    output = result;
                  } else {
                    // 对象格式
                    output = result.output || result.stdout || '';
                    error = result.error || result.stderr || '';
                  }

                  if (output || error) {
                    // 添加到终端输出列表
                    // 提取命令：支持多种字段名 (command/cmd/script/arg_string)
                    // Bash SDK 工具的参数结构可能是 { command: "..." } 或 { arg_string: "..." }
                    const args = parsed.args as any;
                    const command = args?.command || args?.cmd || args?.script || args?.arg_string || 'unknown';
                    console.log('[App] Adding terminal output:', { command, args: parsed.args, outputLength: output.length, errorLength: error.length });
                    setTerminalOutputs(prev => [...prev, {
                      id: generateUUID(),
                      command: command,
                      output: output,
                      error: error,
                      timestamp: Date.now()
                    }]);
                    // 自动打开画布并切换到终端标签
                    setCanvasOpen(true);
                    setCanvasForceMode('terminal');
                  }
                }
              }

              // 处理 permission 事件（权限请求）
              if (currentEvent === 'permission') {
                console.log('[App] Permission request:', parsed);
                setPendingPermission({
                  requestId: parsed.requestId,
                  toolName: parsed.toolName,
                  toolInput: parsed.toolInput,
                  isDangerous: parsed.isDangerous,
                  reason: parsed.reason,
                });
              }

              // 处理 error 事件（错误）
              if (currentEvent === 'error') {
                console.log('[App] Error:', parsed);
                setMessages(prev => prev.map(msg => {
                  if (msg.id === currentAssistantMsgId) {
                    return {
                      ...msg,
                      content: msg.content + `\n\n❌ 错误: ${parsed.content}`
                    };
                  }
                  return msg;
                }));
              }

              // 处理 done 事件中的 sessionName
              if (currentEvent === 'done' && parsed.sessionName) {
                setSessions(prev => prev.map(s =>
                  s.id === currentSession ? { ...s, name: parsed.sessionName } : s
                ));
              }

              // 处理 done 事件中的附件（如截图、send_file 发送的文件）
              // ��用 currentAssistantMsgId 确保附件添加到最后一个消息气泡
              if (currentEvent === 'done' && parsed.attachments) {
                console.log('[App] Received done event with attachments:', parsed.attachments.length);
                setMessages(prev => prev.map(msg => {
                  if (msg.id === currentAssistantMsgId) {
                    return { ...msg, attachments: parsed.attachments };
                  }
                  return msg;
                }));
                // 自动打开画布预览所有附件（多标签）
                if (parsed.attachments.length > 0) {
                  // 将所有附件转换为 FileItem 格式
                  const newFiles: FileItem[] = parsed.attachments.map((attachment: any) => {
                    // 对于 /api/files/ 开头的 URL，构造完整路径 data/uploads/xxx.ext
                    // 这样 PreviewPane 和 OfficePreview 可以正确访问文件
                    const ext = attachment.name.split('.').pop()?.toLowerCase() || '';
                    let filePath: string;
                    let fileApiUrl: string | undefined;

                    if (attachment.url.startsWith('/api/files/')) {
                      // 从 /api/files/xxx.docx 提取文件名，构造 data/uploads/xxx.docx 路径
                      const filename = attachment.url.replace('/api/files/', '');
                      filePath = `data/uploads/${filename}`;
                      fileApiUrl = attachment.url;  // 保留原始 URL 用于直接访问
                    } else {
                      filePath = attachment.url;
                      fileApiUrl = undefined;
                    }

                    return {
                      name: attachment.name,
                      path: filePath,
                      type: 'file' as const,
                      size: attachment.size,
                      ext: ext,
                      fileApiUrl
                    };
                  });

                  // 添加到打开的文件列表
                  setOpenFiles(prev => {
                    // 避免重复添加相同路径的文件
                    const existingPaths = new Set(prev.map(f => f.path));
                    const uniqueNewFiles = newFiles.filter(f => !existingPaths.has(f.path));
                    return [...prev, ...uniqueNewFiles];
                  });

                  // 设置当前文件为第一个附件
                  setCurrentFile(newFiles[0]);
                  setCanvasOpen(true);
                  setCanvasForceMode('preview');
                }
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      }
    } catch (e) {
      // 如果是用户主动中断，不显示错误
      if (e instanceof Error && e.name === 'AbortError') {
        console.log('[App] Chat aborted by user');
        return; // stopChat 已经处理了状态更新
      }

      console.error('Failed to send message:', e);

      // 提供更详细的错误信息
      let errorMessage = t('error.sendFailed');
      if (e instanceof Error) {
        if (e.message.includes('fetch')) {
          errorMessage = t('error.networkError');
        } else if (e.message.includes('timeout')) {
          errorMessage = t('error.timeout');
        } else {
          errorMessage = `${t('error.sendFailed')}: ${e.message}`;
        }
      }

      // 错误时更新助手消息
      setMessages(prev => prev.map(msg =>
        msg.id === assistantMsgId
          ? { ...msg, content: errorMessage }
          : msg
      ));

      // 显示用户友好的错误提示
      if (window.confirm(`${errorMessage}\n\n是否重试？`)) {
        // 用户选择重试，重新发送消息
        setTimeout(() => {
          const inputEl = document.querySelector('input[type="text"]') as HTMLInputElement;
          if (inputEl) {
            inputEl.value = userMessage;
            setInput(userMessage);
          }
        }, 100);
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
      // 延迟刷新会话列表，获取可能生成的标题
      setTimeout(() => fetchSessions(), 1500);
    }
  }

  // 鉴权未通过时显示登录页
  if (authChecked && !isAuthenticated) {
    return (
      <LoginPage onLogin={() => {
        setIsAuthenticated(true);
      }} />
    );
  }

  return (
    <ErrorBoundary>
      {/* 后端状态提示 */}
      {backendStatus === 'checking' && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-blue-500 text-white text-center py-2 text-sm">
          <div className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            {t('backend.checking') || '正在连接后端服务...'}
          </div>
        </div>
      )}

      {backendStatus === 'reconnecting' && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-white text-center py-2 text-sm">
          <div className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            {healthError ? `后端连接失败：${healthError}` : (t('backend.reconnecting') || '后端服务可能正在重启')}，5 秒后自动重试{retryCount > 1 ? ` (${retryCount})` : ''}
          </div>
        </div>
      )}

      <div className="h-screen flex flex-col md:flex-row overflow-hidden">
        {/* Sidebar */}
        <aside className="w-full md:w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col h-full">
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-primary-600">
              <img src="/logo.png" alt="Logo" className="w-8 h-8 object-contain" />
              <span className="text-xl font-bold">{t('app.title')}</span>
            </div>
            {/* Backend health status dot */}
            <button
              type="button"
              onClick={() => backendStatus === 'reconnecting' && setShowHealthDetail(v => !v)}
              title={
                backendStatus === 'checking' ? '检查中...' :
                backendStatus === 'connected' ? '后端在线' :
                `后端离线${healthError ? '：' + healthError : ''}`
              }
              className={`flex items-center gap-1.5 text-xs rounded px-1.5 py-1 transition-colors ${
                backendStatus === 'reconnecting'
                  ? 'cursor-pointer hover:bg-red-50 dark:hover:bg-red-950/30'
                  : 'cursor-default'
              }`}
            >
              {backendStatus === 'checking' && (
                <svg className="w-3 h-3 animate-spin text-gray-400" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              )}
              {backendStatus === 'connected' && (
                <span className="w-2 h-2 rounded-full bg-green-500" />
              )}
              {backendStatus === 'reconnecting' && (
                <>
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-red-500 dark:text-red-400">离线</span>
                </>
              )}
            </button>
          </div>

          {/* Offline guidance panel (expands below header) */}
          {backendStatus === 'reconnecting' && showHealthDetail && (
            <div className="mt-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 p-3 space-y-2">
              <p className="text-xs text-red-700 dark:text-red-300 font-medium">后端服务未启动或已崩溃</p>
              <div className="flex items-center gap-2 bg-gray-900 dark:bg-black rounded-md px-3 py-1.5">
                <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3" />
                </svg>
                <code className="text-xs text-green-400 font-mono">npm start</code>
              </div>
              {healthError && (
                <div className="text-xs text-red-500 dark:text-red-400 font-mono bg-red-100 dark:bg-red-950/40 rounded px-2 py-1 break-all">
                  {healthError}
                </div>
              )}
              <p className="text-xs text-red-500 dark:text-red-400">已重试 {retryCount} 次，每 5 秒自动重试。</p>
            </div>
          )}
        </div>

        <div className="p-2 flex-shrink-0">
          <button
            onClick={createSession}
            className="w-full flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t('app.newChat')}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {/* 固定的定时任务通知会话 */}
          <button
            onClick={() => {
              setCurrentSession(CRON_NOTIFICATION_SESSION_ID);
              setMessages([]); // 清空消息，点击时重新加载
            }}
            className={`w-full text-left px-4 py-3 flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
              currentSession === CRON_NOTIFICATION_SESSION_ID ? 'bg-gray-100 dark:bg-gray-800' : ''
            }`}
          >
            <Clock className="w-4 h-4 text-orange-500 flex-shrink-0" />
            <span className="truncate flex-1 text-orange-600 dark:text-orange-400">{t('notification.cronNotification')}</span>
          </button>

          {sessions.map(session => (
            <button
              key={session.id}
              onClick={() => selectSession(session.id)}
              className={`w-full text-left px-4 py-3 flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group ${
                currentSession === session.id ? 'bg-gray-100 dark:bg-gray-800' : ''
              }`}
            >
              <MessageCircle className="w-4 h-4 text-gray-500 flex-shrink-0" />
              <span className="truncate flex-1">{session.name}</span>
              <Trash2
                className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all flex-shrink-0"
                onClick={(e) => deleteSession(session.id, e)}
              />
            </button>
          ))}
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex-shrink-0">
          <button
            onClick={() => setCronOpen(true)}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 w-full"
          >
            <Clock className="w-4 h-4" />
            {t('app.scheduledTasks')}
          </button>
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex-shrink-0 flex items-center justify-between">
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
          >
            <Settings className="w-4 h-4" />
            {t('app.settings')}
          </button>
          {authEnabled && (
            <button
              onClick={() => { clearAuthToken(); setIsAuthenticated(false); }}
              className="flex items-center gap-1.5 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
              title="退出登录"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </aside>

      {/* Main content and Canvas container */}
      <div className="flex-1 flex h-full overflow-hidden min-w-0">
        {/* Main content */}
        <main className="flex-1 flex flex-col h-full transition-all duration-300 min-w-0">
        {/* Model selector & Notification Bell */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex-shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {config?.models && config.models.length >= 1 && (
              <select
                value={selectedModel}
                onChange={e => setSelectedModel(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
              >
                {config.models.map(m => (
                  <option key={m.name} value={m.name}>{m.name}</option>
                ))}
              </select>
            )}
            {/* Language Switcher */}
            <LanguageSwitcher />
          </div>
          <div className="flex items-center gap-3">
            {/* Canvas Button */}
            <button
              onClick={() => {
                setCanvasOpen(!canvasOpen);
                setCanvasForceMode(undefined);  // 不强制模式，让用户自由切换
              }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors text-sm ${
                canvasOpen
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                  : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              title={canvasOpen ? t('app.closePanel') : t('app.openPanel')}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span className="hidden md:inline">{t('app.computer')}</span>
            </button>

            <NotificationBell
              unreadCount={unreadCount}
              onClick={() => setNotificationPanelOpen(true)}
            />

            {/* Tunnel Button */}
            <button
              onClick={() => setTunnelOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm"
              title={t('app.intranetConfig')}
            >
              <Wifi className="w-4 h-4" />
              <span className="hidden md:inline">{t('app.intranetTunnel')}</span>
            </button>
          </div>
        </div>

        {/* Messages */}
        <div
          className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4 min-h-0 relative"
          onScroll={handleMessagesScroll}
        >
          {/* Global Error Display */}
          {globalError && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="text-red-500">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <p className="text-red-800 font-medium">{globalError.message}</p>
                  {globalError.recoverable && (
                    <p className="text-red-600 text-sm">您可以重试或刷新页面恢复连接</p>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                {globalError.recoverable && (
                  <button
                    onClick={() => {
                      setGlobalError(null);
                      window.location.reload();
                    }}
                    className="px-3 py-1 bg-red-100 text-red-800 rounded hover:bg-red-200 transition-colors"
                  >
                    重试
                  </button>
                )}
                <button
                  onClick={() => setGlobalError(null)}
                  className="text-red-500 hover:text-red-700 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* 会话切换加载状态 */}
          {sessionLoading && (
            <div className="flex items-center justify-center h-full absolute inset-0 bg-white/80 dark:bg-gray-900/80 z-10">
              <div className="text-center">
                <div className="relative w-16 h-16 mx-auto mb-4">
                  {/* 外圈旋转 */}
                  <div className="absolute inset-0 border-4 border-gray-200 dark:border-gray-700 rounded-full"></div>
                  <div className="absolute inset-0 border-4 border-transparent border-t-primary-500 rounded-full animate-spin"></div>
                  {/* 内部图标 */}
                  <div className="absolute inset-2 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center">
                    <MessageCircle className="w-6 h-6 text-primary-500" />
                  </div>
                </div>
                <p className="text-gray-500 dark:text-gray-400 text-sm animate-pulse">
                  {t('app.loadingSession') || '加载会话中...'}
                </p>
              </div>
            </div>
          )}

          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="text-center">
                <Bot className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p>{t('app.startNewChat')}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  {/* 头像 */}
                  <div className="flex-shrink-0">
                    {msg.role === 'user' ? (
                      <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-white text-sm font-medium">
                        U
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-sm">
                        🤖
                      </div>
                    )}
                  </div>

                  {/* 消息内容 */}
                  <div className={`flex-1 min-w-0 ${msg.role === 'user' ? 'max-w-[80%] md:max-w-[70%]' : ''}`}>
                    {/* 消息头 */}
                    <div className={`flex items-center gap-2 mb-1 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {msg.role === 'user' ? '你' : '助手'}
                      </span>
                    </div>

                    {/* 消息主体 */}
                    <div
                      className={`px-4 py-3 rounded-lg overflow-hidden ${
                        msg.role === 'user'
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      {msg.role === 'user' ? (
                        <div className="break-words whitespace-pre-wrap">{msg.content}</div>
                      ) : (
                        <div className="space-y-1">
                          {/* 思考过程 - 紧凑单行折叠，Claude Code 风格 */}
                          {msg.thinking && (
                            <div className="text-sm">
                              <button
                                onClick={() => {
                                  setExpandedThinking(prev => {
                                    const next = new Set(prev);
                                    if (next.has(msg.id)) { next.delete(msg.id); } else { next.add(msg.id); }
                                    return next;
                                  });
                                }}
                                className="flex items-center gap-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors py-0.5"
                              >
                                <svg className={`w-3 h-3 transition-transform duration-150 ${expandedThinking.has(msg.id) ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
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

                          {/* 工具调用展示 - 紧凑单行，Claude Code 风格 */}
                          {msg.toolStatus && msg.toolStatus.length > 0 && (
                            <div className="space-y-0.5">
                              {msg.toolStatus.map((tool, idx) => {
                                const isRunning = tool.status === 'start';
                                const isError = tool.isError;
                                const toolExpKey = `${msg.id}-tool-${idx}`;

                                const formatResult = (result: unknown): string => {
                                  if (!result) return '';
                                  if (typeof result === 'string') return result;
                                  try { return JSON.stringify(result, null, 2); } catch { return String(result); }
                                };

                                const argsPreview = tool.args
                                  ? formatToolArgs(tool.tool, tool.args).slice(0, 60) + (formatToolArgs(tool.tool, tool.args).length > 60 ? '…' : '')
                                  : '';

                                return (
                                  <div key={idx} className="text-sm">
                                    <button
                                      onClick={() => {
                                        setExpandedThinking(prev => {
                                          const next = new Set(prev);
                                          if (next.has(toolExpKey)) { next.delete(toolExpKey); } else { next.add(toolExpKey); }
                                          return next;
                                        });
                                      }}
                                      className="flex items-center gap-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors py-0.5 w-full text-left"
                                    >
                                      {isRunning ? (
                                        <svg className="w-3 h-3 animate-spin text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                                        </svg>
                                      ) : isError ? (
                                        <span className="w-3 h-3 flex-shrink-0 text-red-400 text-xs leading-none">✗</span>
                                      ) : (
                                        <span className="w-3 h-3 flex-shrink-0 text-green-400 text-xs leading-none">✓</span>
                                      )}
                                      <svg className={`w-2.5 h-2.5 flex-shrink-0 transition-transform duration-150 ${expandedThinking.has(toolExpKey) ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
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
                          {/* 只有当有实际内容时才渲染，否则显示简洁的加载指示器 */}
                          {msg.content.trim() || msg.thinking || (msg.toolStatus && msg.toolStatus.length > 0) ? (
                            <div className="prose prose-sm dark:prose-invert max-w-none break-words [&_pre]:bg-gray-900 [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_code]:text-sm [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_th]:whitespace-nowrap [&_td]:whitespace-nowrap">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {msg.content}
                              </ReactMarkdown>
                            </div>
                          ) : (
                            /* 等待响应时的加载指示器 - 简洁的三个点动画 */
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
                                <FileAttachmentCard key={attachment.id} attachment={attachment} onOpenCanvas={() => openCanvasFromAttachment(attachment)} />
                              ))}
                            </div>
                          )}

                          {/* 技能调用链展示 */}
                          {msg.skillChain && msg.skillChain.length > 0 && (
                            <SkillChainDisplay skills={msg.skillChain} />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 dark:bg-gray-800 px-4 py-2 rounded-lg">
                {messages.length > 0 && messages[messages.length - 1].toolStatus && messages[messages.length - 1].toolStatus!.length > 0 ? (
                  <div className="flex items-center gap-2">
                    <span className="animate-spin">⚙️</span>
                    <span>
                      {(() => {
                        const lastTool = messages[messages.length - 1].toolStatus![messages[messages.length - 1].toolStatus!.length - 1];
                        if (lastTool.status === 'start') {
                          const toolInfo = formatToolArgs(lastTool.tool, lastTool.args);
                          return toolInfo || `${getToolDisplayName(lastTool.tool)}...`;
                        }
                        return t('app.thinking');
                      })()}
                    </span>
                  </div>
                ) : (
                  <span className="animate-pulse">{t('app.thinking')}</span>
                )}
              </div>
            </div>
          )}
          {/* 滚动锚点 - 用于自动滚动到底部 */}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          {/* 审批模式 + 工作目录选择器 */}
          <div className="flex items-center gap-2 mb-2">
            {/* 审批模式选择器 */}
            <select
              value={approvalMode}
              onChange={async (e) => {
                const newMode = e.target.value as ApprovalMode;
                setApprovalMode(newMode);
                // 如果有当前会话，更新会话的审批模式
                if (currentSession) {
                  try {
                    await authFetch(`/api/sessions/${currentSession}`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ approvalMode: newMode })
                    });
                    console.log('Updated approval mode to:', newMode);
                  } catch (err) {
                    console.error('Failed to update approval mode:', err);
                  }
                }
              }}
              className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
              title={t('approval.title')}
            >
              <option value="auto">{t('approval.auto')}</option>
              <option value="dangerous">{t('approval.dangerous')}</option>
              <option value="ask">{t('approval.ask')}</option>
            </select>
            {/* 工作目录 */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm">
              <FolderOpen className="w-4 h-4 text-primary-600 dark:text-primary-400" />
              <span className="text-gray-600 dark:text-gray-400">{t('app.workDir')}:</span>
              <button
                onClick={() => {
                  const newDir = prompt(t('app.enterWorkDir'), currentWorkDir);
                  if (newDir && newDir !== currentWorkDir) {
                    updateWorkDir(newDir);
                  }
                }}
                className="text-primary-600 dark:text-primary-400 hover:underline font-mono text-xs truncate max-w-md"
                title={t('app.clickToChange')}
              >
                {currentWorkDir}
              </button>
            </div>
          </div>
          {/* 新增：文件引用标签 */}
          <FileReferenceTags
            references={fileReferences}
            onRemove={removeFileReference}
            onClear={clearFileReferences}
          />

          {/* Active Skill Indicator - 更明显的样式 */}
          {activeSkill && (
            <div className="mb-2 px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/40 dark:to-indigo-900/40 border-2 border-blue-300 dark:border-blue-700 rounded-lg flex items-center gap-3 animate-pulse shadow-md">
              <span className="text-xl">⚡</span>
              <span className="text-blue-700 dark:text-blue-300 text-sm font-medium">
                使用技能: <strong className="text-blue-800 dark:text-blue-200">{activeSkill.name}</strong>
              </span>
            </div>
          )}

          <form onSubmit={sendMessage} className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={handleInputChange}
              placeholder={t('app.inputPlaceholder')}
              className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
              disabled={loading}
            />
            {loading ? (
              <button
                type="button"
                onClick={stopChat}
                className="px-6 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center gap-2"
                title={t('app.stop') + ' (Esc)'}
              >
                <Square className="w-4 h-4" />
                {t('app.stop')}
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {t('app.send')}
              </button>
            )}
          </form>
        </div>
        </main>

        {/* Canvas Panel */}
        <CanvasPanel
          isOpen={canvasOpen}
          onClose={() => {
            setCanvasOpen(false);
            setCanvasForceMode(undefined);  // 重置强制模式
          }}
          currentFile={currentFile}
          onFileSelect={handleFileSelect}
          browserSnapshots={browserSnapshots}
          terminalOutputs={terminalOutputs}
          forceMode={canvasForceMode}
          onClearForceMode={() => setCanvasForceMode(undefined)}
          homeDirectory={homeDirectory}
          officePreviewServer={config?.officePreviewServer}
          serverUrl={window.location.port === '3000' ? 'http://localhost:8118' : window.location.origin}
          onAddReference={addFileReference}
          onWorkDirChange={updateWorkDir}
          onPermissionError={handlePermissionError}
          openFiles={openFiles}
          onOpenFilesChange={setOpenFiles}
          onCurrentFileChange={setCurrentFile}
        />
      </div>

      {/* Cron Panel */}
      <CronPanel isOpen={cronOpen} onClose={() => setCronOpen(false)} />

      {/* Tunnel Panel */}
      <TunnelPanel isOpen={tunnelOpen} onClose={() => setTunnelOpen(false)} />

      {/* Notification Panel */}
      <NotificationPanel
        isOpen={notificationPanelOpen}
        onClose={() => setNotificationPanelOpen(false)}
        notifications={notifications}
        onItemClick={handleNotificationClick}
      />

      {/* Notification Detail */}
      <NotificationDetail
        notification={selectedNotification}
        isOpen={selectedNotification !== null}
        onClose={() => setSelectedNotification(null)}
      />

      {/* Settings Panel */}
      <SettingsPanel
        isOpen={settingsOpen}
        onClose={async () => {
          setSettingsOpen(false);
          // 关闭设置面板时检查模型配置，标记为已配置
          try {
            const res = await authFetch('/api/models');
            if (res.ok) {
              const data = await res.json();
              const models = data.models || [];
              const hasValidModel = models.some((m: { apiKey?: string; model?: string }) => m.apiKey && m.apiKey !== '***' && m.model);
              if (hasValidModel) {
                markModelConfigured();
              }
            }
          } catch (err) {
            console.error('Failed to check model config on settings close:', err);
          }
        }}
      />

      {/* 首次启动模型配置提示 */}
      {modelConfigPromptOpen && (
        <ModelConfigPrompt
          onClose={() => setModelConfigPromptOpen(false)}
          onOpenSettings={() => {
            markModelConfigPending(); // 标记用户正在配置，防止再次弹窗
            setModelConfigPromptOpen(false);
            setSettingsOpen(true);
          }}
        />
      )}

      {/* Command Palette - 命令面板 */}
      {commandPaletteOpen && (
        <CommandPalette
          onSelect={(command) => {
            setInput(command);
            // 聚焦到输入框
            const inputEl = document.querySelector('input[type="text"]') as HTMLInputElement;
            inputEl?.focus();
          }}
          onClose={() => setCommandPaletteOpen(false)}
        />
      )}

      {/* 权限请求模态框 */}
      {pendingPermission && (
        <PermissionModal
          permission={pendingPermission}
          onRespond={handlePermissionRespond}
        />
      )}
      </div>
    </ErrorBoundary>
  );
}

export default App;
