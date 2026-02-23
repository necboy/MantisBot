/**
 * Error Classifier for MantisBot
 *
 * Intelligent error classification system that automatically categorizes errors
 * based on error messages, context, and patterns. Provides user-friendly messages
 * and suggests appropriate recovery actions.
 *
 * @author MantisBot Team
 * @version 1.0.0
 */

import {
  ErrorCategory,
  ErrorSeverity,
  type ErrorContext,
  type ClassifiedError,
  type RecoveryAction,
  type RetryConfig,
  generateErrorId
} from './types.js';

/**
 * Intelligent error classifier that analyzes errors and provides
 * categorization, user-friendly messages, and recovery actions
 */
export class ErrorClassifier {
  /**
   * Classify an error based on its message and context
   *
   * @param error - The error to classify
   * @param context - Context information about where the error occurred
   * @returns Classified error with category, severity, and recovery actions
   */
  classify(error: Error, context: ErrorContext): ClassifiedError {
    const errorMessage = error.message.toLowerCase();
    const component = context.metadata?.component?.toLowerCase() || '';

    // Categorize the error based on patterns and context
    const category = this.categorizeError(errorMessage, component);

    // Determine severity (may be adjusted based on component)
    let severity = this.determineSeverity(category, errorMessage);
    severity = this.adjustSeverityForComponent(severity, component);

    // Check if error is retryable
    const recoverable = this.isRetryable(category, errorMessage);

    // Generate user-friendly message
    const userMessage = this.generateUserMessage(category);

    // Generate recovery actions
    const suggestedActions = this.generateRecoveryActions(category, recoverable);

    return {
      id: generateErrorId(),
      category,
      severity,
      message: userMessage,
      originalError: error,
      context,
      suggestedActions,
      recoverable,
      timestamp: Date.now(),
      data: {
        originalMessage: error.message,
        component
      }
    };
  }

  /**
   * Categorize error based on error message patterns and component context
   */
  private categorizeError(errorMessage: string, component: string): ErrorCategory {
    // Network error patterns
    const networkPatterns = [
      'connection refused',
      'econnrefused',
      'timeout',
      'enotfound',
      'econnreset',
      'socket hang up',
      'network error',
      'connection error'
    ];

    // LLM service error patterns
    const llmServicePatterns = [
      'rate limit',
      'rate-limit',
      '429',
      'too many requests',
      'service unavailable',
      'server error',
      '500',
      '502',
      '503',
      '504',
      'gateway timeout',
      'bad gateway'
    ];

    // LLM component names
    const llmComponents = ['llm', 'openai', 'anthropic', 'claude', 'gpt'];

    // User input error patterns
    const userInputPatterns = [
      'invalid json',
      'parse error',
      'validation error',
      'invalid format',
      'invalid input',
      'malformed',
      'syntax error'
    ];

    // System error patterns
    const systemPatterns = [
      'out of memory',
      'enomem',
      'disk full',
      'enospc',
      'permission denied',
      'eacces',
      'file not found',
      'enoent',
      'resource unavailable'
    ];

    // Configuration error patterns
    const configPatterns = [
      'config not found',
      'configuration error',
      'invalid api key',
      'authentication failed',
      'authorization failed',
      'invalid token',
      'missing configuration',
      'config file not found'
    ];

    // Check patterns in order of specificity (component context first)
    // LLM component takes precedence over message patterns for API/auth errors
    if (llmComponents.some(comp => component.includes(comp))) {
      return ErrorCategory.EXTERNAL_SERVICE;
    }

    if (configPatterns.some(pattern => errorMessage.includes(pattern))) {
      return ErrorCategory.CONFIGURATION;
    }

    if (networkPatterns.some(pattern => errorMessage.includes(pattern))) {
      return ErrorCategory.NETWORK;
    }

    if (llmServicePatterns.some(pattern => errorMessage.includes(pattern))) {
      return ErrorCategory.EXTERNAL_SERVICE;
    }

    if (userInputPatterns.some(pattern => errorMessage.includes(pattern))) {
      return ErrorCategory.USER_INPUT;
    }

    if (systemPatterns.some(pattern => errorMessage.includes(pattern))) {
      return ErrorCategory.SYSTEM;
    }

    return ErrorCategory.UNKNOWN;
  }

  /**
   * Determine the base severity level for an error category
   */
  private determineSeverity(category: ErrorCategory, errorMessage: string): ErrorSeverity {
    switch (category) {
      case ErrorCategory.NETWORK:
      case ErrorCategory.EXTERNAL_SERVICE:
        return ErrorSeverity.MEDIUM;

      case ErrorCategory.USER_INPUT:
        return ErrorSeverity.LOW;

      case ErrorCategory.SYSTEM:
      case ErrorCategory.CONFIGURATION:
        return ErrorSeverity.HIGH;

      case ErrorCategory.BUSINESS:
        // Analyze message for business criticality indicators
        if (errorMessage.includes('critical') || errorMessage.includes('fatal')) {
          return ErrorSeverity.CRITICAL;
        }
        return ErrorSeverity.MEDIUM;

      case ErrorCategory.UNKNOWN:
      default:
        return ErrorSeverity.MEDIUM;
    }
  }

