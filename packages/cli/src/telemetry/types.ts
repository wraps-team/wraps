/**
 * Telemetry types for Wraps CLI
 * @module telemetry/types
 */

/**
 * Telemetry configuration stored locally
 */
export type TelemetryConfig = {
  enabled: boolean;
  anonymousId: string;
  notificationShown: boolean;
};

/**
 * Telemetry event structure sent to the backend
 */
export type TelemetryEvent = {
  event: string;
  properties?: Record<string, unknown>;
  anonymousId: string;
  timestamp?: string;
};

/**
 * Options for initializing the telemetry client
 */
export type TelemetryClientOptions = {
  endpoint?: string;
  timeout?: number;
  debug?: boolean;
};

/**
 * Request body structure for telemetry API
 */
export type TelemetryRequest = {
  events: TelemetryEvent[];
  batch?: boolean;
};

/**
 * Response structure from telemetry API
 */
export type TelemetryResponse = {
  ok: boolean;
  processed: number;
  error?: string;
};
