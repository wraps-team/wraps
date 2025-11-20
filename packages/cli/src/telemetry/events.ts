/**
 * Event tracking helpers for Wraps CLI
 * @module telemetry/events
 */

import { getTelemetryClient } from "./client.js";

/**
 * Track CLI command execution
 *
 * @param command - Command name (e.g., "email:init", "status")
 * @param metadata - Additional metadata about command execution
 *
 * @example
 * ```typescript
 * trackCommand('email:init', {
 *   success: true,
 *   duration_ms: 1500,
 *   preset: 'production'
 * });
 * ```
 */
export function trackCommand(
  command: string,
  metadata?: {
    success?: boolean;
    duration_ms?: number;
    preset?: string;
    provider?: string;
    service?: string;
    [key: string]: unknown;
  }
): void {
  const client = getTelemetryClient();

  // Sanitize metadata to ensure no PII
  const sanitized = metadata ? { ...metadata } : {};

  // Remove any potentially sensitive fields
  sanitized.domain = undefined;
  sanitized.accountId = undefined;
  sanitized.email = undefined;

  client.track(`command:${command}`, sanitized);
}

/**
 * Track service initialization
 *
 * @param service - Service type (email, sms, etc.)
 * @param success - Whether initialization succeeded
 * @param metadata - Additional metadata
 *
 * @example
 * ```typescript
 * trackServiceInit('email', true, {
 *   preset: 'production',
 *   provider: 'vercel'
 * });
 * ```
 */
export function trackServiceInit(
  service: string,
  success: boolean,
  metadata?: {
    preset?: string;
    provider?: string;
    features?: string[];
    duration_ms?: number;
    [key: string]: unknown;
  }
): void {
  const client = getTelemetryClient();

  client.track("service:init", {
    service,
    success,
    ...metadata,
  });
}

/**
 * Track service deployment
 *
 * @param service - Service type (email, sms, etc.)
 * @param metadata - Deployment metadata
 *
 * @example
 * ```typescript
 * trackServiceDeployed('email', {
 *   duration_ms: 45000,
 *   features: ['tracking', 'history']
 * });
 * ```
 */
export function trackServiceDeployed(
  service: string,
  metadata?: {
    duration_ms?: number;
    features?: string[];
    preset?: string;
    [key: string]: unknown;
  }
): void {
  const client = getTelemetryClient();

  client.track("service:deployed", {
    service,
    ...metadata,
  });
}

/**
 * Track dashboard/console start
 *
 * @param mode - Console mode (local or hosted)
 * @param metadata - Additional metadata
 *
 * @example
 * ```typescript
 * trackConsoleStart('local', { port: 3100 });
 * ```
 */
export function trackConsoleStart(
  mode: "local" | "hosted",
  metadata?: Record<string, unknown>
): void {
  const client = getTelemetryClient();

  client.track("console:started", {
    mode,
    ...metadata,
  });
}

/**
 * Track console stop
 *
 * @param metadata - Stop metadata (e.g., duration)
 *
 * @example
 * ```typescript
 * trackConsoleStop({ duration_s: 300 });
 * ```
 */
export function trackConsoleStop(metadata?: {
  duration_s?: number;
  [key: string]: unknown;
}): void {
  const client = getTelemetryClient();

  client.track("console:stopped", metadata || {});
}

/**
 * Track error occurrence
 *
 * IMPORTANT: Never include error messages, only error codes
 * Error messages may contain sensitive information
 *
 * @param errorCode - Error code (e.g., "AWS_CREDENTIALS_INVALID")
 * @param command - Command where error occurred
 * @param metadata - Additional metadata
 *
 * @example
 * ```typescript
 * trackError('AWS_CREDENTIALS_INVALID', 'email:init', {
 *   step: 'credential_validation'
 * });
 * ```
 */
export function trackError(
  errorCode: string,
  command: string,
  metadata?: Record<string, unknown>
): void {
  const client = getTelemetryClient();

  client.track("error:occurred", {
    error_code: errorCode,
    command,
    ...metadata,
  });
}

/**
 * Track feature usage
 *
 * @param feature - Feature name
 * @param metadata - Feature metadata
 *
 * @example
 * ```typescript
 * trackFeature('domain_verified', {
 *   dns_provider: 'route53',
 *   auto_detected: true
 * });
 * ```
 */
export function trackFeature(
  feature: string,
  metadata?: Record<string, unknown>
): void {
  const client = getTelemetryClient();

  client.track(`feature:${feature}`, metadata || {});
}

/**
 * Track service upgrade
 *
 * @param service - Service type
 * @param metadata - Upgrade metadata
 *
 * @example
 * ```typescript
 * trackServiceUpgrade('email', {
 *   from_preset: 'starter',
 *   to_preset: 'production',
 *   added_features: ['history', 'dedicated_ip']
 * });
 * ```
 */
export function trackServiceUpgrade(
  service: string,
  metadata?: {
    from_preset?: string;
    to_preset?: string;
    added_features?: string[];
    [key: string]: unknown;
  }
): void {
  const client = getTelemetryClient();

  client.track("service:upgraded", {
    service,
    ...metadata,
  });
}

/**
 * Track service removal
 *
 * @param service - Service type
 * @param metadata - Removal metadata
 *
 * @example
 * ```typescript
 * trackServiceRemoved('email', { reason: 'user_initiated' });
 * ```
 */
export function trackServiceRemoved(
  service: string,
  metadata?: Record<string, unknown>
): void {
  const client = getTelemetryClient();

  client.track("service:removed", {
    service,
    ...metadata,
  });
}
