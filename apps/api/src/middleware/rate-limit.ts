/**
 * Rate Limiting Middleware
 *
 * Uses DynamoDB for fast atomic counters with TTL cleanup.
 * Enforces both per-minute and daily limits based on plan.
 */

import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { Elysia } from "elysia";

import { isSelfHosted } from "../(ee)/lib/license";
import { awsDefaults } from "../lib/aws-defaults";
import { log } from "../lib/logger";
import {
  type RateLimitWindow,
  setRateLimitExceededHeaders,
  setRateLimitHeaders,
} from "../lib/rate-limit-headers";
import { getAuthOptional } from "./auth";

// Plan rate limits (requests)
// Aligned with apps/web/src/lib/plans.ts
const PLAN_LIMITS = {
  free: { daily: 1000, minute: 50 },
  starter: { daily: 50_000, minute: 500 },
  growth: { daily: 200_000, minute: 2000 },
  scale: { daily: 500_000, minute: 5000 },
} as const;

// DynamoDB client (reuse across invocations)
const dynamoClient = new DynamoDBClient(awsDefaults);
const TABLE_NAME = process.env.RATE_LIMIT_TABLE_NAME ?? "RateLimitTable";

const MINUTE_SECONDS = 60;
const DAY_SECONDS = 86_400;
const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;

function secondsUntilUtcMidnight(now: Date): number {
  const elapsed =
    now.getUTCHours() * MINUTE_SECONDS * MINUTES_PER_HOUR +
    now.getUTCMinutes() * MINUTE_SECONDS +
    now.getUTCSeconds();
  return HOURS_PER_DAY * MINUTES_PER_HOUR * MINUTE_SECONDS - elapsed;
}

export const rateLimitMiddleware = new Elysia({ name: "rate-limit" }).derive(
  { as: "scoped" },
  async (ctx) => {
    const authContext = getAuthOptional(ctx);

    if (!authContext) {
      // Auth middleware should have already set this
      return {};
    }

    // Self-hosted deployments are licensed — no request rate limiting.
    if (isSelfHosted()) {
      return {};
    }

    const { set } = ctx;

    const { organizationId, planId } = authContext;
    const limits =
      PLAN_LIMITS[planId as keyof typeof PLAN_LIMITS] ?? PLAN_LIMITS.free;

    const now = new Date();
    const minuteKey = formatMinuteKey(now);
    const dailyKey = formatDailyKey(now);

    // Both counters are keyed by clock window, so the reset is the time left in
    // that window — not a full window from now.
    const minuteWindow = (remaining: number): RateLimitWindow => ({
      name: "minute",
      limit: limits.minute,
      remaining,
      windowSeconds: MINUTE_SECONDS,
      resetSeconds: MINUTE_SECONDS - now.getUTCSeconds(),
    });
    const dailyWindow = (remaining: number): RateLimitWindow => ({
      name: "day",
      limit: limits.daily,
      remaining,
      windowSeconds: DAY_SECONDS,
      resetSeconds: secondsUntilUtcMidnight(now),
    });

    try {
      // Check and increment minute counter
      const minuteResult = await incrementCounter(
        organizationId,
        `minute:${minuteKey}`,
        60 // 60 second TTL
      );

      if (minuteResult > limits.minute) {
        set.status = 429;
        setRateLimitExceededHeaders(set, minuteWindow(0), [
          minuteWindow(0),
          dailyWindow(0),
        ]);
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
        setRateLimitExceededHeaders(set, dailyWindow(0), [
          minuteWindow(0),
          dailyWindow(0),
        ]);
        throw new Error(
          `Daily limit exceeded: ${limits.daily} requests per day`
        );
      }

      setRateLimitHeaders(set, [
        minuteWindow(limits.minute - minuteResult),
        dailyWindow(limits.daily - dailyResult),
      ]);
    } catch (error) {
      // Re-throw intentional 429 errors
      if (
        error instanceof Error &&
        (error.message.includes("Rate limit exceeded") ||
          error.message.includes("Daily limit exceeded"))
      ) {
        throw error;
      }
      // DynamoDB failed — fail open but log for ops awareness
      log.error("Rate limiter failing open", error, {
        organizationId,
        planId,
      });
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
