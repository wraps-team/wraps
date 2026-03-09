import { auth } from "@wraps/auth";
import type { WorkflowStep } from "@wraps/db";
import { ArrowLeft, XCircle } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getWorkflowExecution } from "@/actions/workflows";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getOrganizationWithMembership } from "@/lib/organization";
import {
  EXECUTION_STATUS_COLORS,
  EXECUTION_STATUS_LABELS,
} from "@/lib/workflows";
import { CancelButton } from "./components/cancel-button";
import { RetryButton } from "./components/retry-button";
import { StepTrace } from "./components/step-trace";

const CANCELLABLE_STATUSES = new Set([
  "pending",
  "active",
  "paused",
  "waiting",
]);

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
            <Badge
              className={EXECUTION_STATUS_COLORS[execution.status]}
              variant="secondary"
            >
              {EXECUTION_STATUS_LABELS[execution.status]}
            </Badge>
          </div>
          <p className="text-muted-foreground">{contactName}</p>
        </div>
        {execution.status === "failed" && (
          <RetryButton
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
            stepExecutions={execution.stepExecutions}
            stepNameMap={Object.fromEntries(stepNameMap)}
          />
        </CardContent>
      </Card>

      {/* Error Details */}
      {execution.error && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive text-lg">
              <XCircle className="h-5 w-5" />
              Error Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p>{execution.error}</p>
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
