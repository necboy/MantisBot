/**
 * Circuit Breaker implementation for MantisBot
 *
 * Provides a robust circuit breaker pattern implementation to prevent cascade failures
 * and protect system resources. Supports three states: CLOSED, OPEN, and HALF_OPEN.
 * Each error category has its own independent circuit breaker state.
 *
 * @author MantisBot Team
 * @version 1.0.0
 */

import { ErrorCategory } from './types.js';

/**
 * Configuration options for the circuit breaker
 */
export interface CircuitBreakerConfig {
  /** Number of failures required to open the circuit */
  failureThreshold: number;

  /** Number of successes required to close the circuit from HALF_OPEN state */
  successThreshold: number;

  /** Timeout for individual operations in milliseconds */
  timeoutMs: number;

  /** Time to wait before transitioning from OPEN to HALF_OPEN in milliseconds */
  resetTimeoutMs: number;
}

/**
 * State of a circuit breaker for a specific error category
 */
export interface CircuitBreakerState {
  /** Current circuit breaker status */
  status: 'CLOSED' | 'OPEN' | 'HALF_OPEN';

  /** Current number of consecutive failures */
  failureCount: number;

  /** Current number of consecutive successes (used in HALF_OPEN state) */
  successCount: number;

  /** Timestamp of the last failure occurrence */
  lastFailureTime: number;
}

/**
 * Statistics about circuit breaker states across categories
 */
export interface CircuitBreakerStats {
  /** Configuration used by the circuit breaker */
  config: CircuitBreakerConfig;

  /** Total number of error categories being tracked */
  totalCategories: number;

  /** Number of circuits currently in OPEN state */
  openCircuits: number;

  /** Number of circuits currently in HALF_OPEN state */
  halfOpenCircuits: number;

  /** Number of circuits currently in CLOSED state */
  closedCircuits: number;

  /** Detailed state information for each category */
  categoryStates: Array<{
    category: string;
    status: string;
    failureCount: number;
    successCount: number;
    lastFailureTime: number;
  }>;
}

/**
 * Error thrown when a circuit breaker is in OPEN state
 */
export class CircuitBreakerOpenError extends Error {
  public readonly category: ErrorCategory;

  constructor(category: ErrorCategory, message?: string) {
    const defaultMessage = `Circuit breaker is OPEN for category: ${category}`;
    super(message || defaultMessage);

    this.name = 'CircuitBreakerOpenError';
    this.category = category;

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, CircuitBreakerOpenError.prototype);
  }
}

/**
 * Circuit breaker implementation with configurable thresholds and timeouts
 */
export class CircuitBreaker {
  private readonly config: CircuitBreakerConfig;
  private readonly states = new Map<string, CircuitBreakerState>();

  /**
   * Default configuration for circuit breaker
   */
  private static readonly DEFAULT_CONFIG: CircuitBreakerConfig = {
    failureThreshold: 5,
    successThreshold: 3,
    timeoutMs: 10000,
    resetTimeoutMs: 60000
  };

