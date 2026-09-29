/**
 * PostHog server client for telemetry
 * @module lib/posthog
 */

// Deliberately NOT using @wraps/analytics: this reads POSTHOG_API_KEY, not
// POSTHOG_KEY / NEXT_PUBLIC_POSTHOG_KEY, and may point at a different PostHog
// project (CLI telemetry vs product analytics). Unifying the key chain would
// either break this or silently merge two event streams.
import { PostHog } from "posthog-node";

// Singleton instance
let posthogInstance: PostHog | null = null;

/**
 * Get or create PostHog client instance
 *
 * @returns PostHog client instance
 */
export function getPostHogClient(): PostHog {
  if (!posthogInstance) {
    const apiKey = process.env.POSTHOG_API_KEY;
    const host = process.env.POSTHOG_HOST || "https://app.posthog.com";

    if (!apiKey) {
      throw new Error("POSTHOG_API_KEY environment variable is not set");
    }

    posthogInstance = new PostHog(apiKey, {
      host,
      flushAt: 20, // Batch size before automatic flush
      flushInterval: 10_000, // Flush every 10 seconds
    });
  }

  return posthogInstance;
}

/**
 * Gracefully shutdown PostHog client
 * Ensures all events are flushed before closing
 */
export async function shutdownPostHog(): Promise<void> {
  if (posthogInstance) {
    await posthogInstance.shutdown();
    posthogInstance = null;
  }
}
