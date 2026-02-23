# MantisBot 错误处理 UI 组件

这个文档描述了 MantisBot 前端的错误处理系统，包含用户友好的错误界面组件和处理钩子。

## 组件概览

### 1. 类型定义 (`types/errorTypes.ts`)

定义了与后端一致的错误类型：

- `ErrorCategory`: 错误分类枚举
- `ErrorSeverity`: 错误严重程度枚举
- `ClassifiedError`: 已分类的错误接口
- `UserFriendlyError`: 用户友好的错误信息接口
- `ErrorContext`: 错误上下文信息
- `RecoveryAction`: 恢复操作定义

### 2. 错误映射工具 (`utils/errorMapping.ts`)

提���错误转换和映射功能：

- `generateErrorId()`: 生成唯一错误ID
- `mapToUserFriendlyError()`: 将分类错误转换为用户友好格式
- `createErrorFromHttpStatus()`: 从HTTP状态码创建错误
- `createErrorFromJsError()`: 从JavaScript错误创建分类错误
- `formatErrorTime()`: 格式化错误时间显示

### 3. ErrorBoundary 组件 (`components/ErrorBoundary.tsx`)

React错误边界组件，捕获子组件中的JavaScript错误：

```tsx
import { ErrorBoundary } from '../components/ErrorBoundary';

<ErrorBoundary
  onError={(error) => console.log('捕获到错误:', error)}
  showDetails={true}
>
  <YourComponent />
</ErrorBoundary>
```

**特性**:
- 自动错误分类和严重程度判断
- 生成用户友好的错误消息
- 提供恢复操作���议
- 支持错误详情展开
- 自动报告错误到后端

### 4. ErrorDisplay 组件 (`components/ErrorDisplay.tsx`)

用户友好的错误显示组件：

```tsx
import { ErrorDisplay, ErrorToast } from '../components/ErrorDisplay';

// 完整错误显示
<ErrorDisplay
  error={classifiedError}
  onRetry={() => handleRetry()}
  onClose={() => clearError()}
  showDetails={true}
  compact={false}
/>

// 紧凑错误显示
<ErrorDisplay
  error={classifiedError}
  compact={true}
/>

// Toast 通知
<ErrorToast
  error={classifiedError}
  onClose={() => clearError()}
  onRetry={() => handleRetry()}
/>
```

**特性**:
- 根据错误类型显示不同图标和颜色
- 支持紧凑和完整两种显示模式
- 提供重试、刷新、联系支持等操作按钮
- 可展开技术详情
- 支持复制错误信息到剪贴板

### 5. useErrorHandler 钩子 (`hooks/useErrorHandler.ts`)

统一的错误处理钩子：

```tsx
import { useErrorHandler } from '../hooks/useErrorHandler';

function MyComponent() {
  const {
    errorState,
    handleJsError,
    handleNetworkError,
    handleHttpError,
    setError,
    clearError,
    retry,
    hasError,
    isRetrying
  } = useErrorHandler({
    autoRetryNetwork: true,
    maxRetries: 3,
    onError: (error) => console.log('错误发生:', error),
    onRecovery: (result) => console.log('错误恢复:', result)
  });

  const performOperation = async () => {
    try {
      await someAsyncOperation();
    } catch (error) {
      handleJsError(error);
    }
  };

  return (
    <div>
      {hasError && (
        <ErrorDisplay
          error={errorState.error}
          onRetry={() => retry(performOperation)}
          onClose={clearError}
        />
      )}
    </div>
  );
}
```

### 6. useNetworkErrorHandler 钩子

专门用于网络请求的错误处理：

```tsx
import { useNetworkErrorHandler } from '../hooks/useErrorHandler';

function ApiComponent() {
  const { safeFetch, errorState, clearError } = useNetworkErrorHandler({
    maxRetries: 2,
    autoRetryNetwork: true
  });

  const fetchData = async () => {
    try {
      const response = await safeFetch('/api/data');
      const data = await response.json();
      // 处理成功响应
    } catch (error) {
      // 错误已被自动处理
    }
  };

  return (
    <div>
      {errorState.error && (
        <ErrorDisplay error={errorState.error} onClose={clearError} />
      )}
    </div>
  );
}
```

