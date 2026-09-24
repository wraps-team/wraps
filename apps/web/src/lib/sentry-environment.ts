/**
 * The Sentry environment name, identical on server, edge and client.
 *
 * Left to the SDK, the server tagged production events `vercel-production`
 * and the client `production`, so an environment-filtered alert saw only half.
 * VERCEL_ENV (server) and NEXT_PUBLIC_VERCEL_ENV (client, exposed by Vercel's
 * system env vars) are production | preview | development; self-hosted and
 * local builds fall back to NODE_ENV.
 */
export function sentryEnvironment(
  vercelEnv: string | undefined,
  nodeEnv: string | undefined
): string {
  return vercelEnv || nodeEnv || "development";
}
