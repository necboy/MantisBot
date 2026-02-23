/**
 * Global Error Handler for MantisBot
 *
 * Provides a unified interface for error handling that integrates
 * ErrorClassifier, CircuitBreaker, and RetryManager for comprehensive
 * error management and recovery.
 *
 * @author MantisBot Team
 * @version 1.0.0
 */

import { ErrorClassifier } from './error-classifier.js';
import { CircuitBreaker, CircuitBreakerOpenError, type CircuitBreakerStats } from './circuit-breaker.js';
import { RetryManager, type BackoffStrategy } from './retry-manager.js';
import {
  ErrorCategory,
  type ErrorContext,
  type ErrorHandlingResult,
  type RetryConfig,
  type ClassifiedError
} from './types.js';

/**
 * Configuration options for the Global Error Handler
 */
export interface GlobalErrorHandlerConfig {
  /** Whether to enable retry functionality */
  retryEnabled?: boolean;

  /** Whether to enable circuit breaker protection */
  circuitBreakerEnabled?: boolean;

  /** Whether to enable error reporting and monitoring */
  reportingEnabled?: boolean;

  /** Default retry configuration for operations */
  defaultRetryConfig?: Partial<RetryConfig>;
}

/**
 * Options for individual error handling operations
 */
export interface ErrorHandlingOptions {
  /** Skip retry logic for this operation */
  skipRetry?: boolean;

  /** Skip circuit breaker checks for this operation */
  skipCircuitBreaker?: boolean;

  /** Custom retry configuration for this operation */
  customRetryConfig?: Partial<RetryConfig>;

  /** Operation name for monitoring and debugging */
  operationName?: string;
}

/**
 * Global error handler that integrates all reliability components
 */
export class GlobalErrorHandler {
  private readonly classifier: ErrorClassifier;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly retryManager: RetryManager;
  private readonly config: GlobalErrorHandlerConfig;

  /**
   * Default configuration
   */
  private static readonly DEFAULT_CONFIG: GlobalErrorHandlerConfig = {
    retryEnabled: true,
    circuitBreakerEnabled: true,
    reportingEnabled: true,
    defaultRetryConfig: {
      maxAttempts: 3,
      delayMs: 1000,
      backoffFactor: 2,
      maxDelayMs: 10000
    }
  };

  /**
   * Create a new global error handler
   *
   * @param classifier - Error classifier instance
   * @param circuitBreaker - Circuit breaker instance
   * @param retryManager - Retry manager instance
   * @param config - Configuration options
   */
  constructor(
    classifier: ErrorClassifier,
    circuitBreaker: CircuitBreaker,
    retryManager: RetryManager,
    config: GlobalErrorHandlerConfig = {}
  ) {
    this.classifier = classifier;
    this.circuitBreaker = circuitBreaker;
    this.retryManager = retryManager;
    this.config = { ...GlobalErrorHandler.DEFAULT_CONFIG, ...config };
  }

  /**
   * Handle an error with integrated classification, circuit breaking, and retry logic
   *
   * @param operation - The operation to execute
   * @param context - Error context information
   * @param options - Error handling options
   * @returns Promise resolving to error handling result
   */
  async handleError<T>(
    operation: () => Promise<T>,
    context: ErrorContext,
    options: ErrorHandlingOptions = {}
  ): Promise<ErrorHandlingResult> {
    const startTime = Date.now();
    const operationName = options.operationName || 'unknown_operation';

    try {
      // Determine error category for circuit breaker (default to UNKNOWN for new operations)
      const errorCategory = this.inferErrorCategory(operationName);

      // Check circuit breaker unless disabled
      if (this.config.circuitBreakerEnabled && !options.skipCircuitBreaker) {
        if (this.circuitBreaker.shouldReject(errorCategory)) {
          return {
            success: false,
            action: 'circuit_breaker_open',
            message: `Operation rejected: circuit breaker is open for category ${errorCategory}`,
            totalTimeMs: Date.now() - startTime,
            data: {
              category: errorCategory,
              operationName
            }
          };
        }
      }

      // Execute operation with or without retry
      let result: ErrorHandlingResult;

      if (this.config.retryEnabled && !options.skipRetry) {
        try {
          result = await this.executeWithRetryHandling(operation, context, options);
        } catch (error) {
          if (error instanceof CircuitBreakerOpenError) {
            return {
              success: false,
              action: 'circuit_breaker_open',
              message: `Circuit breaker is open for category ${error.category}`,
              totalTimeMs: Date.now() - startTime,
              data: {
                category: error.category,
                operationName
              }
            };
          }
          throw error; // Re-throw other errors
        }
      } else {
        result = await this.executeWithoutRetry(operation, operationName);
      }

      // Record success in circuit breaker only if not skipped
      if (result.success && this.config.circuitBreakerEnabled && !options.skipCircuitBreaker) {
        const category = result.data?.category || this.inferErrorCategory(operationName);
        this.circuitBreaker.recordSuccess(category);
      }

      // Add monitoring data
      result.totalTimeMs = Date.now() - startTime;
      result.data = {
        ...result.data,
        operationName,
        category: result.data?.category || errorCategory
      };

      return result;

    } catch (error) {
      // Handle unexpected errors in the error handler itself
      if (error instanceof CircuitBreakerOpenError) {
        return {
          success: false,
          action: 'circuit_breaker_open',
          message: `Circuit breaker is open for category ${error.category}`,
          totalTimeMs: Date.now() - startTime,
          data: {
            category: error.category,
            operationName
          }
        };
      }

      return {
        success: false,
        action: 'error_handler_failure',
        message: `Error handler failed: ${(error as Error).message}`,
        error: error as Error,
        totalTimeMs: Date.now() - startTime,
        data: { operationName }
      };
    }
  }

