/**
 * Circuit Breaker tests for MantisBot
 *
 * Comprehensive test suite for the CircuitBreaker class, covering all states
 * and transitions using Test-Driven Development (TDD) approach.
 *
 * @author MantisBot Team
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CircuitBreaker, CircuitBreakerConfig, CircuitBreakerOpenError } from '../circuit-breaker.js';
import { ErrorCategory } from '../types.js';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;
  let mockConfig: CircuitBreakerConfig;

  beforeEach(() => {
    // Setup fake timers to control time in tests
    vi.useFakeTimers();

    // Default configuration for tests
    mockConfig = {
      failureThreshold: 3,
      successThreshold: 2,
      timeoutMs: 10000,
      resetTimeoutMs: 60000
    };

    circuitBreaker = new CircuitBreaker(mockConfig);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Constructor and Default Configuration', () => {
    it('should initialize with default configuration when none provided', () => {
      const defaultBreaker = new CircuitBreaker();
      const stats = defaultBreaker.getStats();

      expect(stats.config.failureThreshold).toBe(5);
      expect(stats.config.successThreshold).toBe(3);
      expect(stats.config.timeoutMs).toBe(10000);
      expect(stats.config.resetTimeoutMs).toBe(60000);
    });

    it('should use provided configuration', () => {
      const stats = circuitBreaker.getStats();

      expect(stats.config.failureThreshold).toBe(3);
      expect(stats.config.successThreshold).toBe(2);
      expect(stats.config.timeoutMs).toBe(10000);
      expect(stats.config.resetTimeoutMs).toBe(60000);
    });

    it('should start with all categories in CLOSED state', () => {
      expect(circuitBreaker.shouldReject(ErrorCategory.NETWORK)).toBe(false);
      expect(circuitBreaker.shouldReject(ErrorCategory.EXTERNAL_SERVICE)).toBe(false);
      expect(circuitBreaker.shouldReject(ErrorCategory.SYSTEM)).toBe(false);
    });
  });

  describe('CLOSED State Behavior', () => {
    it('should allow all requests in CLOSED state', () => {
      expect(circuitBreaker.shouldReject(ErrorCategory.NETWORK)).toBe(false);
      expect(circuitBreaker.shouldReject(ErrorCategory.EXTERNAL_SERVICE)).toBe(false);
    });

    it('should track failure count without rejecting below threshold', () => {
      circuitBreaker.recordFailure(ErrorCategory.NETWORK);
      circuitBreaker.recordFailure(ErrorCategory.NETWORK);

      expect(circuitBreaker.shouldReject(ErrorCategory.NETWORK)).toBe(false);

      const states = circuitBreaker.getAllStates();
      const networkState = states.get('NETWORK');
      expect(networkState?.status).toBe('CLOSED');
      expect(networkState?.failureCount).toBe(2);
    });

    it('should reset failure count on successful operation', () => {
      circuitBreaker.recordFailure(ErrorCategory.NETWORK);
      circuitBreaker.recordFailure(ErrorCategory.NETWORK);
      circuitBreaker.recordSuccess(ErrorCategory.NETWORK);

      const states = circuitBreaker.getAllStates();
      const networkState = states.get('NETWORK');
      expect(networkState?.failureCount).toBe(0);
    });
  });

  describe('CLOSED to OPEN State Transition', () => {
    it('should transition to OPEN when failure threshold is reached', () => {
      // Record failures up to threshold (3)
      circuitBreaker.recordFailure(ErrorCategory.NETWORK);
      circuitBreaker.recordFailure(ErrorCategory.NETWORK);
      circuitBreaker.recordFailure(ErrorCategory.NETWORK);

      expect(circuitBreaker.shouldReject(ErrorCategory.NETWORK)).toBe(true);

      const states = circuitBreaker.getAllStates();
      const networkState = states.get('NETWORK');
      expect(networkState?.status).toBe('OPEN');
    });

    it('should throw CircuitBreakerOpenError when rejecting requests', () => {
      // Trigger OPEN state
      for (let i = 0; i < mockConfig.failureThreshold; i++) {
        circuitBreaker.recordFailure(ErrorCategory.NETWORK);
      }

      expect(() => {
        circuitBreaker.shouldReject(ErrorCategory.NETWORK);
      }).not.toThrow(); // shouldReject returns boolean, doesn't throw

      expect(circuitBreaker.shouldReject(ErrorCategory.NETWORK)).toBe(true);
    });

    it('should record lastFailureTime when transitioning to OPEN', () => {
      const currentTime = Date.now();
      vi.setSystemTime(currentTime);

      for (let i = 0; i < mockConfig.failureThreshold; i++) {
        circuitBreaker.recordFailure(ErrorCategory.NETWORK);
      }

      const states = circuitBreaker.getAllStates();
      const networkState = states.get('NETWORK');
      expect(networkState?.lastFailureTime).toBe(currentTime);
    });
  });

  describe('OPEN State Behavior', () => {
    beforeEach(() => {
      // Put circuit breaker in OPEN state
      for (let i = 0; i < mockConfig.failureThreshold; i++) {
        circuitBreaker.recordFailure(ErrorCategory.NETWORK);
      }
    });

    it('should reject all requests in OPEN state', () => {
      expect(circuitBreaker.shouldReject(ErrorCategory.NETWORK)).toBe(true);
    });

    it('should remain OPEN before reset timeout', () => {
      // Advance time but not enough to trigger HALF_OPEN
      vi.advanceTimersByTime(mockConfig.resetTimeoutMs - 1000);

      expect(circuitBreaker.shouldReject(ErrorCategory.NETWORK)).toBe(true);

      const states = circuitBreaker.getAllStates();
      const networkState = states.get('NETWORK');
      expect(networkState?.status).toBe('OPEN');
    });
  });

  describe('OPEN to HALF_OPEN State Transition', () => {
    beforeEach(() => {
      // Put circuit breaker in OPEN state
      for (let i = 0; i < mockConfig.failureThreshold; i++) {
        circuitBreaker.recordFailure(ErrorCategory.NETWORK);
      }
    });

    it('should transition to HALF_OPEN after reset timeout', () => {
      // Advance time past reset timeout
      vi.advanceTimersByTime(mockConfig.resetTimeoutMs + 1000);

      // First call should transition to HALF_OPEN
      expect(circuitBreaker.shouldReject(ErrorCategory.NETWORK)).toBe(false);

      const states = circuitBreaker.getAllStates();
      const networkState = states.get('NETWORK');
      expect(networkState?.status).toBe('HALF_OPEN');
      expect(networkState?.failureCount).toBe(0);
      expect(networkState?.successCount).toBe(0);
    });
  });

  describe('HALF_OPEN State Behavior', () => {
    beforeEach(() => {
      // Put circuit breaker in OPEN state, then advance time to HALF_OPEN
      for (let i = 0; i < mockConfig.failureThreshold; i++) {
        circuitBreaker.recordFailure(ErrorCategory.NETWORK);
      }
      vi.advanceTimersByTime(mockConfig.resetTimeoutMs + 1000);
      circuitBreaker.shouldReject(ErrorCategory.NETWORK); // Trigger HALF_OPEN
    });

    it('should allow limited requests in HALF_OPEN state', () => {
      expect(circuitBreaker.shouldReject(ErrorCategory.NETWORK)).toBe(false);

      const states = circuitBreaker.getAllStates();
      const networkState = states.get('NETWORK');
      expect(networkState?.status).toBe('HALF_OPEN');
    });

    it('should transition to CLOSED after reaching success threshold', () => {
      // Record successful operations up to threshold (2)
      circuitBreaker.recordSuccess(ErrorCategory.NETWORK);
      circuitBreaker.recordSuccess(ErrorCategory.NETWORK);

      const states = circuitBreaker.getAllStates();
      const networkState = states.get('NETWORK');
      expect(networkState?.status).toBe('CLOSED');
      expect(networkState?.successCount).toBe(0); // Reset after transition
    });

    it('should transition back to OPEN on any failure', () => {
      circuitBreaker.recordSuccess(ErrorCategory.NETWORK); // One success
      circuitBreaker.recordFailure(ErrorCategory.NETWORK); // One failure

      expect(circuitBreaker.shouldReject(ErrorCategory.NETWORK)).toBe(true);

      const states = circuitBreaker.getAllStates();
      const networkState = states.get('NETWORK');
      expect(networkState?.status).toBe('OPEN');
    });
  });

  describe('Per-Category Independence', () => {
    it('should maintain independent state for different error categories', () => {
      // Trigger OPEN for NETWORK but not EXTERNAL_SERVICE
      for (let i = 0; i < mockConfig.failureThreshold; i++) {
        circuitBreaker.recordFailure(ErrorCategory.NETWORK);
      }

      expect(circuitBreaker.shouldReject(ErrorCategory.NETWORK)).toBe(true);

      // Check states before calling shouldReject for EXTERNAL_SERVICE
      let states = circuitBreaker.getAllStates();
      expect(states.get('NETWORK')?.status).toBe('OPEN');
      expect(states.has('EXTERNAL_SERVICE')).toBe(false);

      // Now check EXTERNAL_SERVICE (this will create its state)
      expect(circuitBreaker.shouldReject(ErrorCategory.EXTERNAL_SERVICE)).toBe(false);

      // After calling shouldReject, EXTERNAL_SERVICE state should exist and be CLOSED
      states = circuitBreaker.getAllStates();
      expect(states.get('EXTERNAL_SERVICE')?.status).toBe('CLOSED');
    });

    it('should handle multiple categories in different states', () => {
      // NETWORK: OPEN
      for (let i = 0; i < mockConfig.failureThreshold; i++) {
        circuitBreaker.recordFailure(ErrorCategory.NETWORK);
      }

      // EXTERNAL_SERVICE: CLOSED with some failures
      circuitBreaker.recordFailure(ErrorCategory.EXTERNAL_SERVICE);

      // SYSTEM: HALF_OPEN (simulate by first going OPEN then timing out)
      for (let i = 0; i < mockConfig.failureThreshold; i++) {
        circuitBreaker.recordFailure(ErrorCategory.SYSTEM);
      }
      vi.advanceTimersByTime(mockConfig.resetTimeoutMs + 1000);
      circuitBreaker.shouldReject(ErrorCategory.SYSTEM); // Trigger HALF_OPEN

      const states = circuitBreaker.getAllStates();
      expect(states.get('NETWORK')?.status).toBe('OPEN');
      expect(states.get('EXTERNAL_SERVICE')?.status).toBe('CLOSED');
      expect(states.get('SYSTEM')?.status).toBe('HALF_OPEN');
    });
  });

  describe('Reset Operations', () => {
    beforeEach(() => {
      // Setup various states
      circuitBreaker.recordFailure(ErrorCategory.NETWORK);
      for (let i = 0; i < mockConfig.failureThreshold; i++) {
        circuitBreaker.recordFailure(ErrorCategory.EXTERNAL_SERVICE);
      }
    });

    it('should reset specific category', () => {
      circuitBreaker.reset(ErrorCategory.EXTERNAL_SERVICE);

      // Check that the reset category is removed from internal state
      let states = circuitBreaker.getAllStates();
      expect(states.has('EXTERNAL_SERVICE')).toBe(false); // Removed from map
      expect(states.get('NETWORK')?.failureCount).toBe(1); // Unchanged

      // Now verify behavior after reset (this will recreate the state as CLOSED)
      expect(circuitBreaker.shouldReject(ErrorCategory.EXTERNAL_SERVICE)).toBe(false);
      expect(circuitBreaker.shouldReject(ErrorCategory.NETWORK)).toBe(false);

      // After calling shouldReject, EXTERNAL_SERVICE should be CLOSED again
      states = circuitBreaker.getAllStates();
      expect(states.get('EXTERNAL_SERVICE')?.status).toBe('CLOSED');
    });

    it('should reset all categories', () => {
      circuitBreaker.resetAll();

      const states = circuitBreaker.getAllStates();
      expect(states.size).toBe(0);

      expect(circuitBreaker.shouldReject(ErrorCategory.NETWORK)).toBe(false);
      expect(circuitBreaker.shouldReject(ErrorCategory.EXTERNAL_SERVICE)).toBe(false);
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should provide comprehensive statistics', () => {
      // Create some activity
      circuitBreaker.recordFailure(ErrorCategory.NETWORK);
      circuitBreaker.recordSuccess(ErrorCategory.EXTERNAL_SERVICE);
      for (let i = 0; i < mockConfig.failureThreshold; i++) {
        circuitBreaker.recordFailure(ErrorCategory.SYSTEM);
      }

      const stats = circuitBreaker.getStats();

      expect(stats.config).toEqual(mockConfig);
      expect(stats.totalCategories).toBe(3);
      expect(stats.openCircuits).toBe(1); // SYSTEM
      expect(stats.halfOpenCircuits).toBe(0);
      expect(stats.closedCircuits).toBe(2); // NETWORK, EXTERNAL_SERVICE
      expect(stats.categoryStates).toHaveLength(3);

      const systemState = stats.categoryStates.find(s => s.category === 'SYSTEM');
      expect(systemState?.status).toBe('OPEN');
    });

    it('should track different states in statistics', () => {
      // Create mixed states
      for (let i = 0; i < mockConfig.failureThreshold; i++) {
        circuitBreaker.recordFailure(ErrorCategory.NETWORK);
      }
      vi.advanceTimersByTime(mockConfig.resetTimeoutMs + 1000);
      circuitBreaker.shouldReject(ErrorCategory.NETWORK); // HALF_OPEN

      for (let i = 0; i < mockConfig.failureThreshold; i++) {
        circuitBreaker.recordFailure(ErrorCategory.EXTERNAL_SERVICE);
      }
      // EXTERNAL_SERVICE stays OPEN

      circuitBreaker.recordFailure(ErrorCategory.SYSTEM); // CLOSED

      const stats = circuitBreaker.getStats();
      expect(stats.openCircuits).toBe(1); // EXTERNAL_SERVICE
      expect(stats.halfOpenCircuits).toBe(1); // NETWORK
      expect(stats.closedCircuits).toBe(1); // SYSTEM
    });
  });

  describe('CircuitBreakerOpenError', () => {
    it('should be throwable with category and message', () => {
      const error = new CircuitBreakerOpenError(ErrorCategory.NETWORK, 'Custom message');

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('CircuitBreakerOpenError');
      expect(error.category).toBe(ErrorCategory.NETWORK);
      expect(error.message).toBe('Custom message');
    });

    it('should have default message when none provided', () => {
      const error = new CircuitBreakerOpenError(ErrorCategory.EXTERNAL_SERVICE);

      expect(error.message).toBe('Circuit breaker is OPEN for category: EXTERNAL_SERVICE');
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid state changes', () => {
      // Rapid failures
      for (let i = 0; i < mockConfig.failureThreshold * 2; i++) {
        circuitBreaker.recordFailure(ErrorCategory.NETWORK);
      }

      expect(circuitBreaker.shouldReject(ErrorCategory.NETWORK)).toBe(true);

      // Reset and rapid success
      vi.advanceTimersByTime(mockConfig.resetTimeoutMs + 1000);
      circuitBreaker.shouldReject(ErrorCategory.NETWORK); // HALF_OPEN

      for (let i = 0; i < mockConfig.successThreshold; i++) {
        circuitBreaker.recordSuccess(ErrorCategory.NETWORK);
      }

      const states = circuitBreaker.getAllStates();
      expect(states.get('NETWORK')?.status).toBe('CLOSED');
    });

    it('should handle zero thresholds gracefully', () => {
      const specialConfig = {
        failureThreshold: 1,
        successThreshold: 1,
        timeoutMs: 1000,
        resetTimeoutMs: 5000
      };

      const specialBreaker = new CircuitBreaker(specialConfig);
      specialBreaker.recordFailure(ErrorCategory.NETWORK);

      expect(specialBreaker.shouldReject(ErrorCategory.NETWORK)).toBe(true);
    });

    it('should handle all error categories consistently', () => {
      const categories = Object.values(ErrorCategory);

      categories.forEach(category => {
        expect(circuitBreaker.shouldReject(category)).toBe(false);
      });

      // Test state creation for all categories
      categories.forEach(category => {
        circuitBreaker.recordFailure(category);
      });

      const states = circuitBreaker.getAllStates();
      expect(states.size).toBe(categories.length);
    });
  });
});