import { auth } from "@wraps/auth";
import { MAX_WORKFLOW_RETRIES, type WorkflowStep } from "@wraps/db";
import { Badge } from "@wraps/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { ArrowLeft, XCircle } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ComponentProps } from "react";
import { getWorkflowExecution } from "@/actions/(ee)/workflows";
import { Button } from "@/components/ui/button";
import {
  classifyWorkflowError,
  EXECUTION_STATUS_LABELS,
} from "@/lib/(ee)/workflows";
import { getOrganizationWithMembership } from "@/lib/organization";

type BadgeVariant = ComponentProps<typeof Badge>["variant"];

/** Mirrors EXECUTION_STATUS_COLORS' semantics as Badge variants. */
function getExecutionStatusBadgeVariant(status: string): BadgeVariant {
  switch (status) {
    case "active":
      return "info";
    case "paused":
      return "warning";
    case "waiting":
      return "brand";
    case "completed":
      return "success";
    case "failed":
      return "destructive";
    default:
      return "secondary";
  }
}

import { CancelButton } from "./components/cancel-button";
import { RetryButton } from "./components/retry-button";
import { StepTrace } from "./components/step-trace";
import { canOfferRetry } from "./retry-eligibility";

const CANCELLABLE_STATUSES = new Set([
  "pending",
  "active",
  "paused",
  "waiting",
]);

// Resolve the failed step's type from the snapshot so RetryButton can warn
// before re-sending an email/SMS. Kept out of the page component to hold its
// cognitive complexity under the lint ceiling.
function getErrorStepType(
  steps: WorkflowStep[],
  errorStepId: string | null
): string | undefined {
  if (!errorStepId) {
    return;
  }
  return steps.find((s) => s.id === errorStepId)?.type;
}

type ExecutionDetailPageProps = {
  params: Promise<{
    orgSlug: string;
    workflowId: string;
    executionId: string;
  }>;
};

export default async function ExecutionDetailPage({
  params,
}: ExecutionDetailPageProps) {
  const { orgSlug, workflowId, executionId } = await params;

  const session = await auth.api.getSession({
    headers: await import("next/headers").then((mod) => mod.headers()),
  });

  if (!session?.user) {
    redirect("/auth");
  }

  const orgWithMembership = await getOrganizationWithMembership(
    orgSlug,
    session.user.id
  );

  if (!orgWithMembership) {
    redirect("/");
  }

  const result = await getWorkflowExecution(executionId, orgWithMembership.id);

  if (!result.success) {
    notFound();
  }

  const execution = result.execution;
  const contactName = execution.contact
    ? `${execution.contact.firstName ?? ""} ${execution.contact.lastName ?? ""}`.trim() ||
      execution.contact.email ||
      "Unknown"
    : "Deleted contact";

  // Resolve step names from definition snapshot
  const snapshotSteps =
    (
      execution.definitionSnapshot as {
        steps: WorkflowStep[];
      } | null
    )?.steps ?? [];

  const stepNameMap = new Map(snapshotSteps.map((s) => [s.id, s.name]));

  // The step that failed — used to warn before re-sending email/SMS on retry.
  const errorStepType = getErrorStepType(snapshotSteps, execution.errorStepId);
  const contactEmail = execution.contact?.email;

  return (
    <div className="space-y-6 px-4 lg:px-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          aria-label="Back to executions"
          asChild
          size="icon"
          variant="ghost"
        >
          <Link href={`/${orgSlug}/automations/${workflowId}/executions`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="font-bold text-2xl tracking-tight">
              {execution.workflow?.name ?? "Workflow"} — Execution
            </h1>
            <Badge variant={getExecutionStatusBadgeVariant(execution.status)}>
              {EXECUTION_STATUS_LABELS[execution.status]}
            </Badge>
          </div>
          <p className="text-muted-foreground">{contactName}</p>
        </div>
        {canOfferRetry(
          execution.status,
          execution.retryCount,
          execution.errorStepId,
          snapshotSteps,
          MAX_WORKFLOW_RETRIES
        ) && (
          <RetryButton
            contactEmail={contactEmail}
            errorStepType={errorStepType}
            executionId={execution.id}
            organizationId={orgWithMembership.id}
          />
        )}
        {CANCELLABLE_STATUSES.has(execution.status) && (
          <CancelButton
            executionId={execution.id}
            organizationId={orgWithMembership.id}
          />
        )}
      </div>

      {/* Step Trace */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Step Trace</CardTitle>
        </CardHeader>
        <CardContent>
          <StepTrace
            stepEngagement={execution.stepEngagement}
            stepExecutions={execution.stepExecutions}
            stepNameMap={Object.fromEntries(stepNameMap)}
          />
        </CardContent>
      </Card>

      {/* Error Details */}
      {execution.error && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <XCircle className="h-5 w-5 text-destructive" />
              <span className="text-destructive">Error Details</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="font-medium text-sm">
              {classifyWorkflowError(execution.error).remediation}
            </p>
            <details className="text-muted-foreground text-sm">
              <summary className="cursor-pointer select-none">
                Show error detail
              </summary>
              <p className="mt-2 font-mono text-xs">{execution.error}</p>
            </details>
          </CardContent>
        </Card>
      )}

      {/* Metadata */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <div className="font-medium text-muted-foreground">Contact</div>
              <div>{contactName}</div>
            </div>
            {execution.contact?.email && (
              <div>
                <div className="font-medium text-muted-foreground">Email</div>
                <div>{execution.contact.email}</div>
              </div>
            )}
            {execution.startedAt && (
              <div>
                <div className="font-medium text-muted-foreground">Started</div>
                <div>{new Date(execution.startedAt).toLocaleString()}</div>
              </div>
            )}
            {execution.completedAt && (
              <div>
                <div className="font-medium text-muted-foreground">
                  Completed
                </div>
                <div>{new Date(execution.completedAt).toLocaleString()}</div>
              </div>
            )}
            <div>
              <div className="font-medium text-muted-foreground">
                Execution ID
              </div>
              <div className="font-mono text-xs">{execution.id}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
