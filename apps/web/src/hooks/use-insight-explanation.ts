"use client";

import { useQuery } from "@tanstack/react-query";

export type InsightExplanationKind =
  | "bounce_rate"
  | "complaint_rate"
  | "delivery_rate_drop"
  | "volume_drop"
  | "event_limit";

export type InsightExplanationFacts = {
  kind: InsightExplanationKind;
  severity: "warning" | "critical";
  current: number;
  previous: number | null;
};

export type InsightExplanationCopy = {
  title: string;
  description: string;
};

type InsightExplanationTarget = {
  facts: InsightExplanationFacts;
};

export const insightExplanationKeys = {
  all: ["insight-explanation"] as const,
};

/** Round to one decimal so tiny drift does not re-bill a generation on every render. */
function roundKeyComponent(value: number | null): number | null {
  return value === null ? null : Math.round(value * 10) / 10;
}

/**
 * Fetches a generated explanation for the single top insight (if any),
 * with a static fallback owned by the caller. `explainInsight` is reached
 * through a dynamic import inside `queryFn` so it — and everything it
 * imports (`@wraps/db`, better-auth) — is never pulled into the module graph
 * of callers that only need the static copy path (see
 * `insights-section.test.ts`, which runs in a node environment with no mocks).
 */
export function useInsightExplanation({
  orgId,
  target,
  windowDays,
  sandbox,
  verifiedDomainCount,
}: {
  orgId: string | undefined;
  target: InsightExplanationTarget | null;
  windowDays: number;
  sandbox: boolean;
  verifiedDomainCount: number;
}) {
  const facts = target?.facts;

  return useQuery<InsightExplanationCopy | null>({
    queryKey: [
      ...insightExplanationKeys.all,
      orgId,
      facts?.kind,
      facts?.severity,
      facts ? roundKeyComponent(facts.current) : null,
      facts ? roundKeyComponent(facts.previous) : null,
      windowDays,
    ],
    queryFn: async () => {
      if (!(orgId && facts)) {
        return null;
      }

      const { explainInsight } = await import("@/actions/ai-insight");
      const result = await explainInsight(orgId, {
        kind: facts.kind,
        severity: facts.severity,
        current: facts.current,
        previous: facts.previous,
        windowDays,
        sandbox,
        verifiedDomainCount,
      });

      return result.success ? result.copy : null;
    },
    enabled: !!orgId && !!facts,
    staleTime: 60 * 60_000,
  });
}
