import React, { useState } from 'react';
import {
  AlertTriangle,
  AlertCircle,
  XCircle,
  Wifi,
  Monitor,
  Info,
  RefreshCw,
  X,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink
} from 'lucide-react';
import {
  ClassifiedError,
  UserFriendlyError,
  ErrorSeverity
} from '../types/errorTypes';
import {
  mapToUserFriendlyError,
  formatErrorTime,
  getSeverityColorClass,
  ERROR_CATEGORY_LABELS,
  ERROR_SEVERITY_LABELS
} from '../utils/errorMapping';

interface ErrorDisplayProps {
  error: ClassifiedError;
  onRetry?: () => void;
  onClose?: () => void;
  showDetails?: boolean;
  compact?: boolean;
  className?: string;
}

/**
 * 错误显示组件
 * 显示用户友好的错误信息和恢复操作
 */
export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({
  error,
  onRetry,
  onClose,
  showDetails = false,
  compact = false,
  className = ''
}) => {
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const userFriendlyError = mapToUserFriendlyError(error);
  const severityColorClass = getSeverityColorClass(error.severity);

  // 获取错误图标
  const getErrorIcon = (iconType: UserFriendlyError['iconType'], severity: ErrorSeverity) => {
    const iconClass = "w-5 h-5";

    switch (iconType) {
      case 'network':
        return <Wifi className={iconClass} />;
      case 'system':
        return <Monitor className={iconClass} />;
      case 'warning':
        return <AlertTriangle className={iconClass} />;
      case 'info':
        return <Info className={iconClass} />;
      case 'error':
      default:
        return severity === ErrorSeverity.CRITICAL
          ? <XCircle className={iconClass} />
          : <AlertCircle className={iconClass} />;
    }
  };

  // 处理重试操作
  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    }
  };

  // 处理刷新页面
  const handleRefresh = () => {
    window.location.reload();
  };

  // 处理联系支持
  const handleContactSupport = () => {
    // 这里可以打开支持页面或发送邮件
    const subject = encodeURIComponent(`错误报告 - ${error.id}`);
    const body = encodeURIComponent(
      `错误ID: ${error.id}\n` +
      `分类: ${ERROR_CATEGORY_LABELS[error.category]}\n` +
      `严重程度: ${ERROR_SEVERITY_LABELS[error.severity]}\n` +
      `错误消息: ${error.message}\n` +
      `发生时间: ${formatErrorTime(error.timestamp)}\n\n` +
      `请描述您执行的操作和遇到的问题...`
    );

    window.open(`mailto:support@mantisbot.com?subject=${subject}&body=${body}`, '_blank');
  };

  // 复制错误信息到剪贴板
  const copyErrorInfo = async () => {
    const errorInfo = `
错误ID: ${error.id}
分类: ${ERROR_CATEGORY_LABELS[error.category]}
严重程度: ${ERROR_SEVERITY_LABELS[error.severity]}
消息: ${error.message}
发生时间: ${formatErrorTime(error.timestamp)}
上下文: ${JSON.stringify(error.context, null, 2)}
${error.originalError ? `原始错误: ${error.originalError.message}` : ''}
${error.originalError?.stack ? `错误堆栈:\n${error.originalError.stack}` : ''}
`.trim();

    try {
      await navigator.clipboard.writeText(errorInfo);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('无法复制到剪贴板:', err);
    }
  };

  // 执行建议的操作
  const executeAction = (actionType: string) => {
    switch (actionType) {
      case 'refresh':
        handleRefresh();
        break;
      case 'retry':
        handleRetry();
        break;
      case 'contact_support':
        handleContactSupport();
        break;
      case 'check_config':
        // 可以导航到设置页面
        console.log('导航到设置页面');
        break;
      default:
        console.log('未知操作类型:', actionType);
    }
  };

  if (compact) {
    return (
      <div className={`flex items-center gap-3 p-3 rounded-lg border ${severityColorClass} ${className}`}>
        {getErrorIcon(userFriendlyError.iconType, error.severity)}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{userFriendlyError.title}</p>
          <p className="text-xs opacity-75 truncate">{userFriendlyError.description}</p>
        </div>
        <div className="flex items-center gap-2">
          {onRetry && (
            <button
              onClick={handleRetry}
              className="p-1.5 hover:bg-black/10 rounded transition-colors"
              title="重试"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-black/10 rounded transition-colors"
              title="关闭"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg border shadow-sm ${className}`}>
      {/* 错���头部 */}
      <div className={`flex items-start gap-4 p-4 rounded-t-lg border ${severityColorClass}`}>
        <div className="flex-shrink-0 mt-0.5">
          {getErrorIcon(userFriendlyError.iconType, error.severity)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {userFriendlyError.title}
              </h3>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                {userFriendlyError.description}
              </p>
            </div>

            {onClose && (
              <button
                onClick={onClose}
                className="flex-shrink-0 p-1 hover:bg-black/10 rounded transition-colors"
                title="关闭"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* 错误元信息 */}
          <div className="mt-3 flex items-center gap-4 text-xs opacity-75">
            <span>错误ID: {error.id}</span>
            <span>分类: {ERROR_CATEGORY_LABELS[error.category]}</span>
            <span>严重程度: {ERROR_SEVERITY_LABELS[error.severity]}</span>
            <span>时间: {formatErrorTime(error.timestamp)}</span>
          </div>
        </div>
      </div>

      {/* 建议操作 */}
      {userFriendlyError.userActions && userFriendlyError.userActions.length > 0 && (
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
            建议操作
          </h4>
          <div className="flex flex-wrap gap-2">
            {userFriendlyError.userActions.map((actionText, index) => {
              // 从动作文本推断动作类型
              const actionType = actionText === '刷新页面' ? 'refresh'
                : actionText === '重试操作' ? 'retry'
                : actionText === '联系技术支持' ? 'contact_support'
                : actionText === '检查配置设置' ? 'check_config'
                : 'custom';

              return (
                <button
                  key={index}
                  onClick={() => executeAction(actionType)}
                  className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors flex items-center gap-1"
                >
                  {actionType === 'refresh' && <RefreshCw className="w-3 h-3" />}
                  {actionType === 'contact_support' && <ExternalLink className="w-3 h-3" />}
                  {actionText}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 错误详情 */}
      {showDetails && (
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setDetailsExpanded(!detailsExpanded)}
            className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-primary-600 transition-colors"
          >
            {detailsExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            技术详情
          </button>

          {detailsExpanded && (
            <div className="mt-3 space-y-3">
              {/* 上下文信息 */}
              <div>
                <h5 className="text-xs font-medium text-gray-900 dark:text-gray-100 mb-1">
                  上下文信息
                </h5>
                <div className="text-xs text-gray-600 dark:text-gray-400 font-mono bg-gray-50 dark:bg-gray-900 p-2 rounded">
                  <div>请求ID: {error.context.requestId}</div>
                  {error.context.sessionId && <div>会话ID: {error.context.sessionId}</div>}
                  {error.context.agentId && <div>代理ID: {error.context.agentId}</div>}
                  {error.context.channelId && <div>频道ID: {error.context.channelId}</div>}
                  <div>时间戳: {new Date(error.context.timestamp).toISOString()}</div>
                </div>
              </div>

              {/* 原始错误信息 */}
              {error.originalError && (
                <div>
                  <h5 className="text-xs font-medium text-gray-900 dark:text-gray-100 mb-1">
                    原始错误
                  </h5>
                  <div className="text-xs text-gray-600 dark:text-gray-400 font-mono bg-gray-50 dark:bg-gray-900 p-2 rounded">
                    <div>名称: {error.originalError.name}</div>
                    <div>消息: {error.originalError.message}</div>
                    {error.originalError.stack && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-primary-600 hover:text-primary-700">
                          显示堆栈跟踪
                        </summary>
                        <pre className="mt-1 whitespace-pre-wrap text-xs">
                          {error.originalError.stack}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              )}

              {/* 元数据 */}
              {error.context.metadata && Object.keys(error.context.metadata).length > 0 && (
                <div>
                  <h5 className="text-xs font-medium text-gray-900 dark:text-gray-100 mb-1">
                    元数据
                  </h5>
                  <div className="text-xs text-gray-600 dark:text-gray-400 font-mono bg-gray-50 dark:bg-gray-900 p-2 rounded">
                    <pre>{JSON.stringify(error.context.metadata, null, 2)}</pre>
                  </div>
                </div>
              )}

              {/* 复制按钮 */}
              <div className="flex justify-end">
                <button
                  onClick={copyErrorInfo}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  <Copy className="w-3 h-3" />
                  {copied ? '已复制' : '复制错误信息'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * 简单的错误提示组件，用于显示简短的错误信息
 */
export const ErrorToast: React.FC<{
  error: ClassifiedError;
  onClose: () => void;
  onRetry?: () => void;
}> = ({ error, onClose, onRetry }) => {
  const userFriendlyError = mapToUserFriendlyError(error);
  const severityColorClass = getSeverityColorClass(error.severity);

  return (
    <div className={`fixed top-4 right-4 max-w-sm p-4 rounded-lg border shadow-lg ${severityColorClass} z-50`}>
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{userFriendlyError.title}</p>
          <p className="text-xs opacity-75 mt-1">{userFriendlyError.description}</p>
        </div>
        <div className="flex items-center gap-1">
          {onRetry && (
            <button
              onClick={onRetry}
              className="p-1 hover:bg-black/10 rounded transition-colors"
              title="重试"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 hover:bg-black/10 rounded transition-colors"
            title="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ErrorDisplay;