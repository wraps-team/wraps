/**
 * Structured logging with Pino
 *
 * Usage:
 * ```typescript
 * import { logger, createRequestLogger } from '@/lib/logger';
 *
 * // Basic logging
 * logger.info({ userId: '123' }, 'User logged in');
 *
 * // With request context (in API routes/server actions)
 * const log = createRequestLogger({ requestId, orgSlug, userId });
 * log.info('Processing request');
 * log.error({ err }, 'Operation failed');
 * ```
 *
 * Logs go to stdout. Use Vercel Log Drains to forward to Axiom/Datadog.
 */

import * as Sentry from "@sentry/nextjs";
import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

/**
 * `{ err }` arrives in two shapes: a real Error, or serializeError() output
 * (a plain object). Return the ORIGINAL Error untouched when given one —
 * Sentry skips an Error object it has already captured, which is what keeps
 * a call site that also calls Sentry.captureException from double-reporting.
 */
function toError(value: unknown): Error | undefined {
  if (value instanceof Error) {
    return value;
  }
  if (value && typeof value === "object" && "message" in value) {
    const source = value as {
      message: unknown;
      name?: unknown;
      stack?: unknown;
    };
    const error = new Error(String(source.message));
    error.name = String(source.name ?? "Error");
    if (typeof source.stack === "string") {
      error.stack = source.stack;
    }
    return error;
  }
  return;
}

/**
 * Error-level logs are incidents by default. Pass `reportToSentry: false` in
 * the log object for failures that are expected and the customer's to fix
 * (e.g. an AWS permission the customer has not granted) — log those at warn
 * instead where possible.
 */
function withErrorForwarding(base: pino.Logger): pino.Logger {
  const originalError = base.error.bind(base);
  const wrappedError = (...args: Parameters<typeof originalError>) => {
    originalError(...args);
    const [firstArg, secondArg] = args;
    if (!firstArg || typeof firstArg !== "object" || Array.isArray(firstArg)) {
      return;
    }
    const fields = firstArg as Record<string, unknown>;
    if (fields.reportToSentry === false) {
      return;
    }
    const error = toError(fields.err);
    if (error) {
      Sentry.captureException(error, {
        extra: {
          message: typeof secondArg === "string" ? secondArg : undefined,
        },
      });
    }
  };
  return Object.assign(base, { error: wrappedError });
}

/**
 * Create the base logger
 *
 * Logs to stdout in all environments. Axiom ingestion is handled by
 * Vercel Log Drains — pino.transport() is incompatible with bundled
 * serverless runtimes (Turbopack/webpack can't resolve transports at runtime).
 */
function createLogger(): pino.Logger {
  return pino({
    level: isDev ? "debug" : "info",
    base: {
      service: "wraps-web",
      env: process.env.NODE_ENV || "development",
    },
    formatters: {
      level: (label) => ({ level: label }),
    },
    serializers: { err: pino.stdSerializers.err },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

/**
 * Main logger instance
 *
 * Every exported logger factory below derives from this unwrapped root and
 * wraps its own child exactly once. In pino 10.1.0, `child(bindings)` with no
 * options returns `Object.create(parent)`, so a child inherits the parent's
 * `.error` own property — wrapping a child of an already-wrapped logger would
 * forward to Sentry twice.
 */
const rootLogger = createLogger();
export const logger = withErrorForwarding(rootLogger.child({}));

/**
 * Request context for logging
 */
export type RequestContext = {
  requestId?: string;
  orgSlug?: string;
  organizationId?: string;
  userId?: string;
  accountId?: string;
  path?: string;
  method?: string;
};

/**
 * Create a child logger with request context
 *
 * @example
 * ```typescript
 * export async function POST(req: Request) {
 *   const log = createRequestLogger({
 *     requestId: req.headers.get('x-request-id'),
 *     orgSlug: 'acme',
 *     userId: session.user.id,
 *   });
 *
 *   log.info('Starting operation');
 *   try {
 *     // ... do work
 *     log.info({ result }, 'Operation completed');
 *   } catch (err) {
 *     log.error({ err }, 'Operation failed');
 *   }
 * }
 * ```
 */
export function createRequestLogger(context: RequestContext): pino.Logger {
  return withErrorForwarding(
    rootLogger.child({
      ...context,
      // Filter out undefined values
      ...(context.requestId && { requestId: context.requestId }),
      ...(context.orgSlug && { org: context.orgSlug }),
      ...(context.userId && { user: context.userId }),
      ...(context.accountId && { awsAccount: context.accountId }),
    })
  );
}

/**
 * Create a logger for server actions
 *
 * @example
 * ```typescript
 * export async function createContact(formData: FormData) {
 *   const log = createActionLogger('createContact', { orgSlug, userId });
 *   log.info('Creating contact');
 *   // ...
 * }
 * ```
 */
export function createActionLogger(
  actionName: string,
  context: Omit<RequestContext, "path" | "method">
): pino.Logger {
  return withErrorForwarding(
    rootLogger.child({ action: actionName, ...context })
  );
}

/**
 * Utility to safely serialize errors for logging
 */
export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const serialized: Record<string, unknown> = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
    // Include any additional properties (like AWS error codes)
    for (const key of Object.keys(error)) {
      if (!(key in serialized)) {
        serialized[key] = (error as unknown as Record<string, unknown>)[key];
      }
    }
    return serialized;
  }
  return { error: String(error) };
}

export type { Logger } from "pino";
