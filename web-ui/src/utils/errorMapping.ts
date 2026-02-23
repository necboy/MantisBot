import { ErrorCategory, ErrorSeverity, ClassifiedError, UserFriendlyError, ErrorContext } from '../types/errorTypes';

/**
 * 生成唯一的错误ID
 * 格式: err-{8-char-hash}-{4-char-suffix}
 */
export function generateErrorId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  const hash = (timestamp + random).substring(0, 8);
  const suffix = Math.random().toString(36).substring(2, 6);

  return `err-${hash}-${suffix}`;
}

/**
 * 生成唯一的请求ID
 * 格式: req-{8-char-hash}-{4-char-suffix}
 */
export function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  const hash = (timestamp + random).substring(0, 8);
  const suffix = Math.random().toString(36).substring(2, 6);

  return `req-${hash}-${suffix}`;
}

/**
 * 将错误类别映射为用户友好的中文描述
 */
export const ERROR_CATEGORY_LABELS: Record<ErrorCategory, string> = {
  [ErrorCategory.BUSINESS]: '业务逻辑错误',
  [ErrorCategory.NETWORK]: '网络连接错误',
  [ErrorCategory.EXTERNAL_SERVICE]: '外部服务错误',
  [ErrorCategory.SYSTEM]: '系统错误',
  [ErrorCategory.USER_INPUT]: '输入验证错误',
  [ErrorCategory.CONFIGURATION]: '配置错误',
  [ErrorCategory.UNKNOWN]: '未知错误'
};

/**
 * 将错误严重程度映射为用户友好的中文描述
 */
export const ERROR_SEVERITY_LABELS: Record<ErrorSeverity, string> = {
  [ErrorSeverity.LOW]: '轻微',
  [ErrorSeverity.MEDIUM]: '中等',
  [ErrorSeverity.HIGH]: '严重',
  [ErrorSeverity.CRITICAL]: '关键'
};

/**
 * 获取错误严重程度的颜色类名
 */
export function getSeverityColorClass(severity: ErrorSeverity): string {
  switch (severity) {
    case ErrorSeverity.LOW:
      return 'text-blue-600 bg-blue-50 border-blue-200';
    case ErrorSeverity.MEDIUM:
      return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    case ErrorSeverity.HIGH:
      return 'text-orange-600 bg-orange-50 border-orange-200';
    case ErrorSeverity.CRITICAL:
      return 'text-red-600 bg-red-50 border-red-200';
    default:
      return 'text-gray-600 bg-gray-50 border-gray-200';
  }
}

/**
 * 将分类错误转换为用户友好的错误信息
 */
export function mapToUserFriendlyError(classifiedError: ClassifiedError): UserFriendlyError {
  const categoryMapping: Record<ErrorCategory, { title: string; description: string; iconType: UserFriendlyError['iconType'] }> = {
    [ErrorCategory.NETWORK]: {
      title: '网络连接问��',
      description: '无法连接到服务器，请检查您的网络连接',
      iconType: 'network'
    },
    [ErrorCategory.EXTERNAL_SERVICE]: {
      title: '服务暂时不可用',
      description: '外部服务出现问题，请稍后重试',
      iconType: 'error'
    },
    [ErrorCategory.USER_INPUT]: {
      title: '输入验证失败',
      description: '请检查您的输入内容是否正确',
      iconType: 'warning'
    },
    [ErrorCategory.SYSTEM]: {
      title: '系统错误',
      description: '系统遇到问题，请联系技术支持',
      iconType: 'system'
    },
    [ErrorCategory.CONFIGURATION]: {
      title: '配置错误',
      description: '应用配置存在问题，请检查设置',
      iconType: 'warning'
    },
    [ErrorCategory.BUSINESS]: {
      title: '业务规则错误',
      description: '操作不符合业务规则，请检查操作步骤',
      iconType: 'info'
    },
    [ErrorCategory.UNKNOWN]: {
      title: '意外错误',
      description: '发生了意外错误，请稍后重试',
      iconType: 'error'
    }
  };

  const mapping = categoryMapping[classifiedError.category];

  // 生成用户可执行的操作建议
  const userActions = classifiedError.suggestedActions?.map(action => {
    const actionMapping: Record<string, string> = {
      'refresh': '刷新页面',
      'retry': '重试操作',
      'check_connection': '检查网络连接',
      'validate_input': '检查输入内容',
      'check_config': '检查配置设置',
      'contact_support': '联系技术支持',
      'reload': '重新加载应用',
      'clear_cache': '清除缓存',
      'logout_login': '重新登录'
    };

    return actionMapping[action.type] || action.description;
  }) || ['刷新页面', '重试操作'];

  return {
    title: mapping.title,
    description: classifiedError.message || mapping.description,
    userActions,
    iconType: mapping.iconType
  };
}

/**
 * 根据HTTP状态码创建分类错误
 */
