/**
 * The canonical set of plan ids inside apps/api.
 *
 * Mirrors the keys of `PLANS` in apps/web/src/lib/plans.ts. The two are kept
 * in sync by a parity test in baseline/architecture.test.ts rather than by a
 * shared package: apps/web does not depend on any package apps/api can reach,
 * and adding that edge to pull in a six-element list is not worth it.
 *
 * Every plan-keyed lookup table in apps/api types itself against `PlanId` so
 * the compiler enumerates the plans for you. This exists because the opposite
 * happened: five tables here were `Record<string, …>`, the three-tier
 * restructure renamed the ladder, and each one silently fell through to its
 * `free` entry for the new names — a paying customer served Free limits, with
 * nothing failing to typecheck.
 *
 * "starter" | "growth" | "scale" are legacy ids. They are never sold, but they
 * appear in live subscriptions and in already-issued self-hosted licences, so
 * they can never be removed.
 */
export const PLAN_IDS = [
  "free",
  "pro",
  "business",
  "starter",
  "growth",
  "scale",
] as const;

export type PlanId = (typeof PLAN_IDS)[number];

/** Narrow an untrusted string (an auth context's `planId`) to a known plan. */
export function isPlanId(value: string | null | undefined): value is PlanId {
  return (
    typeof value === "string" && (PLAN_IDS as readonly string[]).includes(value)
  );
}
