export function computeTTL(
  ttlSeconds: number | undefined,
  now: string
): number | undefined {
  if (ttlSeconds === undefined) return;
  return Math.floor(new Date(now).getTime() / 1000) + ttlSeconds;
}
