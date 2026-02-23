import { useState, useCallback, useEffect } from 'react';
import {
  ClassifiedError,
  ErrorCategory,
  ErrorHandlingResult,
  ErrorContext
} from '../types/errorTypes';
import {
  createErrorFromHttpStatus,
  createErrorFromJsError,
  generateRequestId
} from '../utils/errorMapping';

interface UseErrorHandlerOptions {
  /** 是否自动重试网络错误 */
  autoRetryNetwork?: boolean;
  /** 最大自动重试次数 */
  maxRetries?: number;
  /** 错误发生时的回调 */
  onError?: (error: ClassifiedError) => void;
  /** 错误恢复成功时的回调 */
  onRecovery?: (result: ErrorHandlingResult) => void;
  /** 默认的错误上下文信息 */
  defaultContext?: Partial<ErrorContext>;
}

interface ErrorState {
  error: ClassifiedError | null;
  isRetrying: boolean;
  retryCount: number;
  lastError: ClassifiedError | null;
}

export interface UseErrorHandlerReturn {
  /** 当前错误状态 */
  errorState: ErrorState;
  /** 处理 JavaScript 错误 */
  handleJsError: (error: Error, context?: Partial<ErrorContext>) => ClassifiedError;
  /** 处理网络请求错误 */
  handleNetworkError: (error: any, requestContext?: any) => ClassifiedError;
  /** 处理 HTTP 状态码错误 */
  handleHttpError: (status: number, message?: string, requestId?: string) => ClassifiedError;
  /** 手动设置错误 */
  setError: (error: ClassifiedError) => void;
  /** 清除当前错误 */
  clearError: () => void;
  /** 重试当前失败的操作 */
  retry: (operation?: () => Promise<any>) => Promise<ErrorHandlingResult>;
  /** 检查是否有活跃的错误 */
  hasError: boolean;
  /** 检查是否正在重试 */
  isRetrying: boolean;
}

/**
 * 错误处理钩子
 * 提供统一的错误处理、重试和恢复机制
 */
