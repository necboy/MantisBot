/**
 * Tests for error handling type definitions
 * Following TDD approach - these tests define the expected behavior
 */

import {
  ErrorCategory,
  ErrorSeverity,
  ErrorContext,
  ClassifiedError,
  ErrorHandlingResult,
  RecoveryAction,
  generateErrorId,
  generateRequestId
} from '../types.js';

describe('ErrorCategory enum', () => {
  it('should have all required category values', () => {
    expect(ErrorCategory.BUSINESS).toBe('BUSINESS');
    expect(ErrorCategory.NETWORK).toBe('NETWORK');
    expect(ErrorCategory.EXTERNAL_SERVICE).toBe('EXTERNAL_SERVICE');
    expect(ErrorCategory.SYSTEM).toBe('SYSTEM');
    expect(ErrorCategory.USER_INPUT).toBe('USER_INPUT');
    expect(ErrorCategory.CONFIGURATION).toBe('CONFIGURATION');
    expect(ErrorCategory.UNKNOWN).toBe('UNKNOWN');
  });

  it('should have exactly 7 categories', () => {
    const categories = Object.values(ErrorCategory);
    expect(categories).toHaveLength(7);
  });
});

describe('ErrorSeverity enum', () => {
  it('should have all required severity values', () => {
    expect(ErrorSeverity.LOW).toBe('LOW');
    expect(ErrorSeverity.MEDIUM).toBe('MEDIUM');
    expect(ErrorSeverity.HIGH).toBe('HIGH');
    expect(ErrorSeverity.CRITICAL).toBe('CRITICAL');
  });

  it('should have exactly 4 severity levels', () => {
    const severities = Object.values(ErrorSeverity);
    expect(severities).toHaveLength(4);
  });
});

describe('ErrorContext interface', () => {
  it('should accept valid error context', () => {
    const context: ErrorContext = {
      requestId: 'req-123',
      sessionId: 'sess-456',
      agentId: 'agent-789',
      channelId: 'channel-abc',
      timestamp: Date.now(),
      metadata: {
        userMessage: 'test message',
        model: 'gpt-4'
      }
    };

    expect(context.requestId).toBe('req-123');
    expect(context.sessionId).toBe('sess-456');
    expect(context.agentId).toBe('agent-789');
    expect(context.channelId).toBe('channel-abc');
    expect(typeof context.timestamp).toBe('number');
    expect(context.metadata?.userMessage).toBe('test message');
  });

  it('should work with minimal required fields', () => {
    const context: ErrorContext = {
      requestId: 'req-123',
      timestamp: Date.now()
    };

    expect(context.requestId).toBe('req-123');
    expect(typeof context.timestamp).toBe('number');
  });
});

describe('RecoveryAction interface', () => {
  it('should accept valid recovery action', () => {
    const action: RecoveryAction = {
      type: 'RETRY',
      description: 'Retry the operation with exponential backoff',
      automatic: true,
      retryConfig: {
        maxAttempts: 3,
        delayMs: 1000,
        backoffFactor: 2
      }
    };

    expect(action.type).toBe('RETRY');
    expect(action.description).toBe('Retry the operation with exponential backoff');
    expect(action.automatic).toBe(true);
    expect(action.retryConfig?.maxAttempts).toBe(3);
  });

  it('should work with manual recovery action', () => {
    const action: RecoveryAction = {
      type: 'MANUAL_INTERVENTION',
      description: 'Requires user input to resolve',
      automatic: false
    };

    expect(action.type).toBe('MANUAL_INTERVENTION');
    expect(action.automatic).toBe(false);
  });
});

describe('ClassifiedError interface', () => {
  it('should accept fully specified error', () => {
    const error: ClassifiedError = {
      id: 'error-123',
      category: ErrorCategory.NETWORK,
      severity: ErrorSeverity.HIGH,
      message: 'Connection timeout',
      originalError: new Error('Network timeout'),
      context: {
        requestId: 'req-456',
        timestamp: Date.now()
      },
      suggestedActions: [
        {
          type: 'RETRY',
          description: 'Retry with exponential backoff',
          automatic: true,
          retryConfig: {
            maxAttempts: 3,
            delayMs: 1000,
            backoffFactor: 2
          }
        }
      ],
      recoverable: true,
      timestamp: Date.now()
    };

    expect(error.id).toBe('error-123');
    expect(error.category).toBe(ErrorCategory.NETWORK);
    expect(error.severity).toBe(ErrorSeverity.HIGH);
    expect(error.message).toBe('Connection timeout');
    expect(error.originalError).toBeInstanceOf(Error);
    expect(error.recoverable).toBe(true);
    expect(error.suggestedActions).toHaveLength(1);
  });

  it('should work with minimal required fields', () => {
    const error: ClassifiedError = {
      id: 'error-456',
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.MEDIUM,
      message: 'Unknown error occurred',
      context: {
        requestId: 'req-789',
        timestamp: Date.now()
      },
      recoverable: false,
      timestamp: Date.now()
    };

    expect(error.id).toBe('error-456');
    expect(error.recoverable).toBe(false);
  });
});

describe('ErrorHandlingResult interface', () => {
  it('should accept successful recovery result', () => {
    const result: ErrorHandlingResult = {
      success: true,
      action: 'RETRY',
      message: 'Successfully retried operation',
      retryCount: 2,
      totalTimeMs: 5000
    };

    expect(result.success).toBe(true);
    expect(result.action).toBe('RETRY');
    expect(result.retryCount).toBe(2);
    expect(result.totalTimeMs).toBe(5000);
  });

  it('should accept failed recovery result', () => {
    const result: ErrorHandlingResult = {
      success: false,
      action: 'FALLBACK',
      message: 'Fallback mechanism activated',
      error: new Error('Recovery failed'),
      retryCount: 3,
      totalTimeMs: 10000
    };

    expect(result.success).toBe(false);
    expect(result.action).toBe('FALLBACK');
    expect(result.error).toBeInstanceOf(Error);
    expect(result.retryCount).toBe(3);
  });
});

describe('generateErrorId', () => {
  it('should generate unique error IDs', () => {
    const id1 = generateErrorId();
    const id2 = generateErrorId();

    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^err-[a-z0-9]{8}-[a-z0-9]{4}$/);
    expect(id2).toMatch(/^err-[a-z0-9]{8}-[a-z0-9]{4}$/);
  });

  it('should generate readable error IDs', () => {
    const id = generateErrorId();
    expect(id).toMatch(/^err-/);
    expect(id.length).toBe(17); // err- + 8 chars + - + 4 chars
  });
});

describe('generateRequestId', () => {
  it('should generate unique request IDs', () => {
    const id1 = generateRequestId();
    const id2 = generateRequestId();

    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^req-[a-z0-9]{8}-[a-z0-9]{4}$/);
    expect(id2).toMatch(/^req-[a-z0-9]{8}-[a-z0-9]{4}$/);
  });

  it('should generate readable request IDs', () => {
    const id = generateRequestId();
    expect(id).toMatch(/^req-/);
    expect(id.length).toBe(17); // req- + 8 chars + - + 4 chars
  });
});

describe('ID generation collision resistance', () => {
  it('should generate unique IDs across multiple calls', () => {
    const ids = new Set();
    for (let i = 0; i < 1000; i++) {
      const errorId = generateErrorId();
      const requestId = generateRequestId();

      expect(ids.has(errorId)).toBe(false);
      expect(ids.has(requestId)).toBe(false);

      ids.add(errorId);
      ids.add(requestId);
    }

    expect(ids.size).toBe(2000);
  });
});