export function createErrorFromHttpStatus(
  status: number,
  message?: string,
  requestId?: string
): ClassifiedError {
  let category: ErrorCategory;
  let severity: ErrorSeverity;
  let defaultMessage: string;

  switch (true) {
    case status >= 400 && status < 500:
      // 客户端错误
      category = ErrorCategory.USER_INPUT;
      severity = ErrorSeverity.MEDIUM;

      switch (status) {
        case 400:
          defaultMessage = '请求参数错误';
          break;
        case 401:
          defaultMessage = '身份验证失败，请重新登录';
          break;
        case 403:
          defaultMessage = '权限不足，无法访问';
          break;
        case 404:
          defaultMessage = '请求的资源不存在';
          break;
        case 429:
          defaultMessage = '请求过于频繁，请稍后重试';
          category = ErrorCategory.EXTERNAL_SERVICE;
          break;
        default:
          defaultMessage = '客户端请求错误';
      }
      break;

    case status >= 500 && status < 600:
      // 服务器错误
      category = ErrorCategory.EXTERNAL_SERVICE;
      severity = ErrorSeverity.HIGH;

      switch (status) {
        case 500:
          defaultMessage = '服务器内部错误';
          break;
        case 502:
          defaultMessage = '网关错误，服务暂时不可用';
          break;
        case 503:
          defaultMessage = '服务暂时不可用';
          break;
        case 504:
          defaultMessage = '请求超时，服务器响应缓慢';
          break;
        default:
          defaultMessage = '服务器错误';
      }
      break;

    case status === 0:
      // 网络错误
      category = ErrorCategory.NETWORK;
      severity = ErrorSeverity.HIGH;
      defaultMessage = '网络连接失败';
      break;

    default:
      category = ErrorCategory.UNKNOWN;
      severity = ErrorSeverity.MEDIUM;
      defaultMessage = '未知错误';
  }

  const context: ErrorContext = {
    requestId: requestId || generateRequestId(),
    timestamp: Date.now(),
    metadata: { httpStatus: status }
  };

  return {
    id: generateErrorId(),
    category,
    severity,
    message: message || defaultMessage,
    context,
    recoverable: status < 500 && status !== 401, // 401需要重新登录，5xx可能不可恢复
    timestamp: Date.now(),
    suggestedActions: getSuggestedActionsForHttpStatus(status)
  };
}

/**
 * 根据HTTP状态码获取建议操作
 */
function getSuggestedActionsForHttpStatus(status: number) {
  switch (true) {
    case status === 401:
      return [
        { type: 'logout_login', description: '重新登录', automatic: false },
        { type: 'refresh', description: '刷新页面', automatic: false }
      ];

    case status === 403:
      return [
        { type: 'contact_support', description: '联系管理员', automatic: false },
        { type: 'refresh', description: '刷新页面', automatic: false }
      ];

    case status === 429:
      return [
        {
          type: 'retry',
          description: '稍后重试',
          automatic: true,
          retryConfig: { maxAttempts: 3, delayMs: 5000 }
        }
      ];

    case status >= 500:
      return [
        {
          type: 'retry',
          description: '重试请求',
          automatic: true,
          retryConfig: { maxAttempts: 3, delayMs: 2000, backoffFactor: 2 }
        },
        { type: 'refresh', description: '刷新页面', automatic: false }
      ];

    case status === 0:
      return [
        { type: 'check_connection', description: '检查网络连接', automatic: false },
        { type: 'retry', description: '重试请求', automatic: false }
      ];

    default:
      return [
        { type: 'refresh', description: '刷新页面', automatic: false },
        { type: 'retry', description: '重试操作', automatic: false }
      ];
  }
}

/**
 * 从JavaScript Error对象创建分类错误
 */
export function createErrorFromJsError(
  error: Error,
  context?: Partial<ErrorContext>
): ClassifiedError {
  const message = error.message?.toLowerCase() || '';
  let category: ErrorCategory = ErrorCategory.UNKNOWN;
  let severity: ErrorSeverity = ErrorSeverity.HIGH;

  // 分类错误类型
  if (message.includes('network') || message.includes('fetch')) {
    category = ErrorCategory.NETWORK;
  } else if (message.includes('timeout')) {
    category = ErrorCategory.EXTERNAL_SERVICE;
  } else if (message.includes('permission') || message.includes('access')) {
    category = ErrorCategory.SYSTEM;
  } else if (message.includes('validation') || message.includes('required')) {
    category = ErrorCategory.USER_INPUT;
    severity = ErrorSeverity.MEDIUM;
  } else if (message.includes('config')) {
    category = ErrorCategory.CONFIGURATION;
  }

  const errorContext: ErrorContext = {
    requestId: generateRequestId(),
    timestamp: Date.now(),
    ...context
  };

  return {
    id: generateErrorId(),
    category,
    severity,
    message: error.message || '发生了未知错误',
    originalError: error,
    context: errorContext,
    recoverable: category !== ErrorCategory.SYSTEM,
    timestamp: Date.now(),
    suggestedActions: [
      { type: 'refresh', description: '刷新页面', automatic: false },
      { type: 'retry', description: '重试操作', automatic: false }
    ]
  };
}

/**
 * 格式化错误显示时间
 */
export function formatErrorTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 60000) { // 1分钟内
    return '刚刚';
  } else if (diff < 3600000) { // 1小时内
    return `${Math.floor(diff / 60000)}分钟前`;
  } else if (diff < 86400000) { // 1天��
    return `${Math.floor(diff / 3600000)}小时前`;
  } else {
    return new Date(timestamp).toLocaleString('zh-CN');
  }
}