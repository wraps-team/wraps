/**
 * Telemetry API endpoint (Next.js Route Handler)
 * Receives telemetry events from CLI and forwards to PostHog
 */

// Deliberately NOT using @wraps/analytics: this reads POSTHOG_API_KEY, not
// POSTHOG_KEY / NEXT_PUBLIC_POSTHOG_KEY, and may point at a different PostHog
// project (CLI telemetry vs product analytics). Unifying the key chain would
// either break this or silently merge two event streams.
import { type NextRequest, NextResponse } from "next/server";
import { PostHog } from "posthog-node";

/**
 * PostHog client singleton for serverless function
 */
let posthogClient: PostHog | null = null;
let posthogInitError: string | null = null;

function getPostHogClient(): PostHog | null {
  if (posthogInitError) {
    return null;
  }

  if (!posthogClient) {
    const apiKey = process.env.POSTHOG_API_KEY;
    const host = process.env.POSTHOG_HOST || "https://us.i.posthog.com";

    if (!apiKey) {
      posthogInitError = "POSTHOG_API_KEY environment variable is not set";
      console.error(
        "[telemetry] POSTHOG_API_KEY not set - CLI telemetry events will be dropped"
      );
      return null;
    }

    try {
      posthogClient = new PostHog(apiKey, {
        host,
        flushAt: 1,
        flushInterval: 0,
      });
    } catch (error) {
      posthogInitError =
        error instanceof Error ? error.message : "Unknown initialization error";
      console.error("[telemetry] PostHog init failed:", posthogInitError);
      return null;
    }
  }

  return posthogClient;
}

// Types
type TelemetryEvent = {
  event: string;
  properties?: Record<string, unknown>;
  anonymousId: string;
  timestamp?: string;
};

type TelemetryRequest = {
  events: TelemetryEvent[];
  batch?: boolean;
};

/**
 * Validate event format
 */
function isValidEvent(event: TelemetryEvent): boolean {
  // Must have event name
  if (!event.event || typeof event.event !== "string") {
    return false;
  }

  // Must have anonymous ID
  if (!event.anonymousId || typeof event.anonymousId !== "string") {
    return false;
  }

  // Event name should follow pattern: category:action (allow hyphens in action names)
  if (!/^[a-z]+:[a-z_:-]+$/.test(event.event)) {
    return false;
  }

  return true;
}

/**
 * Sanitize properties to remove any PII that might have slipped through
 */
function sanitizeProperties(
  properties: Record<string, unknown> = {}
): Record<string, unknown> {
  const sanitized = { ...properties };

  // Remove known PII fields if they somehow got through
  const piiFields = [
    "email",
    "domain",
    "awsAccountId",
    "accountId",
    "accessKey",
    "secretKey",
    "arn",
    "roleArn",
    "sessionToken",
    "apiKey",
    "password",
    "token",
  ];

  for (const field of piiFields) {
    delete sanitized[field];
  }

  // Sanitize nested objects
  for (const key of Object.keys(sanitized)) {
    if (
      typeof sanitized[key] === "object" &&
      sanitized[key] !== null &&
      !Array.isArray(sanitized[key])
    ) {
      sanitized[key] = sanitizeProperties(
        sanitized[key] as Record<string, unknown>
      );
    }
  }

  return sanitized;
}

// Simple in-memory rate limiting (replace with Redis for production)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

/**
 * Check rate limit for anonymousId
 */
function checkRateLimit(anonymousId: string): boolean {
  const enabled = process.env.TELEMETRY_RATE_LIMIT_ENABLED === "true";
  if (!enabled) {
    return true;
  }

  const now = Date.now();
  const limit = Number.parseInt(
    process.env.TELEMETRY_RATE_LIMIT_PER_HOUR || "1000",
    10
  );
  const windowMs = 60 * 60 * 1000; // 1 hour

  const existing = rateLimitMap.get(anonymousId);

  if (existing && existing.resetAt > now) {
    if (existing.count >= limit) {
      return false;
    }
    existing.count++;
    return true;
  }

  // New window
  rateLimitMap.set(anonymousId, {
    count: 1,
    resetAt: now + windowMs,
  });

  return true;
}

/**
 * CORS headers for all responses
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * Handle OPTIONS request (CORS preflight)
 */
export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

/**
 * Telemetry API handler
 */
export async function POST(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(2, 10);

  try {
    const body = (await request.json()) as TelemetryRequest;

    // Validate request
    if (!(body.events && Array.isArray(body.events))) {
      console.warn(
        `[telemetry:${requestId}] Invalid request - missing events array`
      );
      return NextResponse.json(
        { error: "Invalid request: events array required" },
        { status: 400, headers: corsHeaders }
      );
    }

    if (body.events.length === 0) {
      return NextResponse.json(
        { ok: true, processed: 0 },
        { headers: corsHeaders }
      );
    }

    // Validate all events
    const validEvents = body.events.filter(isValidEvent);
    const invalidCount = body.events.length - validEvents.length;

    if (invalidCount > 0) {
      console.warn(
        `[telemetry:${requestId}] ${invalidCount} invalid events filtered out of ${body.events.length} total`
      );
    }

    if (validEvents.length === 0) {
      console.warn(
        `[telemetry:${requestId}] No valid events in request. Event names received:`,
        body.events.map((e) => e.event).join(", ")
      );
      return NextResponse.json(
        { error: "No valid events in request" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Check rate limit (use first event's anonymousId)
    const anonymousId = validEvents[0].anonymousId;
    if (!checkRateLimit(anonymousId)) {
      console.warn(
        `[telemetry:${requestId}] Rate limit exceeded for anonymousId: ${anonymousId.substring(0, 8)}...`
      );
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429, headers: corsHeaders }
      );
    }

    // Get PostHog client
    const posthog = getPostHogClient();

    if (!posthog) {
      console.error(
        `[telemetry:${requestId}] PostHog not available, dropping ${validEvents.length} events`
      );
      return NextResponse.json(
        { ok: true, processed: 0 },
        { headers: corsHeaders }
      );
    }

    // Send to PostHog
    for (const event of validEvents) {
      const sanitizedProperties = sanitizeProperties(event.properties);

      posthog.capture({
        distinctId: event.anonymousId,
        event: event.event,
        properties: sanitizedProperties,
        timestamp: event.timestamp ? new Date(event.timestamp) : undefined,
      });
    }

    // Flush events before returning (critical for serverless functions)
    try {
      await posthog.flush();
    } catch (flushError) {
      console.error(
        `[telemetry:${requestId}] PostHog flush failed for ${validEvents.length} events:`,
        flushError
      );
      return NextResponse.json(
        { ok: true, processed: 0 },
        { headers: corsHeaders }
      );
    }

    // Return success
    return NextResponse.json(
      {
        ok: true,
        processed: validEvents.length,
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error(`[telemetry:${requestId}] Unexpected error:`, error);

    // Always return 200 to CLI (don't break their workflow)
    return NextResponse.json(
      {
        ok: true,
        processed: 0,
        error: "Internal error",
      },
      { headers: corsHeaders }
    );
  }
}
