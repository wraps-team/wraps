/**
 * Tools Response Cache
 *
 * DynamoDB-based cache for email check results.
 * Shared across all Lambda instances with TTL-based expiration.
 */

import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";

import { awsDefaults } from "../lib/aws-defaults";
import { log } from "../lib/logger";

// DynamoDB client (reuse across invocations)
const dynamoClient = new DynamoDBClient(awsDefaults);
const TABLE_NAME = process.env.RATE_LIMIT_TABLE_NAME ?? "RateLimitTable";

// Cache TTL in seconds (5 minutes)
const CACHE_TTL_SECONDS = 5 * 60;

/**
 * Get cached value from DynamoDB
 */
export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const result = await dynamoClient.send(
      new GetItemCommand({
        TableName: TABLE_NAME,
        Key: {
          pk: { S: `cache:${key}` },
          sk: { S: "data" },
        },
      })
    );

    if (!result.Item?.data?.S) {
      return null;
    }

    // Check if expired (DynamoDB TTL is eventually consistent)
    const expiresAt = Number(result.Item.expiresAt?.N ?? 0);
    if (Date.now() / 1000 > expiresAt) {
      return null;
    }

    return JSON.parse(result.Item.data.S) as T;
  } catch (error) {
    log.error("Cache get failed", error);
    return null;
  }
}

/**
 * Set cached value in DynamoDB with TTL
 */
export async function setCache<T>(
  key: string,
  data: T,
  ttlSeconds: number = CACHE_TTL_SECONDS
): Promise<void> {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;

  try {
    await dynamoClient.send(
      new PutItemCommand({
        TableName: TABLE_NAME,
        Item: {
          pk: { S: `cache:${key}` },
          sk: { S: "data" },
          data: { S: JSON.stringify(data) },
          expiresAt: { N: String(expiresAt) },
        },
      })
    );
  } catch (error) {
    // Don't fail the request if caching fails
    log.error("Cache set failed", error);
  }
}

/**
 * Generate cache key for email check
 */
export function getEmailCheckCacheKey(
  domain: string,
  options: {
    quick?: boolean;
    dkimSelectors?: string[];
    /**
     * Pass only when it differs from the default for the mode (quick skips
     * blacklists, full runs them). A result that skipped them must never be
     * served to a request that asked for them, or the reverse.
     */
    blacklists?: "on" | "off";
  }
): string {
  const parts = [
    "email-check",
    domain.toLowerCase(),
    options.quick ? "quick" : "full",
  ];

  if (options.blacklists) {
    parts.push(options.blacklists === "on" ? "blacklists" : "no-blacklists");
  }

  if (options.dkimSelectors?.length) {
    parts.push(`dkim:${options.dkimSelectors.sort().join(",")}`);
  }

  return parts.join(":");
}
