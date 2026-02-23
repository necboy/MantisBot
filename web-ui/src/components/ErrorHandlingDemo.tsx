/**
 * 错误处理组件使用示例
 *
 * 本文件展示了如何在 MantisBot 中使用错误处理 UI 组件
 */

import { useState } from 'react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ErrorDisplay, ErrorToast } from '../components/ErrorDisplay';
import { useErrorHandler, useNetworkErrorHandler } from '../hooks/useErrorHandler';
import {
  ClassifiedError,
  ErrorCategory,
  ErrorSeverity
} from '../types/errorTypes';
import {
  createErrorFromHttpStatus,
  generateRequestId
} from '../utils/errorMapping';

/**
 * 组件1: 使用 ErrorBoundary 包装易出错的组件
 */
function ProblematicComponent() {
  const [shouldCrash, setShouldCrash] = useState(false);

  if (shouldCrash) {
    throw new Error('这是一个故意触发的错误，用于演示 ErrorBoundary');
  }

  return (
    <div className="p-4 border rounded">
      <h3>容易出错的组件</h3>
      <button
        onClick={() => setShouldCrash(true)}
        className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
      >
        触发错误
      </button>
    </div>
  );
}

/**
 * 组件2: 使用 useErrorHandler 处理异步操作错误
 */
function AsyncOperationComponent() {
  const {
    errorState,
    clearError,
    retry,
    hasError,
    handleJsError,
    handleNetworkError
  } = useErrorHandler({
    onError: (error) => console.log('错误发生:', error),
    onRecovery: (result) => console.log('错误恢复:', result)
  });

  const [loading, setLoading] = useState(false);

  const performAsyncOperation = async () => {
    setLoading(true);
    try {
      // 模拟可能失败的异步操作
      const shouldFail = Math.random() > 0.5;

      if (shouldFail) {
        throw new Error('模拟的网络请求失败');
      }

      // 成功时清除错误
      clearError();
      alert('操作成功！');
    } catch (error) {
      handleJsError(error as Error, {
        metadata: { operation: 'async_demo', timestamp: Date.now() }
      });
    } finally {
      setLoading(false);
    }
  };

  const simulateNetworkError = () => {
    const networkError = {
      response: { status: 500 },
      message: '服务器内部错误',
      name: 'NetworkError'
    };

    handleNetworkError(networkError, {
      url: '/api/demo',
      method: 'POST'
    });
  };

  return (
    <div className="p-4 border rounded space-y-4">
      <h3>异步操作错误处理</h3>

      <div className="space-x-2">
        <button
          onClick={performAsyncOperation}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? '执行中...' : '执行异步操作'}
        </button>

        <button
          onClick={simulateNetworkError}
          className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700"
        >
          模拟网络错误
        </button>
      </div>

      {hasError && errorState.error && (
        <ErrorDisplay
          error={errorState.error}
          onRetry={() => retry(performAsyncOperation)}
          onClose={clearError}
          showDetails={true}
          className="mt-4"
        />
      )}
    </div>
  );
}

/**
 * 组件3: 使用 useNetworkErrorHandler 处理 API 请求
 */
