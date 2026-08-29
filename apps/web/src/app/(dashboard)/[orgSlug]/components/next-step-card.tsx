"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@wraps/ui/components/ui/badge";
import { Card, CardContent, CardHeader } from "@wraps/ui/components/ui/card";
import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { SetupStatus } from "@/lib/setup-status";
import { selectNextStep } from "./next-step";

type NextStepCardProps = {
  orgSlug: string;
  organizationId: string;
  setupStatus: SetupStatus;
};

/** Round to one decimal so tiny drift does not re-bill a generation on every render. */
function roundKeyComponent(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * A single next-best-action card above the setup checklist. The step it
 * shows is picked deterministically by `selectNextStep` — never generated.
 * Its static copy renders immediately; generated copy is fetched through a
 * dynamic import inside `queryFn` (never a top-level import) so the AI action
 * — and everything it imports (`@wraps/db`, better-auth) — never enters the
 * module graph of anything that only needs the static path, mirroring
 * `use-insight-explanation.ts`.
 */
export function NextStepCard({
  orgSlug,
  organizationId,
  setupStatus,
}: NextStepCardProps) {
  const step = selectNextStep(setupStatus);

  const facts = {
    kind: step.kind,
    sandbox: setupStatus.sandboxStatus === true,
    verifiedDomainCount: setupStatus.verifiedDomains.length,
    emailCount: setupStatus.emailCount,
    hasTemplate: setupStatus.hasTemplate,
    hasContact: setupStatus.hasContact,
  };

  const { data: generated } = useQuery({
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

  // "done" is unreachable from this dashboard today (it only renders when at
  // least one required step is incomplete), but the selector stays
  // exhaustive for reuse elsewhere — render nothing rather than a stale
  // "you're all set" card here.
  if (step.kind === "done") {
    return null;
  }

  const title = generated?.title ?? step.title;
  const description = generated?.description ?? step.description;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <p className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
            Next step
          </p>
          {setupStatus.sandboxStatus === true && (
            <Badge variant="outline">SES sandbox</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <p className="font-semibold text-lg">{title}</p>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
        <Button asChild className="shrink-0">
          <Link href={step.href(orgSlug)}>
            {step.ctaLabel}
            <ArrowRightIcon className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
