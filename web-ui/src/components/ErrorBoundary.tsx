import { Component, ErrorInfo, ReactNode } from 'react';
import { ErrorDisplay } from './ErrorDisplay';
import { ClassifiedError, ErrorCategory, ErrorSeverity } from '../types/errorTypes';
import { generateErrorId } from '../utils/errorMapping';

interface ErrorBoundaryState {
  hasError: boolean;
  classifiedError: ClassifiedError | null;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: ClassifiedError) => void;
  showDetails?: boolean;
}

/**
 * React 错误边界组件
 * 捕获子组件中的 JavaScript 错误，并显示友好的错误界面
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      classifiedError: null
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // 将原生错误转换为分类错误
    const classifiedError: ClassifiedError = {
      id: generateErrorId(),
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.HIGH,
      message: error.message || '发生了未知错误',
      originalError: error,
      context: {
        requestId: generateErrorId(),
        timestamp: Date.now()
      },
      recoverable: true,
      timestamp: Date.now(),
      suggestedActions: [
        {
          type: 'refresh',
          description: '刷新页面',
          automatic: false
        },
        {
          type: 'reload',
          description: '重新加载应用',
          automatic: false
        }
      ]
    };

    return {
      hasError: true,
      classifiedError
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // 记录错误到控制台
    console.error('ErrorBoundary 捕获到错误:', error);
    console.error('错误组件栈:', errorInfo.componentStack);

    // 分类错误
    const category = this.classifyError(error);
    const severity = this.determineSeverity(error);

    const classifiedError: ClassifiedError = {
      id: generateErrorId(),
      category,
      severity,
      message: error.message || '发生了未知错误',
      originalError: error,
      context: {
        requestId: generateErrorId(),
        timestamp: Date.now(),
        metadata: {
          componentStack: errorInfo.componentStack,
          errorStack: error.stack
        }
      },
      recoverable: this.isRecoverable(category),
      timestamp: Date.now(),
      suggestedActions: this.getSuggestedActions(category),
      data: {
        errorInfo
      }
    };

    this.setState({ classifiedError });

    // 调用外部错误处理器
    if (this.props.onError) {
      this.props.onError(classifiedError);
    }

    // 报告错误到监控系统（如果配置）
    this.reportError(classifiedError);
  }

  /**
   * 根据错误类型分类
   */
  private classifyError(error: Error): ErrorCategory {
    const message = error.message?.toLowerCase() || '';
    const stack = error.stack?.toLowerCase() || '';

    // 网络错误
    if (message.includes('network') || message.includes('fetch') ||
        message.includes('connection') || message.includes('timeout')) {
      return ErrorCategory.NETWORK;
    }

    // 用户输入错误
    if (message.includes('validation') || message.includes('invalid input') ||
        message.includes('required field')) {
      return ErrorCategory.USER_INPUT;
    }

    // 系统错误
    if (message.includes('permission') || message.includes('access denied') ||
        message.includes('memory') || message.includes('disk')) {
      return ErrorCategory.SYSTEM;
    }

    // 配置错误
    if (message.includes('config') || message.includes('environment') ||
        message.includes('missing key')) {
      return ErrorCategory.CONFIGURATION;
    }

    // 外部服务错误
    if (message.includes('api') || message.includes('service') ||
        message.includes('server') || stack.includes('axios') || stack.includes('fetch')) {
      return ErrorCategory.EXTERNAL_SERVICE;
    }

    return ErrorCategory.UNKNOWN;
  }

  /**
   * 确定错误严重程度
   */
  private determineSeverity(error: Error): ErrorSeverity {
    const message = error.message?.toLowerCase() || '';

    if (message.includes('critical') || message.includes('fatal') ||
        message.includes('cannot continue')) {
      return ErrorSeverity.CRITICAL;
    }

    if (message.includes('warning') || message.includes('minor')) {
      return ErrorSeverity.LOW;
    }

    if (message.includes('validation') || message.includes('user input')) {
      return ErrorSeverity.MEDIUM;
    }

    // 默认为高严重程度，因为这是在 ErrorBoundary 中捕获的未处理错误
    return ErrorSeverity.HIGH;
  }

  /**
   * 判断错误是否可恢复
   */
  private isRecoverable(category: ErrorCategory): boolean {
    switch (category) {
      case ErrorCategory.NETWORK:
      case ErrorCategory.EXTERNAL_SERVICE:
      case ErrorCategory.USER_INPUT:
        return true;
      case ErrorCategory.SYSTEM:
      case ErrorCategory.CONFIGURATION:
        return false;
      case ErrorCategory.UNKNOWN:
      case ErrorCategory.BUSINESS:
      default:
        return true; // 保守估计，认为可恢复
    }
  }

  /**
   * 获取建议的恢复操作
   */
  private getSuggestedActions(category: ErrorCategory) {
    const commonActions = [
      {
        type: 'refresh',
        description: '刷新页面',
        automatic: false
      },
      {
        type: 'retry',
        description: '重试操作',
        automatic: false,
        retryConfig: {
          maxAttempts: 3,
          delayMs: 1000
        }
      }
    ];

    switch (category) {
      case ErrorCategory.NETWORK:
      case ErrorCategory.EXTERNAL_SERVICE:
        return [
          {
            type: 'check_connection',
            description: '检查��络连接',
            automatic: false
          },
          ...commonActions
        ];

      case ErrorCategory.USER_INPUT:
        return [
          {
            type: 'validate_input',
            description: '检查输入内容',
            automatic: false
          },
          ...commonActions
        ];

      case ErrorCategory.CONFIGURATION:
        return [
          {
            type: 'check_config',
            description: '检查配置设置',
            automatic: false
          },
          {
            type: 'contact_support',
            description: '联系技术支持',
            automatic: false
          }
        ];

      default:
        return commonActions;
    }
  }

  /**
   * 报告错误到监控系统
   */
  private reportError(classifiedError: ClassifiedError) {
    try {
      // 这里可以集成错误监控服务，如 Sentry、Bugsnag 等
      // 目前只是记录到控制台
      console.group('🚨 错误报告');
      console.log('错误ID:', classifiedError.id);
      console.log('类别:', classifiedError.category);
      console.log('严重程度:', classifiedError.severity);
      console.log('消息:', classifiedError.message);
      console.log('上下文:', classifiedError.context);
      console.log('建议操作:', classifiedError.suggestedActions);
      console.groupEnd();

      // 发送到后端记录
      fetch('/api/errors/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          errorId: classifiedError.id,
          category: classifiedError.category,
          severity: classifiedError.severity,
          message: classifiedError.message,
          context: classifiedError.context,
          timestamp: classifiedError.timestamp
        })
      }).catch(err => {
        console.warn('无法发送错误报告到后端:', err);
      });
    } catch (err) {
      console.warn('错误报告失败:', err);
    }
  }

  /**
   * 重置错误状态，允许用户重试
   */
  public resetError = () => {
    this.setState({
      hasError: false,
      classifiedError: null
    });
  };

  render() {
    if (this.state.hasError && this.state.classifiedError) {
      // 如果提供了自定义 fallback，使用它
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // 否则显示默认错误界面
      return (
        <ErrorDisplay
          error={this.state.classifiedError}
          onRetry={this.resetError}
          showDetails={this.props.showDetails}
        />
      );
    }

    return this.props.children;
  }
}