function ApiRequestComponent() {
  const {
    errorState,
    clearError,
    safeFetch,
    hasError
  } = useNetworkErrorHandler({
    maxRetries: 2,
    autoRetryNetwork: true
  });

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 使用安全的 fetch，会自动处理网络错误
      const response = await safeFetch('/api/demo-data');
      const result = await response.json();
      setData(result);
      clearError();
    } catch (error) {
      // 错误已经被 safeFetch 处理了
      console.error('请求失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const simulateHttpErrors = async (status: number) => {
    setLoading(true);
    try {
      const response = await safeFetch(`/api/error/${status}`);
      const result = await response.json();
      setData(result);
    } catch (error) {
      // 错误已经被处理
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 border rounded space-y-4">
      <h3>API 请求错误处理</h3>

      <div className="space-x-2 flex flex-wrap gap-2">
        <button
          onClick={fetchData}
          disabled={loading}
          className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
        >
          获取数据
        </button>

        <button
          onClick={() => simulateHttpErrors(404)}
          disabled={loading}
          className="px-3 py-1 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50"
        >
          404 错误
        </button>

        <button
          onClick={() => simulateHttpErrors(500)}
          disabled={loading}
          className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
        >
          500 错误
        </button>

        <button
          onClick={() => simulateHttpErrors(429)}
          disabled={loading}
          className="px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
        >
          429 限流
        </button>
      </div>

      {data && (
        <div className="p-3 bg-green-50 border border-green-200 rounded">
          <pre>{JSON.stringify(data, null, 2)}</pre>
        </div>
      )}

      {hasError && errorState.error && (
        <ErrorDisplay
          error={errorState.error}
          onRetry={() => fetchData()}
          onClose={clearError}
          showDetails={true}
          compact={false}
        />
      )}
    </div>
  );
}

/**
 * 组件4: Toast 通知错误示例
 */
function ToastErrorComponent() {
  const [toastError, setToastError] = useState<ClassifiedError | null>(null);

  const showToastError = () => {
    const error = createErrorFromHttpStatus(
      503,
      '服务暂时不可用，请稍后重试',
      generateRequestId()
    );
    setToastError(error);
  };

  return (
    <div className="p-4 border rounded space-y-4">
      <h3>Toast 错误通知</h3>

      <button
        onClick={showToastError}
        className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
      >
        显示 Toast 错误
      </button>

      {toastError && (
        <ErrorToast
          error={toastError}
          onClose={() => setToastError(null)}
          onRetry={() => {
            console.log('重试操作');
            setToastError(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * 主演示组件
 */
export function ErrorHandlingDemo() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">
        MantisBot 错误处理组件演示
      </h1>

      <div className="prose">
        <p>
          此页面演示了 MantisBot 中各种错误处理组件的使用方法，包括：
        </p>
        <ul>
          <li><strong>ErrorBoundary</strong>: 捕获 React 组件错误</li>
          <li><strong>ErrorDisplay</strong>: 显示用户友好的错误界面</li>
          <li><strong>useErrorHandler</strong>: 错误处理钩子</li>
          <li><strong>useNetworkErrorHandler</strong>: 网络错误处理钩子</li>
          <li><strong>ErrorToast</strong>: 错误通知组件</li>
        </ul>
      </div>

      {/* 使用 ErrorBoundary 包装容易出错的组件 */}
      <ErrorBoundary
        onError={(error) => console.log('ErrorBoundary 捕获到错误:', error)}
        showDetails={true}
      >
        <ProblematicComponent />
      </ErrorBoundary>

      <AsyncOperationComponent />
      <ApiRequestComponent />
      <ToastErrorComponent />

      {/* 错误样式演示 */}
      <div className="p-4 border rounded space-y-4">
        <h3>错误显示样式演示</h3>

        <div className="space-y-4">
          {/* 不同严重程度的错误演示 */}
          {[
            {
              severity: ErrorSeverity.LOW,
              category: ErrorCategory.USER_INPUT,
              message: '输入格式不正确，请检查后重试'
            },
            {
              severity: ErrorSeverity.MEDIUM,
              category: ErrorCategory.NETWORK,
              message: '网络连接不稳定，请检查网络状态'
            },
            {
              severity: ErrorSeverity.HIGH,
              category: ErrorCategory.EXTERNAL_SERVICE,
              message: '服务暂时不可用，我们正在努力修复'
            },
            {
              severity: ErrorSeverity.CRITICAL,
              category: ErrorCategory.SYSTEM,
              message: '系统遇到严重问题，请联系技术支持'
            }
          ].map((errorConfig, index) => {
            const mockError: ClassifiedError = {
              id: `demo-error-${index}`,
              category: errorConfig.category,
              severity: errorConfig.severity,
              message: errorConfig.message,
              context: {
                requestId: generateRequestId(),
                timestamp: Date.now()
              },
              recoverable: true,
              timestamp: Date.now(),
              suggestedActions: [
                { type: 'refresh', description: '刷新页面', automatic: false },
                { type: 'retry', description: '重试操作', automatic: false }
              ]
            };

            return (
              <ErrorDisplay
                key={index}
                error={mockError}
                compact={index % 2 === 0} // 交替显示紧凑和完整模式
                showDetails={index > 1} // 后两个显示详情
                onRetry={() => console.log('重试:', errorConfig.category)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default ErrorHandlingDemo;