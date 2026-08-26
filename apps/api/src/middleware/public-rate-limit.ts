/**
 * Public Rate Limiting Middleware
 *
 * IP-based rate limiting for public endpoints (no auth required).
 * Uses DynamoDB for distributed rate limiting across Lambda instances.
 */

import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { Elysia } from "elysia";

import { awsDefaults } from "../lib/aws-defaults";
import { log } from "../lib/logger";
import {
  type RateLimitWindow,
  setRateLimitExceededHeaders,
  setRateLimitHeaders,
} from "../lib/rate-limit-headers";

// Rate limits for public endpoints
const PUBLIC_LIMITS = {
  minute: 10, // 10 requests per minute per IP
  hour: 100, // 100 requests per hour per IP
};

// DynamoDB client (reuse across invocations)
const dynamoClient = new DynamoDBClient(awsDefaults);
const TABLE_NAME = process.env.RATE_LIMIT_TABLE_NAME ?? "RateLimitTable";

/**
 * Get client IP from request headers.
 *
 * Priority:
 * 1. x-source-ip — injected by Lambda handler from API Gateway sourceIp (TCP-level, unspoofable)
 * 2. Rightmost X-Forwarded-For — the IP appended by the last trusted proxy (API Gateway)
 * 3. x-real-ip — fallback
 */
export function getClientIp(request: Request): string {
  // Trusted: injected by Lambda handler from API Gateway event.requestContext.http.sourceIp
  const sourceIp = request.headers.get("x-source-ip");
  if (sourceIp) {
    return sourceIp.trim();
  }

  // Fallback: rightmost XFF IP (appended by API Gateway, not client-controlled)
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const ips = forwardedFor.split(",");
    return ips.at(-1)?.trim() ?? "unknown";
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }

  return "unknown";
}

/**
 * Increment counter and return new value
 */
async function incrementCounter(
  key: string,
  ttlSeconds: number
): Promise<number> {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;

  try {
    const result = await dynamoClient.send(
      new UpdateItemCommand({
        TableName: TABLE_NAME,
        Key: {
          pk: { S: `public-ip:${key}` },
          sk: { S: "rate-limit" },
        },
        UpdateExpression:
          "SET #count = if_not_exists(#count, :zero) + :inc, #exp = :exp",
        ExpressionAttributeNames: {
          "#count": "count",
          "#exp": "expiresAt",
        },
        ExpressionAttributeValues: {
          ":inc": { N: "1" },
          ":zero": { N: "0" },
          ":exp": { N: String(expiresAt) },
        },
        ReturnValues: "UPDATED_NEW",
      })
    );

    return Number(result.Attributes?.count?.N ?? 1);
  } catch (error) {
    // Fail open — log for ops awareness
    log.error("Rate limiter failing open", error, { key });
    return 0;
  }
}

/**
 * Format time window key
 */
function getMinuteKey(ip: string): string {
  const now = new Date();
  const minute = now
    .toISOString()
    .slice(0, 16)
    .replace("T", "-")
    .replace(":", "-");
  return `${ip}:minute:${minute}`;
}

function getHourKey(ip: string): string {
  const now = new Date();
  const hour = now.toISOString().slice(0, 13).replace("T", "-");
  return `${ip}:hour:${hour}`;
}

const MINUTE_SECONDS = 60;
const HOUR_SECONDS = 3600;

/** Seconds left in the current clock minute — the key rolls on that boundary. */
function secondsUntilNextMinute(): number {
  return MINUTE_SECONDS - Math.floor((Date.now() / 1000) % MINUTE_SECONDS);
}

/** Seconds left in the current clock hour, for the same reason. */
function secondsUntilNextHour(): number {
  return HOUR_SECONDS - Math.floor((Date.now() / 1000) % HOUR_SECONDS);
}

/**
 * Public rate limit middleware
 */
export const publicRateLimitMiddleware = new Elysia({
  name: "public-rate-limit",
}).derive({ as: "scoped" }, async ({ request, set }) => {
  const clientIp = getClientIp(request);

  const minuteWindow = (remaining: number): RateLimitWindow => ({
    name: "minute",
    limit: PUBLIC_LIMITS.minute,
    remaining,
    windowSeconds: MINUTE_SECONDS,
    resetSeconds: secondsUntilNextMinute(),
  });
  const hourWindow = (remaining: number): RateLimitWindow => ({
    name: "hour",
    limit: PUBLIC_LIMITS.hour,
    remaining,
    windowSeconds: HOUR_SECONDS,
    resetSeconds: secondsUntilNextHour(),
  });

  // Check minute limit
  const minuteCount = await incrementCounter(getMinuteKey(clientIp), 60);
  if (minuteCount > PUBLIC_LIMITS.minute) {
    set.status = 429;
    setRateLimitExceededHeaders(set, minuteWindow(0), [
      minuteWindow(0),
      hourWindow(0),
    ]);
    throw new Error(
      "Rate limit exceeded. Please wait a minute before trying again."
    );
  }

  // Check hourly limit
  const hourCount = await incrementCounter(getHourKey(clientIp), 3600);
  if (hourCount > PUBLIC_LIMITS.hour) {
    set.status = 429;
    setRateLimitExceededHeaders(set, hourWindow(0), [
      minuteWindow(0),
      hourWindow(0),
    ]);
    throw new Error("Hourly rate limit exceeded. Please try again later.");
  }

  setRateLimitHeaders(set, [
    minuteWindow(PUBLIC_LIMITS.minute - minuteCount),
    hourWindow(PUBLIC_LIMITS.hour - hourCount),
  ]);

  return { clientIp };
});
