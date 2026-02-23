/**
 * Retry Manager tests for MantisBot
 *
 * Comprehensive test suite for the RetryManager class, covering all backoff strategies
 * and retry logic using Test-Driven Development (TDD) approach.
 *
 * @author MantisBot Team
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RetryManager, BackoffStrategy } from '../retry-manager.js';
import { ErrorCategory, ErrorHandlingResult, generateRequestId, RetryConfig } from '../types.js';

describe('RetryManager', () => {
  let retryManager: RetryManager;
  let mockRequestId: string;

  beforeEach(() => {
    // Setup fake timers to control time in tests
    vi.useFakeTimers();

    retryManager = new RetryManager();
    mockRequestId = generateRequestId();
  });

  afterEach(() => {
    // Restore timers after each test
    vi.useRealTimers();
  });

  describe('First attempt success', () => {
    it('should succeed on first attempt without retries', async () => {
      const successfulOperation = vi.fn().mockResolvedValue('success');
      const config: RetryConfig = {
        maxAttempts: 3,
        delayMs: 100,
        backoffFactor: 2,
        maxDelayMs: 1000
      };

      const result = await retryManager.executeWithRetry(successfulOperation, config);

      expect(result.success).toBe(true);
      expect(result.action).toBe('operation_completed');
      expect(result.retryCount).toBe(0);
      expect(result.data?.result).toBe('success');
      expect(successfulOperation).toHaveBeenCalledTimes(1);
    });
  });

  describe('Network error retries', () => {
    it('should retry on ECONNRESET network errors', async () => {
      const networkError = new Error('Connection reset');
      (networkError as any).code = 'ECONNRESET';

      const operationMock = vi.fn()
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce('success');

      const config: RetryConfig = {
        maxAttempts: 3,
        delayMs: 100,
        backoffFactor: 2
      };

      const promise = retryManager.executeWithRetry(operationMock, config);

      // Advance timers to trigger retries
      await vi.runAllTimersAsync();

      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.retryCount).toBe(2);
      expect(operationMock).toHaveBeenCalledTimes(3);
    });

    it('should retry on timeout errors', async () => {
      const timeoutError = new Error('Request timeout');
      (timeoutError as any).code = 'ETIMEDOUT';

      const operationMock = vi.fn()
        .mockRejectedValueOnce(timeoutError)
        .mockResolvedValueOnce('success');

      const config: RetryConfig = {
        maxAttempts: 3,
        delayMs: 200
      };

      const promise = retryManager.executeWithRetry(operationMock, config);

      await vi.runAllTimersAsync();

      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.retryCount).toBe(1);
    });

    it('should retry on DNS errors', async () => {
      const dnsError = new Error('DNS lookup failed');
      (dnsError as any).code = 'ENOTFOUND';

      const operationMock = vi.fn()
        .mockRejectedValueOnce(dnsError)
        .mockResolvedValueOnce('success');

      const config: RetryConfig = {
        maxAttempts: 2,
        delayMs: 50
      };

      const promise = retryManager.executeWithRetry(operationMock, config);

      await vi.runAllTimersAsync();

      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.retryCount).toBe(1);
    });
  });

  describe('Exponential backoff strategy', () => {
    it('should use exponential backoff with proper delays', async () => {
      const error = new Error('Temporary failure');
      (error as any).code = 'ECONNRESET';  // Make it retryable
      const operationMock = vi.fn()
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce('success');

      const config: RetryConfig = {
        maxAttempts: 3,
        delayMs: 100,        // Initial delay: 100ms
        backoffFactor: 2,    // 2nd retry: 200ms, 3rd retry: 400ms
        maxDelayMs: 500      // Cap at 500ms
      };

      const promise = retryManager.executeWithRetry(operationMock, config, 'exponential');

      // First retry should wait 100ms
      expect(operationMock).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(100);
      expect(operationMock).toHaveBeenCalledTimes(2);

      // Second retry should wait 200ms
      await vi.advanceTimersByTimeAsync(200);
      expect(operationMock).toHaveBeenCalledTimes(3);

      const result = await promise;
      expect(result.success).toBe(true);
      expect(result.retryCount).toBe(2);
    });

    it('should respect maxDelayMs cap in exponential backoff', async () => {
      const error = new Error('Temporary failure');
      (error as any).code = 'ECONNRESET';  // Make it retryable
      const operationMock = vi.fn()
        .mockRejectedValue(error);

      const config: RetryConfig = {
        maxAttempts: 5,
        delayMs: 100,
        backoffFactor: 10,    // Would normally be 100, 1000, 10000, 100000
        maxDelayMs: 500       // But capped at 500
      };

      const promise = retryManager.executeWithRetry(operationMock, config, 'exponential');

      // Let all timers run to completion
      await vi.runAllTimersAsync();

      const result = await promise;
      expect(result.success).toBe(false);
      expect(result.retryCount).toBe(4); // maxAttempts - 1
    });
  });

  describe('Fixed backoff strategy', () => {
    it('should use consistent delay for fixed backoff', async () => {
      const error = new Error('Temporary failure');
      (error as any).code = 'ECONNRESET';  // Make it retryable
      const operationMock = vi.fn()
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce('success');

      const config: RetryConfig = {
        maxAttempts: 3,
        delayMs: 150
      };

      const promise = retryManager.executeWithRetry(operationMock, config, 'fixed');

      // Each retry should wait exactly 150ms
      await vi.advanceTimersByTimeAsync(150);
      expect(operationMock).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(150);
      expect(operationMock).toHaveBeenCalledTimes(3);

      const result = await promise;
      expect(result.success).toBe(true);
    });
  });

  describe('Linear backoff strategy', () => {
    it('should use linear incremental delays', async () => {
      const error = new Error('Temporary failure');
      (error as any).code = 'ECONNRESET';  // Make it retryable
      const operationMock = vi.fn()
        .mockRejectedValue(error);

      const config: RetryConfig = {
        maxAttempts: 4,
        delayMs: 100,  // Base delay
        backoffFactor: 1.5  // Used as increment for linear
      };

      const promise = retryManager.executeWithRetry(operationMock, config, 'linear');

      // First retry: 100ms
      await vi.advanceTimersByTimeAsync(100);
      expect(operationMock).toHaveBeenCalledTimes(2);

      // Second retry: 100 + 150 = 250ms
      await vi.advanceTimersByTimeAsync(250);
      expect(operationMock).toHaveBeenCalledTimes(3);

      // Third retry: 100 + 2*150 = 400ms
      await vi.advanceTimersByTimeAsync(400);
      expect(operationMock).toHaveBeenCalledTimes(4);

      const result = await promise;
      expect(result.success).toBe(false);
    });
  });

  describe('Non-retryable errors', () => {
    it('should not retry unauthorized errors', async () => {
      const authError = new Error('Unauthorized access');
      (authError as any).status = 401;

      const operationMock = vi.fn().mockRejectedValue(authError);

      const config: RetryConfig = {
        maxAttempts: 5,
        delayMs: 100
      };

      const result = await retryManager.executeWithRetry(operationMock, config);

      expect(result.success).toBe(false);
      expect(result.retryCount).toBe(0);
      expect(result.action).toBe('non_retryable_error');
      expect(operationMock).toHaveBeenCalledTimes(1);
    });

    it('should not retry forbidden errors', async () => {
      const forbiddenError = new Error('Access forbidden');
      (forbiddenError as any).status = 403;

      const operationMock = vi.fn().mockRejectedValue(forbiddenError);

      const config: RetryConfig = {
        maxAttempts: 3,
        delayMs: 100
      };

      const result = await retryManager.executeWithRetry(operationMock, config);

      expect(result.success).toBe(false);
      expect(result.retryCount).toBe(0);
      expect(operationMock).toHaveBeenCalledTimes(1);
    });

    it('should not retry validation errors', async () => {
      const validationError = new Error('Invalid input format');
      (validationError as any).status = 400;

      const operationMock = vi.fn().mockRejectedValue(validationError);

      const config: RetryConfig = {
        maxAttempts: 3,
        delayMs: 100
      };

      const result = await retryManager.executeWithRetry(operationMock, config);

      expect(result.success).toBe(false);
      expect(result.retryCount).toBe(0);
      expect(result.action).toBe('non_retryable_error');
    });
  });

  describe('Operation timeout control', () => {
    it('should timeout individual attempts', async () => {
      const slowOperation = vi.fn().mockImplementation(() =>
        new Promise((resolve) => {
          // This will never resolve, simulating a hanging operation
        })
      );

      const config: RetryConfig = {
        maxAttempts: 2,
        delayMs: 100
      };

      // Set operation timeout to 500ms
      const promise = retryManager.executeWithRetry(slowOperation, config, 'fixed', 500);

      // Run all timers to completion
      await vi.runAllTimersAsync();

      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.action).toBe('max_attempts_exceeded');
      // Should have tried twice (initial + 1 retry) both timing out
      expect(result.retryCount).toBe(1);
    });
  });

  describe('LLM API rate limit retries', () => {
    it('should retry on rate limit errors', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      (rateLimitError as any).status = 429;

      const operationMock = vi.fn()
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce('success');

      const config: RetryConfig = {
        maxAttempts: 3,
        delayMs: 1000  // Longer delay for rate limits
      };

      const promise = retryManager.executeWithRetry(operationMock, config);

      await vi.runAllTimersAsync();

      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.retryCount).toBe(1);
      expect(operationMock).toHaveBeenCalledTimes(2);
    });

    it('should use longer delays for rate limit retries', async () => {
      const rateLimitError = new Error('Too many requests');
      (rateLimitError as any).status = 429;

      const operationMock = vi.fn()
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce('success');

      const config: RetryConfig = {
        maxAttempts: 2,
        delayMs: 100
      };

      const promise = retryManager.executeWithRetry(operationMock, config);

      // Rate limit retries should use minimum 1000ms delay
      await vi.advanceTimersByTimeAsync(1000);

      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.retryCount).toBe(1);
    });
  });

  describe('Max attempts exceeded', () => {
    it('should fail after max attempts with retryable error', async () => {
      const networkError = new Error('Connection failed');
      (networkError as any).code = 'ECONNREFUSED';

      const operationMock = vi.fn().mockRejectedValue(networkError);

      const config: RetryConfig = {
        maxAttempts: 3,
        delayMs: 50
      };

      const promise = retryManager.executeWithRetry(operationMock, config);

      await vi.runAllTimersAsync();

      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.action).toBe('max_attempts_exceeded');
      expect(result.retryCount).toBe(2); // maxAttempts - 1
      expect(result.error).toBeInstanceOf(Error);
      expect(operationMock).toHaveBeenCalledTimes(3);
    });
  });

  describe('Progress logging', () => {
    it('should log retry attempts', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const error = new Error('Temporary failure');
      (error as any).code = 'ECONNRESET';  // Make it retryable
      const operationMock = vi.fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce('success');

      const config: RetryConfig = {
        maxAttempts: 2,
        delayMs: 100
      };

      const promise = retryManager.executeWithRetry(operationMock, config);

      await vi.runAllTimersAsync();

      await promise;

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Retry attempt 1')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Operation succeeded after 1 retries')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Error result properties', () => {
    it('should return proper timing information', async () => {
      const error = new Error('Network error');
      (error as any).code = 'ECONNRESET';

      const operationMock = vi.fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce('success');

      const config: RetryConfig = {
        maxAttempts: 2,
        delayMs: 200
      };

      const startTime = Date.now();

      const promise = retryManager.executeWithRetry(operationMock, config);

      // Advance timers to complete the retry
      await vi.advanceTimersByTimeAsync(200);

      const result = await promise;

      expect(result.totalTimeMs).toBeGreaterThan(0);
      expect(typeof result.totalTimeMs).toBe('number');
      expect(result.success).toBe(true);
    });

    it('should include original error in failed result', async () => {
      const originalError = new Error('Persistent failure');
      (originalError as any).code = 'ECONNRESET';

      const operationMock = vi.fn().mockRejectedValue(originalError);

      const config: RetryConfig = {
        maxAttempts: 2,
        delayMs: 50
      };

      const promise = retryManager.executeWithRetry(operationMock, config);

      await vi.runAllTimersAsync();

      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.error).toBe(originalError);
      expect(result.message).toContain('after 1 attempts');
    });
  });
});