"use client";

import { useQuery } from "@tanstack/react-query";
import type { SetupStatus } from "@/lib/setup-status";
import { selectNextStep } from "./next-step";

/** Round to one decimal so tiny drift does not re-bill a generation on every render. */
function roundKeyComponent(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Situational wording for the one checklist step that is currently open. It
 * replaces that step's static description rather than sitting beside it: a
 * second sentence saying the same thing is the clutter this page keeps
 * accumulating. Returns null until (or unless) generation succeeds, so the
 * caller falls back to its own static copy.
 *
 * Which step is described is picked deterministically by `selectNextStep` —
 * never generated. Generated copy is fetched through a dynamic import inside
 * `queryFn` (never a top-level import) so the AI action — and everything it
 * imports (`@wraps/db`, better-auth) — never enters the module graph of
 * anything that only needs the static path, mirroring
 * `use-insight-explanation.ts`.
 */
export function useNextStepCopy(
  organizationId: string,
  setupStatus: SetupStatus
): string | null {
  const step = selectNextStep(setupStatus);

  const facts = {
    kind: step.kind,
    sandbox: setupStatus.sandboxStatus === true,
    verifiedDomainCount: setupStatus.verifiedDomains.length,
    emailCount: setupStatus.emailCount,
    hasTemplate: setupStatus.hasTemplate,
    hasContact: setupStatus.hasContact,
  };

  const { data } = useQuery({
    queryKey: [
      "next-step-copy",
      organizationId,
      step.kind,
      facts.sandbox,
      roundKeyComponent(facts.verifiedDomainCount),
      roundKeyComponent(facts.emailCount),
      facts.hasTemplate,
      facts.hasContact,
    ],
    queryFn: async () => {
      const { explainNextStep } = await import("@/actions/ai-next-step");
      const result = await explainNextStep(organizationId, facts);
      return result.success ? result.copy : null;
    },
    enabled: step.kind !== "done",
    staleTime: 60 * 60_000,
  });

  return data?.description ?? null;
}
