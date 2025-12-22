/**
 * DynamoDB Tables for Wraps Platform
 *
 * Rate Limit Table:
 * - Used for minute-level rate limiting (TTL-based cleanup)
 * - Faster than PostgreSQL for high-frequency atomic increments
 * - Cost-effective with on-demand billing
 */

// Rate limit table for API request throttling
// Uses DynamoDB for fast atomic counters with TTL cleanup
export const rateLimitTable = new sst.aws.Dynamo("RateLimitTable", {
  fields: {
    pk: "string", // org:{organizationId}
    sk: "string", // minute:{YYYY-MM-DD-HH-MM} or daily:{YYYY-MM-DD}
  },
  primaryIndex: {
    hashKey: "pk",
    rangeKey: "sk",
  },
  ttl: "expiresAt",
  transform: {
    table: {
      billingMode: "PAY_PER_REQUEST",
      tags: {
        ManagedBy: "sst",
        Service: "wraps-api",
      },
    },
  },
});