  /**
   * Create a new circuit breaker with optional configuration
   *
   * @param config - Circuit breaker configuration (uses defaults if not provided)
   */
  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = { ...CircuitBreaker.DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if a request should be rejected based on circuit breaker state
   *
   * @param category - Error category to check
   * @returns true if the request should be rejected, false otherwise
   */
  shouldReject(category: ErrorCategory): boolean {
    const state = this.getOrCreateState(category);

    switch (state.status) {
      case 'CLOSED':
        return false;

      case 'OPEN':
        // Check if enough time has passed to transition to HALF_OPEN
        const timeSinceLastFailure = Date.now() - state.lastFailureTime;
        if (timeSinceLastFailure >= this.config.resetTimeoutMs) {
          this.transitionToHalfOpen(category);
          return false;
        }
        return true;

      case 'HALF_OPEN':
        return false;

      default:
        return false;
    }
  }

  /**
   * Record a successful operation for the given category
   *
   * @param category - Error category for the successful operation
   */
  recordSuccess(category: ErrorCategory): void {
    const state = this.getOrCreateState(category);

    switch (state.status) {
      case 'CLOSED':
        // Reset failure count on success
        state.failureCount = 0;
        break;

      case 'HALF_OPEN':
        state.successCount++;
        if (state.successCount >= this.config.successThreshold) {
          this.transitionToClosed(category);
        }
        break;

      case 'OPEN':
        // Successes in OPEN state are ignored
        break;
    }
  }

  /**
   * Record a failed operation for the given category
   *
   * @param category - Error category for the failed operation
   */
  recordFailure(category: ErrorCategory): void {
    const state = this.getOrCreateState(category);
    const currentTime = Date.now();

    switch (state.status) {
      case 'CLOSED':
        state.failureCount++;
        state.lastFailureTime = currentTime;
        if (state.failureCount >= this.config.failureThreshold) {
          this.transitionToOpen(category);
        }
        break;

      case 'HALF_OPEN':
        // Any failure in HALF_OPEN immediately transitions to OPEN
        this.transitionToOpen(category);
        state.lastFailureTime = currentTime;
        break;

      case 'OPEN':
        // Update last failure time but don't change state
        state.lastFailureTime = currentTime;
        break;
    }
  }

  /**
   * Get all current circuit breaker states
   *
   * @returns Map of category names to their circuit breaker states
   */
  getAllStates(): Map<string, CircuitBreakerState> {
    // Return a copy to prevent external modification
    const result = new Map<string, CircuitBreakerState>();

    for (const [category, state] of this.states.entries()) {
      result.set(category, { ...state });
    }

    return result;
  }

  /**
   * Reset the circuit breaker state for a specific category
   *
   * @param category - Error category to reset
   */
  reset(category: ErrorCategory): void {
    this.states.delete(category);
  }

  /**
   * Reset all circuit breaker states
   */
  resetAll(): void {
    this.states.clear();
  }

  /**
   * Get comprehensive statistics about circuit breaker states
   *
   * @returns Detailed statistics about all circuit breakers
   */
  getStats(): CircuitBreakerStats {
    const categoryStates = Array.from(this.states.entries()).map(([category, state]) => ({
      category,
      status: state.status,
      failureCount: state.failureCount,
      successCount: state.successCount,
      lastFailureTime: state.lastFailureTime
    }));

    const openCircuits = categoryStates.filter(s => s.status === 'OPEN').length;
    const halfOpenCircuits = categoryStates.filter(s => s.status === 'HALF_OPEN').length;
    const closedCircuits = categoryStates.filter(s => s.status === 'CLOSED').length;

    return {
      config: { ...this.config },
      totalCategories: this.states.size,
      openCircuits,
      halfOpenCircuits,
      closedCircuits,
      categoryStates
    };
  }

  /**
   * Get or create a circuit breaker state for the given category
   *
   * @param category - Error category
   * @returns Circuit breaker state for the category
   */
  private getOrCreateState(category: ErrorCategory): CircuitBreakerState {
    const key = category;

    if (!this.states.has(key)) {
      this.states.set(key, {
        status: 'CLOSED',
        failureCount: 0,
        successCount: 0,
        lastFailureTime: 0
      });
    }

    return this.states.get(key)!;
  }

  /**
   * Transition a circuit breaker to OPEN state
   *
   * @param category - Error category to transition
   */
  private transitionToOpen(category: ErrorCategory): void {
    const state = this.getOrCreateState(category);
    state.status = 'OPEN';
    state.successCount = 0;
    state.lastFailureTime = Date.now();
  }

  /**
   * Transition a circuit breaker to HALF_OPEN state
   *
   * @param category - Error category to transition
   */
  private transitionToHalfOpen(category: ErrorCategory): void {
    const state = this.getOrCreateState(category);
    state.status = 'HALF_OPEN';
    state.failureCount = 0;
    state.successCount = 0;
  }

  /**
   * Transition a circuit breaker to CLOSED state
   *
   * @param category - Error category to transition
   */
  private transitionToClosed(category: ErrorCategory): void {
    const state = this.getOrCreateState(category);
    state.status = 'CLOSED';
    state.failureCount = 0;
    state.successCount = 0;
  }
}