import { PostHog } from "posthog-node";

let posthogClient: PostHog | null = null;

const noopClient = {
  capture: () => {},
  captureException: () => {},
  identify: () => {},
  groupIdentify: () => {},
  flush: async () => {},
  shutdown: async () => {},
} as unknown as PostHog;

// Get PostHog host URL for server-side usage
// The NEXT_PUBLIC_POSTHOG_HOST may be set to "/ingest" for client-side proxy,
// but server-side needs the full URL
function getPostHogHost(): string {
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  // If host is a relative path (starts with /), use the full PostHog URL
  if (!host || host.startsWith("/")) {
    return "https://us.i.posthog.com";
  }
  return host;
}

// Local dev and test runs load apps/web/.env.local, which carries the
// production key; without this every dev/test event lands in prod analytics.
function shouldDisableTracking(): boolean {
  return (
    process.env.VITEST === "true" ||
    process.env.JEST_WORKER_ID !== undefined ||
    process.env.NODE_ENV !== "production" ||
    process.env.CI === "true" ||
    process.env.POSTHOG_DISABLED === "true"
  );
}

export function getPostHogClient(): PostHog {
  if (shouldDisableTracking()) {
    return noopClient;
  }
  // `||` not `??`: infra passes an unset key as the empty string.
  const apiKey = process.env.POSTHOG_KEY || process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!apiKey) {
    return noopClient;
  }
  if (!posthogClient) {
    posthogClient = new PostHog(apiKey, {
      host: getPostHogHost(),
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return posthogClient;
}

export function resetPostHogClientForTests(): void {
  posthogClient = null;
}
