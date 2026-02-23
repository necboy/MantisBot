/**
 * Error handling type definitions for MantisBot
 *
 * This module defines the core types and enums used throughout the error handling system.
 * It provides a comprehensive classification system for errors and recovery actions.
 *
 * @author MantisBot Team
 * @version 1.0.0
 */

/**
 * Categories for classifying different types of errors
 * Used to determine appropriate handling strategies
 */
export enum ErrorCategory {
  /** Business logic or domain-specific errors */
  BUSINESS = 'BUSINESS',

  /** Network connectivity and communication errors */
  NETWORK = 'NETWORK',

  /** External service failures (APIs, databases, etc.) */
  EXTERNAL_SERVICE = 'EXTERNAL_SERVICE',

  /** System-level errors (memory, disk, permissions) */
  SYSTEM = 'SYSTEM',

  /** User input validation and formatting errors */
  USER_INPUT = 'USER_INPUT',

  /** Configuration and setup errors */
  CONFIGURATION = 'CONFIGURATION',

  /** Unclassified or unexpected errors */
  UNKNOWN = 'UNKNOWN'
}

/**
 * Severity levels for errors
 * Used to prioritize error handling and determine escalation
 */
export enum ErrorSeverity {
  /** Low impact, non-critical errors */
  LOW = 'LOW',

  /** Medium impact, may affect functionality */
  MEDIUM = 'MEDIUM',

  /** High impact, significant functionality degradation */
  HIGH = 'HIGH',

  /** Critical errors that may cause system failure */
  CRITICAL = 'CRITICAL'
}

/**
 * Context information associated with an error
 * Provides traceability and debugging information
 */
export interface ErrorContext {
  /** Unique identifier for the request that caused the error */
  requestId: string;

  /** Session identifier (optional) */
  sessionId?: string;

  /** Agent identifier that was processing the request (optional) */
  agentId?: string;

  /** Channel identifier where the error occurred (optional) */
  channelId?: string;

  /** Timestamp when the error context was created */
  timestamp: number;

  /** Additional metadata relevant to the error */
  metadata?: Record<string, any>;
}

/**
 * Configuration for retry operations
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts: number;

  /** Initial delay in milliseconds */
  delayMs: number;

  /** Backoff factor for exponential backoff */
  backoffFactor?: number;

  /** Maximum delay between retries in milliseconds */
  maxDelayMs?: number;
}

/**
 * Recovery action that can be taken to handle an error
 */
export interface RecoveryAction {
  /** Type of recovery action */
  type: string;

  /** Human-readable description of the action */
  description: string;

  /** Whether this action can be executed automatically */
  automatic: boolean;

  /** Retry configuration if this is a retry action */
  retryConfig?: RetryConfig;

  /** Additional parameters for the recovery action */
  parameters?: Record<string, any>;
}

/**
 * A classified error with category, severity, and recovery information
 */
export interface ClassifiedError {
  /** Unique identifier for this error instance */
  id: string;

  /** Error category for classification */
  category: ErrorCategory;

  /** Error severity level */
  severity: ErrorSeverity;

  /** Human-readable error message */
  message: string;

  /** Original error object that caused this classified error (optional) */
  originalError?: Error;

  /** Context information about when and where the error occurred */
  context: ErrorContext;

  /** List of suggested recovery actions */
  suggestedActions?: RecoveryAction[];

  /** Whether this error is potentially recoverable */
  recoverable: boolean;

  /** Timestamp when the error was classified */
  timestamp: number;

  /** Additional error-specific data */
  data?: Record<string, any>;
}

/**
 * Result of an error handling attempt
 */
export interface ErrorHandlingResult {
  /** Whether the error handling was successful */
  success: boolean;

  /** The action that was taken to handle the error */
  action: string;

  /** Descriptive message about the handling result */
  message: string;

  /** Error that occurred during handling (if any) */
  error?: Error;

  /** Number of retry attempts made */
  retryCount?: number;

  /** Total time spent handling the error in milliseconds */
  totalTimeMs?: number;

  /** Additional result data */
  data?: Record<string, any>;
}

/**
 * Generates a unique, readable error ID
 * Format: err-{8-char-hash}-{4-char-suffix}
 *
 * @returns A unique error identifier
 */
export function generateErrorId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  const hash = (timestamp + random).substring(0, 8);
  const suffix = Math.random().toString(36).substring(2, 6);

  return `err-${hash}-${suffix}`;
}

/**
 * Generates a unique, readable request ID
 * Format: req-{8-char-hash}-{4-char-suffix}
 *
 * @returns A unique request identifier
 */
export function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  const hash = (timestamp + random).substring(0, 8);
  const suffix = Math.random().toString(36).substring(2, 6);

  return `req-${hash}-${suffix}`;
}