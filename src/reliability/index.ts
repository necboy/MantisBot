/**
 * Error handling module for MantisBot
 *
 * This module provides a comprehensive error handling system with:
 * - Error classification and categorization
 * - Recovery action definitions
 * - Context tracking and debugging support
 * - Unique ID generation utilities
 * - Circuit breaker pattern implementation
 * - Intelligent retry management with multiple backoff strategies
 *
 * @author MantisBot Team
 * @version 1.0.0
 */

// Export all type definitions
export * from './types.js';

// Export error classifier
export * from './error-classifier.js';

// Export circuit breaker
export * from './circuit-breaker.js';

// Export retry manager
export * from './retry-manager.js';

// Export global error handler
export * from './global-error-handler.js';