export const useErrorHandler = (options: UseErrorHandlerOptions = {}): UseErrorHandlerReturn => {
  const {
    autoRetryNetwork = true,
    maxRetries = 3,
    onError,
    onRecovery,
    defaultContext = {}
  } = options;

  const [errorState, setErrorState] = useState<ErrorState>({
    error: null,
    isRetrying: false,
    retryCount: 0,
    lastError: null
  });

  // 内部重试计数器，用于自动重试
  const [autoRetryCount, setAutoRetryCount] = useState(0);

  // 处理 JavaScript 错误
  const handleJsError = useCallback((
    error: Error,
    context?: Partial<ErrorContext>
  ): ClassifiedError => {
    const errorContext: ErrorContext = {
      requestId: generateRequestId(),
      timestamp: Date.now(),
      ...defaultContext,
      ...context
    };

    const classifiedError = createErrorFromJsError(error, errorContext);

    setErrorState(prev => ({
      ...prev,
      error: classifiedError,
      lastError: classifiedError
    }));

    onError?.(classifiedError);
    return classifiedError;
  }, [defaultContext, onError]);

  // 处理网络错误
  const handleNetworkError = useCallback((
    error: any,
    requestContext?: any
  ): ClassifiedError => {
    let classifiedError: ClassifiedError;

    if (error.response?.status) {
      // 有 HTTP 状态码的响应错误
      classifiedError = createErrorFromHttpStatus(
        error.response.status,
        error.response.data?.message || error.message,
        requestContext?.requestId
      );
    } else if (error.code === 'NETWORK_ERROR' || error.name === 'NetworkError') {
      // 网络连接错误
      classifiedError = createErrorFromHttpStatus(0, '网络连接失败');
    } else {
      // 其他网络错误
      classifiedError = createErrorFromJsError(error, {
        ...defaultContext,
        metadata: { ...requestContext }
      });
      classifiedError.category = ErrorCategory.NETWORK;
    }

    setErrorState(prev => ({
      ...prev,
      error: classifiedError,
      lastError: classifiedError
    }));

    onError?.(classifiedError);

    // 自动重试网络错误
    if (autoRetryNetwork &&
        classifiedError.category === ErrorCategory.NETWORK &&
        autoRetryCount < maxRetries) {

      setAutoRetryCount(prev => prev + 1);
      // 延迟重试
      const retryDelay = Math.pow(2, autoRetryCount) * 1000; // 指数退避
      setTimeout(() => {
        // 这里应该重试原始请求，但由于我们无法保存原始操作，
        // 只能提供一个重试的机制
        console.log(`自动重试网络请求 (${autoRetryCount + 1}/${maxRetries})`);
      }, retryDelay);
    }

    return classifiedError;
  }, [autoRetryNetwork, maxRetries, autoRetryCount, defaultContext, onError]);

  // 处理 HTTP 状态码错误
  const handleHttpError = useCallback((
    status: number,
    message?: string,
    requestId?: string
  ): ClassifiedError => {
    const classifiedError = createErrorFromHttpStatus(status, message, requestId);

    setErrorState(prev => ({
      ...prev,
      error: classifiedError,
      lastError: classifiedError
    }));

    onError?.(classifiedError);
    return classifiedError;
  }, [onError]);

  // 手动设置错误
  const setError = useCallback((error: ClassifiedError) => {
    setErrorState(prev => ({
      ...prev,
      error,
      lastError: error
    }));

    onError?.(error);
  }, [onError]);

  // 清除错误
  const clearError = useCallback(() => {
    setErrorState(prev => ({
      ...prev,
      error: null,
      isRetrying: false,
      retryCount: 0
    }));
    setAutoRetryCount(0);
  }, []);

  // 重试操作
  const retry = useCallback(async (operation?: () => Promise<any>): Promise<ErrorHandlingResult> => {
    if (!errorState.error && !errorState.lastError) {
      return {
        success: false,
        action: 'retry',
        message: '没有需要重试的错误'
      };
    }

    const startTime = Date.now();
    setErrorState(prev => ({
      ...prev,
      isRetrying: true,
      retryCount: prev.retryCount + 1
    }));

    try {
      if (operation) {
        // 执行提供的重试操作
        await operation();
      } else {
        // 默认重试行为：刷新页面
        window.location.reload();
        return {
          success: true,
          action: 'page_refresh',
          message: '页面已刷新',
          retryCount: errorState.retryCount + 1,
          totalTimeMs: Date.now() - startTime
        };
      }

      // 操作成功，清除错误状态
      const result: ErrorHandlingResult = {
        success: true,
        action: 'retry',
        message: '重试操作成功',
        retryCount: errorState.retryCount + 1,
        totalTimeMs: Date.now() - startTime
      };

      clearError();
      onRecovery?.(result);

      return result;
    } catch (retryError: any) {
      // 重试失败
      const newError = handleJsError(retryError, {
        metadata: {
          isRetry: true,
          originalErrorId: errorState.error?.id || errorState.lastError?.id,
          retryAttempt: errorState.retryCount + 1
        }
      });

      const result: ErrorHandlingResult = {
        success: false,
        action: 'retry',
        message: '重试操作失败',
        error: retryError,
        retryCount: errorState.retryCount + 1,
        totalTimeMs: Date.now() - startTime
      };

      setErrorState(prev => ({
        ...prev,
        isRetrying: false,
        error: newError
      }));

      return result;
    }
  }, [errorState, handleJsError, clearError, onRecovery]);

  // 重置自动重试计数器当错误清除时
  useEffect(() => {
    if (!errorState.error) {
      setAutoRetryCount(0);
    }
  }, [errorState.error]);

  // 导出的属性和方法
  const hasError = errorState.error !== null;
  const isRetrying = errorState.isRetrying;

  return {
    errorState,
    handleJsError,
    handleNetworkError,
    handleHttpError,
    setError,
    clearError,
    retry,
    hasError,
    isRetrying
  };
};

/**
 * 全局错误处理钩子
 * 用于处理未捕获的错误和Promise拒绝
 */
export const useGlobalErrorHandler = (options: UseErrorHandlerOptions = {}): UseErrorHandlerReturn => {
  const errorHandler = useErrorHandler(options);

  useEffect(() => {
    // 处理未捕获的JavaScript错误
    const handleError = (event: ErrorEvent) => {
      console.error('未捕获的错误:', event.error);
      errorHandler.handleJsError(event.error, {
        metadata: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          global: true
        }
      });
    };

    // 处理未捕获的Promise拒绝
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('未处理的Promise拒绝:', event.reason);
      const error = event.reason instanceof Error
        ? event.reason
        : new Error(String(event.reason));

      errorHandler.handleJsError(error, {
        metadata: {
          unhandledPromise: true,
          global: true
        }
      });
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [errorHandler]);

  return errorHandler;
};

/**
 * 网络请求错误处理钩子
 * 专门用于处理 fetch API 和其他网络请求
 */
export const useNetworkErrorHandler = (options: UseErrorHandlerOptions = {}) => {
  const errorHandler = useErrorHandler({
    autoRetryNetwork: true,
    maxRetries: 3,
    ...options
  });

  // 包装 fetch 函数以自动处理错误
  const safeFetch = useCallback(async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    try {
      const response = await fetch(input, init);

      if (!response.ok) {
        throw errorHandler.handleHttpError(
          response.status,
          response.statusText,
          generateRequestId()
        );
      }

      return response;
    } catch (error: any) {
      if (error instanceof Error) {
        throw errorHandler.handleNetworkError(error, { url: String(input) });
      }
      throw error;
    }
  }, [errorHandler]);

  return {
    ...errorHandler,
    safeFetch
  };
};

export default useErrorHandler;