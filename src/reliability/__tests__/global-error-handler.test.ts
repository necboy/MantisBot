/**
 * Tests for GlobalErrorHandler
 *
 * Tests the integration of ErrorClassifier, CircuitBreaker, and RetryManager
 * into a unified error handling interface.
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { GlobalErrorHandler } from '../global-error-handler.js';
import { ErrorClassifier } from '../error-classifier.js';
import { CircuitBreaker, CircuitBreakerOpenError } from '../circuit-breaker.js';
import { RetryManager } from '../retry-manager.js';
import {
  ErrorCategory,
  ErrorSeverity,
  type ErrorContext,
  type ClassifiedError,
  generateRequestId
} from '../types.js';

describe('GlobalErrorHandler', () => {
  let classifier: any;
  let circuitBreaker: any;
  let retryManager: any;
  let globalHandler: GlobalErrorHandler;

  const mockContext: ErrorContext = {
    requestId: generateRequestId(),
    sessionId: 'test-session',
    agentId: 'test-agent',
    channelId: 'test-channel',
    timestamp: Date.now(),
    metadata: { component: 'test' }
  };

  const createMockClassifiedError = (category: ErrorCategory = ErrorCategory.NETWORK): ClassifiedError => ({
    id: 'err-test-123',
    category,
    severity: ErrorSeverity.MEDIUM,
    message: '网络连接出现问题，请检查网络设置后重试。',
    originalError: new Error('Original network error'),
    context: mockContext,
    recoverable: true,
    timestamp: Date.now(),
    suggestedActions: [{
      type: 'retry',
      description: '自动重试网络连接',
      automatic: true,
      retryConfig: {
        maxAttempts: 3,
        delayMs: 1000,
        backoffFactor: 1.5,
        maxDelayMs: 5000
      }
    }]
  });

  beforeEach(() => {
    // Create mocked dependencies
    classifier = {
      classify: vi.fn()
    };

    circuitBreaker = {
      shouldReject: vi.fn(),
      recordSuccess: vi.fn(),
      recordFailure: vi.fn(),
      reset: vi.fn(),
      resetAll: vi.fn(),
      getAllStates: vi.fn(),
      getStats: vi.fn()
    };

    retryManager = {
      executeWithRetry: vi.fn()
    };

    // Create global handler with mocked dependencies
    globalHandler = new GlobalErrorHandler(
      classifier,
      circuitBreaker,
      retryManager,
      {
        retryEnabled: true,
        circuitBreakerEnabled: true,
        reportingEnabled: true
      }
    );
  });

  describe('constructor', () => {
    it('should create handler with default configuration', () => {
      const handler = new GlobalErrorHandler(classifier, circuitBreaker, retryManager);
      expect(handler).toBeInstanceOf(GlobalErrorHandler);
    });

    it('should accept partial configuration', () => {
      const handler = new GlobalErrorHandler(
        classifier,
        circuitBreaker,
        retryManager,
        { retryEnabled: false }
      );
      expect(handler).toBeInstanceOf(GlobalErrorHandler);
    });
  });

  describe('handleError', () => {
    it('should handle successful operation without retries', async () => {
      const mockOperation = vi.fn().mockResolvedValue('success');

      // Circuit breaker allows request
      circuitBreaker.shouldReject.mockReturnValue(false);

      const result = await globalHandler.handleError(mockOperation, mockContext);

      expect(result.success).toBe(true);
      expect(result.action).toBe('operation_completed');
      expect(result.retryCount).toBe(0);
      expect(circuitBreaker.shouldReject).toHaveBeenCalledWith(ErrorCategory.UNKNOWN);
      expect(circuitBreaker.recordSuccess).toHaveBeenCalledWith(ErrorCategory.UNKNOWN);
      // retryManager.executeWithRetry should NOT be called if operation succeeds on first attempt
      expect(retryManager.executeWithRetry).not.toHaveBeenCalled();
    });

    it('should handle circuit breaker rejection', async () => {
      const mockOperation = vi.fn().mockResolvedValue('success');

      // Circuit breaker rejects request
      circuitBreaker.shouldReject.mockReturnValue(true);

      const result = await globalHandler.handleError(mockOperation, mockContext);

      expect(result.success).toBe(false);
      expect(result.action).toBe('circuit_breaker_open');
      expect(result.message).toContain('circuit breaker is open');
      expect(mockOperation).not.toHaveBeenCalled();
      expect(retryManager.executeWithRetry).not.toHaveBeenCalled();
    });

    it('should classify errors and use appropriate retry configuration', async () => {
      const originalError = new Error('Network connection failed');
      const mockOperation = vi.fn().mockRejectedValue(originalError);
      const classifiedError = createMockClassifiedError(ErrorCategory.NETWORK);

      // Circuit breaker allows request
      circuitBreaker.shouldReject.mockReturnValue(false);

      // Classifier returns network error
      classifier.classify.mockReturnValue(classifiedError);

      // Retry manager fails after retries - mock the execute function properly
      retryManager.executeWithRetry.mockImplementation(async (operation) => {
        // This should trigger the classify call
        try {
          await operation();
          return {
            success: true,
            action: 'operation_completed',
            message: 'Operation completed successfully',
            retryCount: 0,
            totalTimeMs: 100
          };
        } catch (error) {
          return {
            success: false,
            action: 'max_attempts_exceeded',
            message: 'Operation failed after 3 attempts: Network connection failed',
            error: error as Error,
            retryCount: 3,
            totalTimeMs: 5000
          };
        }
      });

      const result = await globalHandler.handleError(
        mockOperation,
        mockContext,
        { operationName: 'network-api-call' }
      );

      expect(classifier.classify).toHaveBeenCalledWith(originalError, mockContext);
      expect(circuitBreaker.shouldReject).toHaveBeenCalledWith(ErrorCategory.NETWORK);
      expect(circuitBreaker.recordFailure).toHaveBeenCalledWith(ErrorCategory.NETWORK);
      expect(result.success).toBe(false);
      expect(result.action).toBe('max_attempts_exceeded');
      expect(result.retryCount).toBe(3);
    });

    it('should handle operation success after retries', async () => {
      const originalError = new Error('Temporary failure');
      let callCount = 0;
      const mockOperation = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          throw originalError;
        }
        return Promise.resolve('success');
      });

      const classifiedError = createMockClassifiedError(ErrorCategory.EXTERNAL_SERVICE);

      // Circuit breaker allows request
      circuitBreaker.shouldReject.mockReturnValue(false);

      // Classifier returns service error
      classifier.classify.mockReturnValue(classifiedError);

      // Retry manager succeeds after retries
      retryManager.executeWithRetry.mockResolvedValue({
        success: true,
        action: 'operation_completed',
        message: 'Operation succeeded after 2 retries',
        retryCount: 2,
        totalTimeMs: 3000,
        data: { result: 'success' }
      });

      const result = await globalHandler.handleError(
        mockOperation,
        mockContext,
        { operationName: 'external-service-call' }
      );

      expect(circuitBreaker.shouldReject).toHaveBeenCalledWith(ErrorCategory.EXTERNAL_SERVICE);
      expect(circuitBreaker.recordSuccess).toHaveBeenCalledWith(ErrorCategory.EXTERNAL_SERVICE);
      expect(result.success).toBe(true);
      expect(result.retryCount).toBe(2);
    });

    it('should respect skipRetry option', async () => {
      const mockOperation = vi.fn().mockResolvedValue('success');

      // Circuit breaker allows request
      circuitBreaker.shouldReject.mockReturnValue(false);

      const result = await globalHandler.handleError(
        mockOperation,
        mockContext,
        { skipRetry: true }
      );

      expect(retryManager.executeWithRetry).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.action).toBe('operation_completed_without_retry');
    });

    it('should respect skipCircuitBreaker option', async () => {
      const mockOperation = vi.fn().mockResolvedValue('success');

      // Circuit breaker would normally reject, but option skips it
      circuitBreaker.shouldReject.mockReturnValue(true);

      // Mock retry manager to succeed
      retryManager.executeWithRetry.mockResolvedValue({
        success: true,
        action: 'operation_completed',
        message: 'Operation completed successfully',
        retryCount: 0,
        totalTimeMs: 100,
        data: { result: 'success' }
      });

      const result = await globalHandler.handleError(
        mockOperation,
        mockContext,
        { skipCircuitBreaker: true }
      );

      expect(circuitBreaker.shouldReject).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should use custom retry configuration', async () => {
      const originalError = new Error('Service error');
      const mockOperation = vi.fn().mockRejectedValue(originalError);
      const classifiedError = createMockClassifiedError(ErrorCategory.EXTERNAL_SERVICE);

      // Circuit breaker allows request
      circuitBreaker.shouldReject.mockReturnValue(false);

      // Classifier returns service error
      classifier.classify.mockReturnValue(classifiedError);

      const customRetryConfig = {
        maxAttempts: 5,
        delayMs: 2000,
        backoffFactor: 3
      };

      await globalHandler.handleError(
        mockOperation,
        mockContext,
        { customRetryConfig }
      );

      // Verify retry manager was called with merged configuration
      const expectedConfig = {
        maxAttempts: 5, // from custom overrides
        delayMs: 2000,  // from custom overrides
        backoffFactor: 3, // from custom overrides
        maxDelayMs: 5000   // from suggested action (not overridden by custom)
      };

      expect(retryManager.executeWithRetry).toHaveBeenCalledWith(
        expect.any(Function),
        expectedConfig,
        'exponential'
      );
    });

    it('should handle non-recoverable errors', async () => {
      const originalError = new Error('Invalid input format');
      const mockOperation = vi.fn().mockRejectedValue(originalError);
      const classifiedError = createMockClassifiedError(ErrorCategory.USER_INPUT);
      classifiedError.recoverable = false;

      // Circuit breaker allows request
      circuitBreaker.shouldReject.mockReturnValue(false);

      // Classifier returns non-recoverable error
      classifier.classify.mockReturnValue(classifiedError);

      // Mock retry manager to detect if it's called (should not be)
      retryManager.executeWithRetry.mockImplementation(async () => {
        throw new Error('Retry manager should not be called for non-recoverable errors');
      });

      const result = await globalHandler.handleError(mockOperation, mockContext);

      expect(retryManager.executeWithRetry).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.action).toBe('non_recoverable_error');
      expect(result.message).toContain('不可恢复');
    });

    it('should handle disabled features', async () => {
      const handlerWithDisabledFeatures = new GlobalErrorHandler(
        classifier,
        circuitBreaker,
        retryManager,
        {
          retryEnabled: false,
          circuitBreakerEnabled: false
        }
      );

      const mockOperation = vi.fn().mockResolvedValue('success');

      const result = await handlerWithDisabledFeatures.handleError(mockOperation, mockContext);

      expect(circuitBreaker.shouldReject).not.toHaveBeenCalled();
      expect(retryManager.executeWithRetry).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should handle CircuitBreakerOpenError specifically', async () => {
      const originalError = new Error('Network error');
      const mockOperation = vi.fn().mockRejectedValue(originalError);
      const circuitBreakerError = new CircuitBreakerOpenError(ErrorCategory.NETWORK);
      const classifiedError = createMockClassifiedError(ErrorCategory.NETWORK);

      // Circuit breaker allows initial request but throws during execution
      circuitBreaker.shouldReject.mockReturnValue(false);
      classifier.classify.mockReturnValue(classifiedError);
      retryManager.executeWithRetry.mockRejectedValue(circuitBreakerError);

      const result = await globalHandler.handleError(mockOperation, mockContext);

      expect(result.success).toBe(false);
      expect(result.action).toBe('circuit_breaker_open');
      expect(result.message).toContain('NETWORK');
    });

    it('should record monitoring metrics', async () => {
      const mockOperation = vi.fn().mockResolvedValue('success');

      // Circuit breaker allows request
      circuitBreaker.shouldReject.mockReturnValue(false);

      // Retry manager succeeds
      retryManager.executeWithRetry.mockResolvedValue({
        success: true,
        action: 'operation_completed',
        message: 'Operation completed successfully',
        retryCount: 0,
        totalTimeMs: 100
      });

      const result = await globalHandler.handleError(
        mockOperation,
        mockContext,
        { operationName: 'test-operation' }
      );

      expect(result.success).toBe(true);
      expect(result.data?.operationName).toBe('test-operation');
      expect(result.data?.category).toBe(ErrorCategory.UNKNOWN);
    });
  });

  describe('getStats', () => {
    it('should return circuit breaker statistics', () => {
      const mockStats = {
        config: {
          failureThreshold: 5,
          successThreshold: 3,
          timeoutMs: 10000,
          resetTimeoutMs: 60000
        },
        totalCategories: 2,
        openCircuits: 1,
        halfOpenCircuits: 0,
        closedCircuits: 1,
        categoryStates: []
      };

      circuitBreaker.getStats.mockReturnValue(mockStats);

      const stats = globalHandler.getStats();

      expect(stats).toEqual(mockStats);
      expect(circuitBreaker.getStats).toHaveBeenCalled();
    });
  });

  describe('reset', () => {
    it('should reset circuit breaker for specific category', () => {
      globalHandler.reset(ErrorCategory.NETWORK);
      expect(circuitBreaker.reset).toHaveBeenCalledWith(ErrorCategory.NETWORK);
    });

    it('should reset all circuit breakers', () => {
      globalHandler.resetAll();
      expect(circuitBreaker.resetAll).toHaveBeenCalled();
    });
  });
});