  /**
   * Adjust severity based on the component where the error occurred
   */
  private adjustSeverityForComponent(baseSeverity: ErrorSeverity, component: string): ErrorSeverity {
    // Critical components that should have elevated severity
    const criticalComponents = ['agent-runner', 'llm-client', 'channel'];

    if (criticalComponents.some(comp => component.includes(comp))) {
      // Upgrade severity by one level (but not beyond CRITICAL)
      switch (baseSeverity) {
        case ErrorSeverity.LOW:
          return ErrorSeverity.MEDIUM;
        case ErrorSeverity.MEDIUM:
          return ErrorSeverity.HIGH;
        case ErrorSeverity.HIGH:
          return ErrorSeverity.CRITICAL;
        default:
          return baseSeverity;
      }
    }

    return baseSeverity;
  }

  /**
   * Determine if an error is potentially recoverable through retry or other actions
   */
  private isRetryable(category: ErrorCategory, errorMessage: string): boolean {
    switch (category) {
      case ErrorCategory.NETWORK:
      case ErrorCategory.EXTERNAL_SERVICE:
      case ErrorCategory.SYSTEM:
        // Most network, service, and system errors are retryable
        return true;

      case ErrorCategory.USER_INPUT:
      case ErrorCategory.CONFIGURATION:
        // These require manual intervention
        return false;

      case ErrorCategory.BUSINESS:
        // Depends on the specific business logic
        return !errorMessage.includes('permanent') && !errorMessage.includes('invalid');

      case ErrorCategory.UNKNOWN:
      default:
        // Be conservative with unknown errors
        return false;
    }
  }

  /**
   * Generate user-friendly error messages for different categories
   */
  private generateUserMessage(category: ErrorCategory): string {
    switch (category) {
      case ErrorCategory.NETWORK:
        return '网络连接出现问题，请检查网络设置后重试。';

      case ErrorCategory.EXTERNAL_SERVICE:
        return 'AI 服务暂时不可用，请稍后重试。';

      case ErrorCategory.USER_INPUT:
        return '输入格式不正确，请检查后重新输入。';

      case ErrorCategory.SYSTEM:
        return '系统正在处理中，请稍候片刻。';

      case ErrorCategory.CONFIGURATION:
        return '系统配置有误，请联系管理员。';

      case ErrorCategory.BUSINESS:
        return '处理过程中遇到问题，正在尝试解决。';

      case ErrorCategory.UNKNOWN:
      default:
        return '未知错误，请稍后重试或联系技术支持。';
    }
  }

  /**
   * Generate appropriate recovery actions for different error categories
   */
  private generateRecoveryActions(category: ErrorCategory, recoverable: boolean): RecoveryAction[] {
    const actions: RecoveryAction[] = [];

    switch (category) {
      case ErrorCategory.NETWORK:
        if (recoverable) {
          actions.push({
            type: 'retry',
            description: '自动重试网络连接',
            automatic: true,
            retryConfig: {
              maxAttempts: 3,
              delayMs: 1000,
              backoffFactor: 1.5,
              maxDelayMs: 5000
            }
          });
        }
        actions.push({
          type: 'check-network',
          description: '检查网络连接设置',
          automatic: false,
          parameters: {
            checkList: ['网络连接', 'DNS 设置', '防火墙配置']
          }
        });
        break;

      case ErrorCategory.EXTERNAL_SERVICE:
        if (recoverable) {
          actions.push({
            type: 'exponential-backoff-retry',
            description: '使用指数退避重试策略',
            automatic: true,
            retryConfig: {
              maxAttempts: 5,
              delayMs: 2000,
              backoffFactor: 2,
              maxDelayMs: 30000
            }
          });
          actions.push({
            type: 'switch-model',
            description: '切换到备用 AI 模型',
            automatic: false,
            parameters: {
              fallbackModels: ['claude', 'gpt-4', 'local-model']
            }
          });
        }
        break;

      case ErrorCategory.USER_INPUT:
        actions.push({
          type: 'fix-input',
          description: '修正输入格式并重新提交',
          automatic: false,
          parameters: {
            inputValidation: true,
            formatExample: true
          }
        });
        break;

      case ErrorCategory.SYSTEM:
        if (recoverable) {
          actions.push({
            type: 'delayed-retry',
            description: '延迟重试以等待系统资源释放',
            automatic: true,
            retryConfig: {
              maxAttempts: 3,
              delayMs: 5000,
              backoffFactor: 2,
              maxDelayMs: 30000
            }
          });
        }
        actions.push({
          type: 'admin-check-resources',
          description: '检查系统资源使用情况',
          automatic: false,
          parameters: {
            checkItems: ['内存使用', '磁盘空间', 'CPU 负载', '文件权限']
          }
        });
        break;

      case ErrorCategory.CONFIGURATION:
        actions.push({
          type: 'admin-check-config',
          description: '检查和修复系统配置',
          automatic: false,
          parameters: {
            configFiles: ['config.json', 'environment variables', 'API keys']
          }
        });
        break;

      case ErrorCategory.BUSINESS:
        if (recoverable) {
          actions.push({
            type: 'business-retry',
            description: '重新执行业务逻辑',
            automatic: true,
            retryConfig: {
              maxAttempts: 2,
              delayMs: 1000,
              backoffFactor: 1,
              maxDelayMs: 5000
            }
          });
        }
        actions.push({
          type: 'escalate-support',
          description: '升级到技术支持团队',
          automatic: false
        });
        break;

      case ErrorCategory.UNKNOWN:
      default:
        actions.push({
          type: 'log-and-notify',
          description: '记录错误并通知管理员',
          automatic: true
        });
        break;
    }

    return actions;
  }
}