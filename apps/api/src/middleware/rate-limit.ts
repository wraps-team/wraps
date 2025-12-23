/**
 * Rate Limiting Middleware
 *
 * Uses DynamoDB for fast atomic counters with TTL cleanup.
 * Enforces both per-minute and daily limits based on plan.
 */

import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { Elysia } from "elysia";

import type { AuthContext } from "./auth";

// Plan rate limits (requests)
const PLAN_LIMITS = {
  starter: { daily: 50_000, minute: 500 },
  pro: { daily: 200_000, minute: 2000 },
  growth: { daily: 500_000, minute: 5000 },
  scale: { daily: 1_000_000, minute: 10_000 },
} as const;

// DynamoDB client (reuse across invocations)
const dynamoClient = new DynamoDBClient({});
const TABLE_NAME = process.env.RATE_LIMIT_TABLE_NAME ?? "RateLimitTable";

export const rateLimitMiddleware = new Elysia({ name: "rate-limit" }).derive(
  async (ctx) => {
    const authContext = (ctx as unknown as { auth: AuthContext }).auth;

    if (!authContext) {
      // Auth middleware should have already set this
      return {};
    }

    const { set } = ctx;

    const { organizationId, planId } = authContext;
    const limits =
      PLAN_LIMITS[planId as keyof typeof PLAN_LIMITS] ?? PLAN_LIMITS.starter;

    const now = new Date();
    const minuteKey = formatMinuteKey(now);
    const dailyKey = formatDailyKey(now);

    try {
      // Check and increment minute counter
      const minuteResult = await incrementCounter(
        organizationId,
        `minute:${minuteKey}`,
        60 // 60 second TTL
      );

      if (minuteResult > limits.minute) {
        set.status = 429;
        set.headers["Retry-After"] = "60";
        set.headers["X-RateLimit-Limit"] = String(limits.minute);
        set.headers["X-RateLimit-Remaining"] = "0";
        throw new Error(
          `Rate limit exceeded: ${limits.minute} requests per minute`
        );
      }

      // Check and increment daily counter
      const dailyResult = await incrementCounter(
        organizationId,
        `daily:${dailyKey}`,
        86_400 // 24 hour TTL
      );

      if (dailyResult > limits.daily) {
        set.status = 429;
        set.headers["X-RateLimit-Limit"] = String(limits.daily);
        set.headers["X-RateLimit-Remaining"] = "0";
        throw new Error(
          `Daily limit exceeded: ${limits.daily} requests per day`
        );
      }

      // Set rate limit headers
      set.headers["X-RateLimit-Limit"] = String(limits.minute);
      set.headers["X-RateLimit-Remaining"] = String(
        Math.max(0, limits.minute - minuteResult)
      );
    } catch (error) {
      // If DynamoDB fails, log but allow request (fail open)
      if (
        error instanceof Error &&
        !error.message.includes("Rate limit exceeded") &&
        !error.message.includes("Daily limit exceeded")
      ) {
        console.error("Rate limit check failed:", error);
      } else {
        throw error;
      }
    }

    return {};
  }
);

// Increment counter and return new value
async function incrementCounter(
  orgId: string,
  sk: string,
  ttlSeconds: number
): Promise<number> {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;

  const result = await dynamoClient.send(
    new UpdateItemCommand({
      TableName: TABLE_NAME,
      Key: {
        pk: { S: `org:${orgId}` },
        sk: { S: sk },
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
}

// Format keys for consistent time windows
function formatMinuteKey(date: Date): string {
  return date.toISOString().slice(0, 16).replace("T", "-").replace(":", "-");
}

function formatDailyKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