## 错误分类系统

### 错误类别 (ErrorCategory)

- **BUSINESS**: 业务逻辑错误
- **NETWORK**: 网络连接错误
- **EXTERNAL_SERVICE**: 外部服务错误
- **SYSTEM**: 系统错误
- **USER_INPUT**: 用户输入错误
- **CONFIGURATION**: 配置错误
- **UNKNOWN**: 未知错误

### 错误严重程度 (ErrorSeverity)

- **LOW**: 轻微错误（蓝色）
- **MEDIUM**: 中等错误（黄色）
- **HIGH**: 严重错误（橙色）
- **CRITICAL**: 关键错误（红色）

## 样式设计

组件使用 TailwindCSS 进行样式设计，支持暗色模式：

- 使用语义化的颜色系统
- 响应式设计，适配移动端
- 一致的间距和圆角
- 流畅的动画过渡

## 使用最佳实践

### 1. 错误边界使用

```tsx
// 在应用根部使用全局错误边界
function App() {
  return (
    <ErrorBoundary onError={reportErrorToMonitoring}>
      <Router>
        <Routes>
          {/* 页面路由 */}
        </Routes>
      </Router>
    </ErrorBoundary>
  );
}

// 在重要组件周围使用局部错误边界
function ImportantFeature() {
  return (
    <ErrorBoundary fallback={<FeatureFallback />}>
      <ComplexComponent />
    </ErrorBoundary>
  );
}
```

### 2. 网络请求错误处理

```tsx
// 使用 useNetworkErrorHandler 处理API请求
function useApi() {
  const { safeFetch, errorState } = useNetworkErrorHandler();

  const apiCall = async (endpoint: string, options?: RequestInit) => {
    const response = await safeFetch(endpoint, options);
    return response.json();
  };

  return { apiCall, errorState };
}
```

### 3. 全局错误监听

```tsx
// 在应用入口使用全局错误处理
function App() {
  useGlobalErrorHandler({
    onError: (error) => {
      // 发送��误报告到监控系统
      reportError(error);
    }
  });

  return <AppContent />;
}
```

### 4. 错误恢复策略

```tsx
function DataList() {
  const {
    errorState,
    retry,
    clearError
  } = useErrorHandler({
    onRecovery: (result) => {
      showSuccessMessage('数据加载成功');
    }
  });

  const loadData = async () => {
    try {
      const data = await fetchData();
      setData(data);
      clearError(); // 清除之前的错误
    } catch (error) {
      handleJsError(error);
    }
  };

  return (
    <div>
      {errorState.error && (
        <ErrorDisplay
          error={errorState.error}
          onRetry={() => retry(loadData)}
          onClose={clearError}
        />
      )}
      <DataTable data={data} />
    </div>
  );
}
```

## 国际化支持

组件内置了中文错误消息，支持：

- 错误类别的中文描述
- 用户友好的错误消息
- 恢复操作的中文标签
- 时间格式化的本地化

## 监控集成

错误组件支持与监控系统集成：

```tsx
// 在 ErrorBoundary 中自动报告错误
<ErrorBoundary
  onError={(error) => {
    // 发送到 Sentry
    Sentry.captureException(error.originalError);

    // 发送到自定义监控
    analytics.track('error_occurred', {
      errorId: error.id,
      category: error.category,
      severity: error.severity
    });
  }}
>
  <App />
</ErrorBoundary>
```

## 测试支持

组件提供了完整的测试支持：

```tsx
// 测试错误处理
test('should handle network errors', async () => {
  const { result } = renderHook(() => useNetworkErrorHandler());

  // 模拟网络错误
  const error = new Error('Network failed');
  act(() => {
    result.current.handleNetworkError(error);
  });

  expect(result.current.hasError).toBe(true);
  expect(result.current.errorState.error?.category).toBe(ErrorCategory.NETWORK);
});
```

## 演示和开发

参考 `ErrorHandlingDemo.tsx` 文件查看所有组件的使用示例和交互演示。