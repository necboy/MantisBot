/**
 * 前端错误处理类型定义
 * 与后端的 ErrorCategory 和 ClassifiedError 保持一致
 */

/**
 * 错误分类枚举
 */
export enum ErrorCategory {
  /** 业务逻辑或领域特定错误 */
  BUSINESS = 'BUSINESS',

  /** 网络连接和通信错误 */
  NETWORK = 'NETWORK',

  /** 外部服务失败（API、数据库等） */
  EXTERNAL_SERVICE = 'EXTERNAL_SERVICE',

  /** 系统级错误（内存、磁盘、权限） */
  SYSTEM = 'SYSTEM',

  /** 用户输入验证和格式化错误 */
  USER_INPUT = 'USER_INPUT',

  /** 配置和设置错误 */
  CONFIGURATION = 'CONFIGURATION',

  /** 未分类或意外错误 */
  UNKNOWN = 'UNKNOWN'
}

/**
 * 错误严重程度
 */
export enum ErrorSeverity {
  /** 低影响，非关键错误 */
  LOW = 'LOW',

  /** 中等影响，可能影响功能 */
  MEDIUM = 'MEDIUM',

  /** 高影响，显著功能降级 */
  HIGH = 'HIGH',

  /** 关键错误，可能导致系统故障 */
  CRITICAL = 'CRITICAL'
}

/**
 * 错误上下文信息
 */
export interface ErrorContext {
  /** 导致错误的请求的唯一标识符 */
  requestId: string;

  /** 会话标识符（可选） */
  sessionId?: string;

  /** 处理请求的代理标识符（可选） */
  agentId?: string;

  /** 发生错误的频道标识符（可选） */
  channelId?: string;

  /** 创建错误上下文的时间戳 */
  timestamp: number;

  /** 与错误相关的其他元数据 */
  metadata?: Record<string, any>;
}

/**
 * 重试配置
 */
export interface RetryConfig {
  /** 最大重试次数 */
  maxAttempts: number;

  /** 初始延迟（毫秒） */
  delayMs: number;

  /** 指数退避因子 */
  backoffFactor?: number;

  /** 重试之间的最大延迟（毫秒） */
  maxDelayMs?: number;
}

/**
 * 恢复操作
 */
export interface RecoveryAction {
  /** 恢复操作类型 */
  type: string;

  /** 操作的人类可读描述 */
  description: string;

  /** 是否可以自动执行此操作 */
  automatic: boolean;

  /** 如果这是重试操作的重试配置 */
  retryConfig?: RetryConfig;

  /** 恢复操作的额外参数 */
  parameters?: Record<string, any>;
}

/**
 * 已分类的错误
 */
export interface ClassifiedError {
  /** 此错误实例的唯一标识符 */
  id: string;

  /** 错误分类类别 */
  category: ErrorCategory;

  /** 错误严重程度 */
  severity: ErrorSeverity;

  /** 人类可读的错误消息 */
  message: string;

  /** 导致此分类错误的原始错误对象（可选） */
  originalError?: Error;

  /** 发生错误时的上下文信息 */
  context: ErrorContext;

  /** 建议的恢复操作列表 */
  suggestedActions?: RecoveryAction[];

  /** 此错误是否可能可恢复 */
  recoverable: boolean;

  /** 错误分类时的时间戳 */
  timestamp: number;

  /** 特定于错误的其他数据 */
  data?: Record<string, any>;
}

/**
 * 错误处理结果
 */
export interface ErrorHandlingResult {
  /** 错误处理是否成功 */
  success: boolean;

  /** 为处理错误而采取的操作 */
  action: string;

  /** 关于处理结果的描述性消息 */
  message: string;

  /** 处理过程中发生的错误（如果有） */
  error?: Error;

  /** 进行的重试尝试次数 */
  retryCount?: number;

  /** 处理错误的总时间（毫秒） */
  totalTimeMs?: number;

  /** 其他结果数据 */
  data?: Record<string, any>;
}

/**
 * 用户友好的错误信息
 */
export interface UserFriendlyError {
  /** 用户友好的标题 */
  title: string;

  /** 用户友好的描述 */
  description: string;

  /** 建议的用户操作 */
  userActions?: string[];

  /** 错误图标类型 */
  iconType: 'warning' | 'error' | 'info' | 'network' | 'system';
}