  /**
   * Get circuit breaker statistics
   *
   * @returns Circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    return this.circuitBreaker.getStats();
  }

  /**
   * Reset circuit breaker for a specific category
   *
   * @param category - Error category to reset
   */
  reset(category: ErrorCategory): void {
    this.circuitBreaker.reset(category);
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    this.circuitBreaker.resetAll();
  }

  /**
   * Execute operation with retry handling and error classification
   */
  private async executeWithRetryHandling<T>(
    operation: () => Promise<T>,
    context: ErrorContext,
    options: ErrorHandlingOptions
  ): Promise<ErrorHandlingResult> {
    let classifiedError: ClassifiedError | null = null;

    // Pre-classify by executing the operation once
    try {
      const result = await operation();

      // Success on first attempt
      const operationName = options.operationName || 'unknown_operation';
      return {
        success: true,
        action: 'operation_completed',
        message: 'Operation completed successfully',
        retryCount: 0,
        totalTimeMs: 0,
        data: {
          category: this.inferErrorCategory(operationName),
          result
        }
      };
    } catch (error) {
      const originalError = error as Error;

      // Classify the error
      classifiedError = this.classifier.classify(originalError, context);

      // Record failure in circuit breaker
      if (this.config.circuitBreakerEnabled && !options.skipCircuitBreaker) {
        this.circuitBreaker.recordFailure(classifiedError.category);
      }

      // Check if error is recoverable - if not, return immediately
      if (!classifiedError.recoverable) {
        return {
          success: false,
          action: 'non_recoverable_error',
          message: `不可恢复的错误: ${classifiedError.message}`,
          error: originalError,
          retryCount: 0,
          totalTimeMs: 0,
          data: { category: classifiedError.category }
        };
      }
    }

    // Error is recoverable, proceed with retry
    const retryOperation = async (): Promise<T> => {
      return await operation();
    };

    // Determine retry configuration
    const retryConfig = this.buildRetryConfig(classifiedError, options.customRetryConfig);

    // Execute with retry
    const result = await this.retryManager.executeWithRetry(
      retryOperation,
      retryConfig,
      'exponential'
    );

    // Add category information to result
    result.data = {
      ...result.data,
      category: classifiedError!.category,
      classifiedError
    };

    return result;
  }

  /**
   * Execute operation without retry
   */
  private async executeWithoutRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<ErrorHandlingResult> {
    try {
      await operation();
      return {
        success: true,
        action: 'operation_completed_without_retry',
        message: 'Operation completed successfully',
        retryCount: 0,
        data: { operationName }
      };
    } catch (error) {
      return {
        success: false,
        action: 'operation_failed_without_retry',
        message: `Operation failed: ${(error as Error).message}`,
        error: error as Error,
        retryCount: 0,
        data: { operationName }
      };
    }
  }

  /**
   * Build retry configuration from classified error and custom options
   */
  private buildRetryConfig(
    classifiedError: ClassifiedError | null,
    customConfig?: Partial<RetryConfig>
  ): RetryConfig {
    let baseConfig = { ...this.config.defaultRetryConfig } as RetryConfig;

    // Use suggested retry config from classified error if available
    if (classifiedError && classifiedError.suggestedActions) {
      const retryAction = classifiedError.suggestedActions.find(
        action => action.type === 'retry' || action.type === 'exponential-backoff-retry' || action.type === 'delayed-retry'
      );
      if (retryAction && retryAction.retryConfig) {
        baseConfig = { ...baseConfig, ...retryAction.retryConfig };
      }
    }

    // Apply custom configuration last to override everything
    if (customConfig) {
      baseConfig = { ...baseConfig, ...customConfig };
    }

    return baseConfig;
  }

  /**
   * Infer error category from operation name or context
   */
  private inferErrorCategory(operationName: string): ErrorCategory {
    const name = operationName.toLowerCase();

    if (name.includes('network') || name.includes('http') || name.includes('api')) {
      return ErrorCategory.NETWORK;
    }

    if (name.includes('llm') || name.includes('ai') || name.includes('model') || name.includes('external')) {
      return ErrorCategory.EXTERNAL_SERVICE;
    }

    if (name.includes('input') || name.includes('validation')) {
      return ErrorCategory.USER_INPUT;
    }

    if (name.includes('system') || name.includes('file') || name.includes('memory')) {
      return ErrorCategory.SYSTEM;
    }

    if (name.includes('config') || name.includes('auth')) {
      return ErrorCategory.CONFIGURATION;
    }

    return ErrorCategory.UNKNOWN;
  }
}