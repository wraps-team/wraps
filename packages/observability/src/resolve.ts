export function resolveReporterIds(
  env: Readonly<Record<string, string | undefined>>
): readonly string[] {
  const ids = (env.WRAPS_ERROR_PROVIDERS ?? "")
    .split(",")
    .map((id) => id.trim().toLowerCase())
    .filter((id) => id !== "");
  if (ids.length > 0) {
    return ids;
  }
  // Deployments that already set a DSN keep reporting to Sentry.
  const hasDsn = Boolean(env.WRAPS_ERROR_DSN) || Boolean(env.SENTRY_DSN);
  return hasDsn ? ["sentry"] : [];
}
