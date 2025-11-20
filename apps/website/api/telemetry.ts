/**
 * Telemetry API endpoint (Vercel Serverless Function)
 * Receives telemetry events from CLI and forwards to PostHog
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPostHogClient } from "../src/lib/posthog";

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

  // Event name should follow pattern: category:action
  if (!/^[a-z]+:[a-z_:]+$/.test(event.event)) {
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
 * Telemetry API handler
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.status(200).end();
    return;
  }

  // Only accept POST
  if (req.method !== "POST") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const body = req.body as TelemetryRequest;

    // Validate request
    if (!(body.events && Array.isArray(body.events))) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.status(400).json({ error: "Invalid request: events array required" });
      return;
    }

    if (body.events.length === 0) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.status(200).json({ ok: true, processed: 0 });
      return;
    }

    // Validate all events
    const validEvents = body.events.filter(isValidEvent);

    if (validEvents.length === 0) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.status(400).json({ error: "No valid events in request" });
      return;
    }

    // Check rate limit (use first event's anonymousId)
    const anonymousId = validEvents[0].anonymousId;
    if (!checkRateLimit(anonymousId)) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.status(429).json({ error: "Rate limit exceeded" });
      return;
    }

    // Send to PostHog
    const posthog = getPostHogClient();

    for (const event of validEvents) {
      const sanitizedProperties = sanitizeProperties(event.properties);

      posthog.capture({
        distinctId: event.anonymousId,
        event: event.event,
        properties: sanitizedProperties,
        timestamp: event.timestamp ? new Date(event.timestamp) : undefined,
      });
    }

    // Return success (PostHog batches internally)
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).json({
      ok: true,
      processed: validEvents.length,
    });
  } catch (error) {
    console.error("Telemetry API error:", error);

    // Always return 200 to CLI (don't break their workflow)
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).json({
      ok: true,
      processed: 0,
      error: "Internal error",
    });
  }
}
