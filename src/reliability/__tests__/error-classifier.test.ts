/**
 * Error Classifier Test Suite
 *
 * Tests for the intelligent error classification system that automatically
 * categorizes errors and provides recovery recommendations.
 *
 * @author MantisBot Team
 * @version 1.0.0
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { ErrorClassifier } from '../error-classifier.js';
import {
  ErrorCategory,
  ErrorSeverity,
  type ErrorContext,
  type ClassifiedError
} from '../types.js';

describe('ErrorClassifier', () => {
  let classifier: ErrorClassifier;
  let baseContext: ErrorContext;

  beforeEach(() => {
    classifier = new ErrorClassifier();
    baseContext = {
      requestId: 'req-test-1234',
      sessionId: 'session-456',
      agentId: 'test-agent',
      channelId: 'web-ui',
      timestamp: Date.now(),
      metadata: { component: 'test-component' }
    };
  });

  describe('Network Error Classification', () => {
    test('should classify connection refused errors as NETWORK', () => {
      const error = new Error('connect ECONNREFUSED 127.0.0.1:8080');
      const classified = classifier.classify(error, baseContext);

      expect(classified.category).toBe(ErrorCategory.NETWORK);
      expect(classified.severity).toBe(ErrorSeverity.MEDIUM);
      expect(classified.recoverable).toBe(true);
      expect(classified.message).toContain('网络');
      expect(classified.suggestedActions).toHaveLength(2);
      expect(classified.suggestedActions?.[0].type).toBe('retry');
      expect(classified.suggestedActions?.[1].type).toBe('check-network');
    });

    test('should classify timeout errors as NETWORK', () => {
      const error = new Error('Request timeout after 30000ms');
      const classified = classifier.classify(error, baseContext);

      expect(classified.category).toBe(ErrorCategory.NETWORK);
      expect(classified.severity).toBe(ErrorSeverity.MEDIUM);
      expect(classified.recoverable).toBe(true);
    });

    test('should classify ENOTFOUND errors as NETWORK', () => {
      const error = new Error('getaddrinfo ENOTFOUND api.example.com');
      const classified = classifier.classify(error, baseContext);

      expect(classified.category).toBe(ErrorCategory.NETWORK);
      expect(classified.severity).toBe(ErrorSeverity.MEDIUM);
      expect(classified.recoverable).toBe(true);
    });

    test('should classify ECONNRESET errors as NETWORK', () => {
      const error = new Error('socket hang up ECONNRESET');
      const classified = classifier.classify(error, baseContext);

      expect(classified.category).toBe(ErrorCategory.NETWORK);
      expect(classified.severity).toBe(ErrorSeverity.MEDIUM);
      expect(classified.recoverable).toBe(true);
    });
  });

  describe('LLM Service Error Classification', () => {
    test('should classify rate limit errors as EXTERNAL_SERVICE', () => {
      const error = new Error('Rate limit exceeded. Please try again later.');
      const classified = classifier.classify(error, baseContext);

      expect(classified.category).toBe(ErrorCategory.EXTERNAL_SERVICE);
      expect(classified.severity).toBe(ErrorSeverity.MEDIUM);
      expect(classified.recoverable).toBe(true);
      expect(classified.message).toContain('AI 服务');
      expect(classified.suggestedActions).toHaveLength(2);
      expect(classified.suggestedActions?.[0].type).toBe('exponential-backoff-retry');
      expect(classified.suggestedActions?.[1].type).toBe('switch-model');
    });

    test('should classify 429 HTTP errors as EXTERNAL_SERVICE', () => {
      const error = new Error('HTTP 429: Too Many Requests');
      const classified = classifier.classify(error, baseContext);

      expect(classified.category).toBe(ErrorCategory.EXTERNAL_SERVICE);
      expect(classified.severity).toBe(ErrorSeverity.MEDIUM);
      expect(classified.recoverable).toBe(true);
    });

    test('should classify OpenAI component errors as EXTERNAL_SERVICE', () => {
      const contextWithLLM: ErrorContext = {
        ...baseContext,
        metadata: { component: 'openai-client' }
      };
      const error = new Error('Invalid API key provided');
      const classified = classifier.classify(error, contextWithLLM);

      expect(classified.category).toBe(ErrorCategory.EXTERNAL_SERVICE);
      expect(classified.severity).toBe(ErrorSeverity.MEDIUM);
      expect(classified.recoverable).toBe(true);
    });

    test('should classify Anthropic component errors as EXTERNAL_SERVICE', () => {
      const contextWithLLM: ErrorContext = {
        ...baseContext,
        metadata: { component: 'anthropic-client' }
      };
      const error = new Error('Service unavailable');
      const classified = classifier.classify(error, contextWithLLM);

      expect(classified.category).toBe(ErrorCategory.EXTERNAL_SERVICE);
      expect(classified.severity).toBe(ErrorSeverity.MEDIUM);
      expect(classified.recoverable).toBe(true);
    });

    test('should classify LLM component errors as EXTERNAL_SERVICE', () => {
      const contextWithLLM: ErrorContext = {
        ...baseContext,
        metadata: { component: 'llm-client' }
      };
      const error = new Error('Model overloaded');
      const classified = classifier.classify(error, contextWithLLM);

      expect(classified.category).toBe(ErrorCategory.EXTERNAL_SERVICE);
      expect(classified.severity).toBe(ErrorSeverity.HIGH); // Upgraded due to llm-client component
      expect(classified.recoverable).toBe(true);
    });
  });

  describe('User Input Error Classification', () => {
    test('should classify JSON parse errors as USER_INPUT', () => {
      const error = new Error('Invalid JSON format in request body');
      const classified = classifier.classify(error, baseContext);

      expect(classified.category).toBe(ErrorCategory.USER_INPUT);
      expect(classified.severity).toBe(ErrorSeverity.LOW);
      expect(classified.recoverable).toBe(false);
      expect(classified.message).toContain('输入格式');
      expect(classified.suggestedActions).toHaveLength(1);
      expect(classified.suggestedActions?.[0].type).toBe('fix-input');
      expect(classified.suggestedActions?.[0].automatic).toBe(false);
    });

    test('should classify validation errors as USER_INPUT', () => {
      const error = new Error('Validation error: field "name" is required');
      const classified = classifier.classify(error, baseContext);

      expect(classified.category).toBe(ErrorCategory.USER_INPUT);
      expect(classified.severity).toBe(ErrorSeverity.LOW);
      expect(classified.recoverable).toBe(false);
    });

    test('should classify parse errors as USER_INPUT', () => {
      const error = new Error('Parse error: unexpected token at position 10');
      const classified = classifier.classify(error, baseContext);

      expect(classified.category).toBe(ErrorCategory.USER_INPUT);
      expect(classified.severity).toBe(ErrorSeverity.LOW);
      expect(classified.recoverable).toBe(false);
    });
  });

  describe('System Error Classification', () => {
    test('should classify memory errors as SYSTEM', () => {
      const error = new Error('Out of memory: cannot allocate 1024MB');
      const classified = classifier.classify(error, baseContext);

      expect(classified.category).toBe(ErrorCategory.SYSTEM);
      expect(classified.severity).toBe(ErrorSeverity.HIGH);
      expect(classified.recoverable).toBe(true);
      expect(classified.message).toContain('系统');
      expect(classified.suggestedActions).toHaveLength(2);
      expect(classified.suggestedActions?.[0].type).toBe('delayed-retry');
      expect(classified.suggestedActions?.[1].type).toBe('admin-check-resources');
    });

    test('should classify disk full errors as SYSTEM', () => {
      const error = new Error('ENOSPC: no space left on device');
      const classified = classifier.classify(error, baseContext);

      expect(classified.category).toBe(ErrorCategory.SYSTEM);
      expect(classified.severity).toBe(ErrorSeverity.HIGH);
      expect(classified.recoverable).toBe(true);
    });

    test('should classify permission errors as SYSTEM', () => {
      const error = new Error('EACCES: permission denied, open "/etc/config"');
      const classified = classifier.classify(error, baseContext);

      expect(classified.category).toBe(ErrorCategory.SYSTEM);
      expect(classified.severity).toBe(ErrorSeverity.HIGH);
      expect(classified.recoverable).toBe(true);
    });
  });

  describe('Configuration Error Classification', () => {
    test('should classify config not found errors as CONFIGURATION', () => {
      const error = new Error('Config file not found: /etc/mantisbot/config.json');
      const classified = classifier.classify(error, baseContext);

      expect(classified.category).toBe(ErrorCategory.CONFIGURATION);
      expect(classified.severity).toBe(ErrorSeverity.HIGH);
      expect(classified.recoverable).toBe(false);
      expect(classified.message).toContain('配置');
      expect(classified.suggestedActions).toHaveLength(1);
      expect(classified.suggestedActions?.[0].type).toBe('admin-check-config');
      expect(classified.suggestedActions?.[0].automatic).toBe(false);
    });

    test('should classify API key errors as CONFIGURATION', () => {
      const error = new Error('Invalid API key: authentication failed');
      const classified = classifier.classify(error, baseContext);

      expect(classified.category).toBe(ErrorCategory.CONFIGURATION);
      expect(classified.severity).toBe(ErrorSeverity.HIGH);
      expect(classified.recoverable).toBe(false);
    });
  });

  describe('Context-Based Severity Adjustment', () => {
    test('should increase severity for agent-runner component errors', () => {
      const agentContext: ErrorContext = {
        ...baseContext,
        metadata: { component: 'agent-runner' }
      };
      const error = new Error('connect ECONNREFUSED 127.0.0.1:8080');
      const classified = classifier.classify(error, agentContext);

      expect(classified.severity).toBe(ErrorSeverity.HIGH); // Upgraded from MEDIUM
    });

    test('should increase severity for llm-client component errors', () => {
      const llmContext: ErrorContext = {
        ...baseContext,
        metadata: { component: 'llm-client' }
      };
      const error = new Error('Rate limit exceeded');
      const classified = classifier.classify(error, llmContext);

      expect(classified.severity).toBe(ErrorSeverity.HIGH); // Upgraded from MEDIUM
    });
  });

  describe('User-Friendly Message Generation', () => {
    test('should generate appropriate message for network errors', () => {
      const error = new Error('connect ECONNREFUSED');
      const classified = classifier.classify(error, baseContext);

      expect(classified.message).toBe('网络连接出现问题，请检查网络设置后重试。');
    });

    test('should generate appropriate message for LLM service errors', () => {
      const error = new Error('Rate limit exceeded');
      const classified = classifier.classify(error, baseContext);

      expect(classified.message).toBe('AI 服务暂时不可用，请稍后重试。');
    });

    test('should generate appropriate message for user input errors', () => {
      const error = new Error('Invalid JSON format');
      const classified = classifier.classify(error, baseContext);

      expect(classified.message).toBe('输入格式不正确，请检查后重新输入。');
    });

    test('should generate appropriate message for system errors', () => {
      const error = new Error('Out of memory');
      const classified = classifier.classify(error, baseContext);

      expect(classified.message).toBe('系统正在处理中，请稍候片刻。');
    });

    test('should generate appropriate message for configuration errors', () => {
      const error = new Error('Config not found');
      const classified = classifier.classify(error, baseContext);

      expect(classified.message).toBe('系统配置有误，请联系管理员。');
    });
  });

  describe('Recovery Actions Generation', () => {
    test('should generate retry actions for network errors', () => {
      const error = new Error('connect ECONNREFUSED');
      const classified = classifier.classify(error, baseContext);

      const retryAction = classified.suggestedActions?.find(a => a.type === 'retry');
      expect(retryAction).toBeDefined();
      expect(retryAction?.automatic).toBe(true);
      expect(retryAction?.retryConfig?.maxAttempts).toBe(3);
      expect(retryAction?.retryConfig?.delayMs).toBe(1000);
    });

    test('should generate exponential backoff for LLM errors', () => {
      const error = new Error('Rate limit exceeded');
      const classified = classifier.classify(error, baseContext);

      const retryAction = classified.suggestedActions?.find(a => a.type === 'exponential-backoff-retry');
      expect(retryAction).toBeDefined();
      expect(retryAction?.automatic).toBe(true);
      expect(retryAction?.retryConfig?.maxAttempts).toBe(5);
      expect(retryAction?.retryConfig?.backoffFactor).toBe(2);
    });

    test('should not generate automatic actions for user input errors', () => {
      const error = new Error('Invalid JSON');
      const classified = classifier.classify(error, baseContext);

      const automaticActions = classified.suggestedActions?.filter(a => a.automatic);
      expect(automaticActions).toHaveLength(0);
    });
  });

  describe('Error ID and Timestamp', () => {
    test('should generate unique error IDs', () => {
      const error = new Error('Test error');
      const classified1 = classifier.classify(error, baseContext);
      const classified2 = classifier.classify(error, baseContext);

      expect(classified1.id).not.toBe(classified2.id);
      expect(classified1.id).toMatch(/^err-[a-z0-9]{8}-[a-z0-9]{4}$/);
    });

    test('should set proper timestamps', () => {
      const startTime = Date.now();
      const error = new Error('Test error');
      const classified = classifier.classify(error, baseContext);

      expect(classified.timestamp).toBeGreaterThanOrEqual(startTime);
      expect(classified.timestamp).toBeLessThanOrEqual(Date.now());
    });

    test('should preserve original error', () => {
      const originalError = new Error('Original error message');
      const classified = classifier.classify(originalError, baseContext);

      expect(classified.originalError).toBe(originalError);
    });

    test('should preserve context', () => {
      const error = new Error('Test error');
      const classified = classifier.classify(error, baseContext);

      expect(classified.context).toEqual(baseContext);
    });
  });

  describe('Unknown Error Fallback', () => {
    test('should classify unrecognized errors as UNKNOWN', () => {
      const error = new Error('Some very specific error that does not match any pattern');
      const classified = classifier.classify(error, baseContext);

      expect(classified.category).toBe(ErrorCategory.UNKNOWN);
      expect(classified.severity).toBe(ErrorSeverity.MEDIUM);
      expect(classified.recoverable).toBe(false);
      expect(classified.message).toContain('未知错误');
    });
  });
});