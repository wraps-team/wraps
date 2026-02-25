"use client";

import type { Workflow } from "@wraps/db";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import {
  checkAutomationReadiness,
  type ReadinessCheck,
} from "@/actions/automation-readiness";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { WorkflowNode } from "./use-automation-store";
import { useWorkflowStore } from "./use-automation-store";

type EnableReadinessDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflow: Workflow;
  organizationId: string;
  orgSlug: string;
  onEnable: () => void;
  isEnabling: boolean;
};

function getCheckIcon(check: ReadinessCheck) {
  if (check.status === "pass") {
    return <CheckCircle2 className="h-4 w-4 shrink-0 text-chart-2" />;
  }
  if (check.severity === "critical") {
    return <XCircle className="h-4 w-4 shrink-0 text-destructive" />;
  }
  return <AlertTriangle className="h-4 w-4 shrink-0 text-chart-4" />;
}

function ReadinessCheckRow({ check }: { check: ReadinessCheck }) {
  return (
    <div className="flex items-start gap-3 py-2">
      {getCheckIcon(check)}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{check.label}</p>
        {check.details && (
          <p className="text-muted-foreground text-xs">{check.details}</p>
        )}
      </div>
    </div>
  );
}

/**
 * Build client-side readiness checks from local state.
 */
function buildClientChecks(opts: {
  workflow: Workflow;
  workflowState: Workflow | null;
  nodes: WorkflowNode[];
  validationResult: { errors: Array<{ severity: string }> } | null;
  isDirty: boolean;
}): ReadinessCheck[] {
  const { workflow, workflowState, nodes, validationResult, isDirty } = opts;
  const checks: ReadinessCheck[] = [];

  const awsAccountId = workflowState?.awsAccountId ?? workflow.awsAccountId;
  checks.push({
    id: "aws_account",
    label: "AWS account configured",
    status: awsAccountId ? "pass" : "fail",
    severity: "critical",
    details: awsAccountId
      ? undefined
      : "Select an AWS account in workflow settings",
  });

  const hasEmailSteps = nodes.some(
    (n) =>
      n.data.type === "send_email" ||
      (n.data.type === "cascade" &&
        n.data.cascadeChannels?.some((c) => c.type === "email"))
  );

  if (hasEmailSteps) {
    const defaultFrom = workflowState?.defaultFrom ?? workflow.defaultFrom;
    checks.push({
      id: "sender_configured",
      label: "Sender email configured",
      status: defaultFrom ? "pass" : "fail",
      severity: "critical",
      details: defaultFrom
        ? undefined
        : "Set a default sender in workflow settings",
    });
  }

  const errorCount =
    validationResult?.errors.filter((e) => e.severity === "error").length ?? 0;
  checks.push({
    id: "structural_validation",
    label: "Structural validation passes",
    status: errorCount > 0 ? "fail" : "pass",
    severity: "critical",
    details: errorCount > 0 ? `${errorCount} issue(s) found` : undefined,
  });

  checks.push({
    id: "changes_saved",
    label: "All changes saved",
    status: isDirty ? "fail" : "pass",
    severity: "critical",
    details: isDirty ? "Save your changes before enabling" : undefined,
  });

  return checks;
}

function getCascadeTemplateIds(node: WorkflowNode): string[] {
  if (node.data.type !== "cascade" || !node.data.cascadeChannels) {
    return [];
  }
  return node.data.cascadeChannels
    .filter((ch) => ch.type === "email" && ch.templateId)
    .map((ch) => ch.templateId as string);
}

/**
 * Extract template IDs and condition fields from workflow nodes for server-side checks.
 */
function extractServerPayload(nodes: WorkflowNode[]) {
  const templateIds: string[] = [];
  const conditionFields: string[] = [];

  for (const node of nodes) {
    const { config } = node.data;
    if (config.type === "send_email" && config.templateId) {
      templateIds.push(config.templateId);
    }
    if (config.type === "condition" && config.field) {
      conditionFields.push(config.field);
    }
    templateIds.push(...getCascadeTemplateIds(node));
  }

  return { templateIds, conditionFields };
}

export function EnableReadinessDialog({
  open,
  onOpenChange,
  workflow,
  organizationId,
  orgSlug,
  onEnable,
  isEnabling,
}: EnableReadinessDialogProps) {
  const [checks, setChecks] = useState<ReadinessCheck[]>([]);
  const [isChecking, startTransition] = useTransition();
  const [hasRun, setHasRun] = useState(false);

  const nodes = useWorkflowStore((state) => state.nodes);
  const workflowState = useWorkflowStore((state) => state.workflow);
  const validationResult = useWorkflowStore((state) => state.validationResult);
  const isDirty = useWorkflowStore((state) => state.isDirty);
  const toggleSettingsPanel = useWorkflowStore(
    (state) => state.toggleSettingsPanel
  );

  useEffect(() => {
    if (!open) {
      setChecks([]);
      setHasRun(false);
      return;
    }

    const clientChecks = buildClientChecks({
      workflow,
      workflowState,
      nodes,
      validationResult,
      isDirty,
    });
    setChecks(clientChecks);

    const payload = extractServerPayload(nodes);
    const needsServerCheck =
      payload.templateIds.length > 0 || payload.conditionFields.length > 0;

    if (needsServerCheck) {
      startTransition(async () => {
        const result = await checkAutomationReadiness(
          workflow.id,
          organizationId,
          payload
        );
        if (result.success) {
          setChecks((prev) => [...prev, ...result.checks]);
        }
        setHasRun(true);
      });
    } else {
      setHasRun(true);
    }
  }, [
    open,
    workflow,
    workflowState,
    nodes,
    validationResult,
    isDirty,
    organizationId,
  ]);

  const hasCriticalFailure = checks.some(
    (c) => c.severity === "critical" && c.status === "fail"
  );
  const canEnable = hasRun && !isChecking && !hasCriticalFailure;

  const handleFixSettings = () => {
    toggleSettingsPanel();
    onOpenChange(false);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enable Workflow</DialogTitle>
          <DialogDescription>
            Pre-flight checks for {workflowState?.name ?? workflow.name}
          </DialogDescription>
        </DialogHeader>

        <div className="divide-y">
          {checks.map((check) => (
            <div className="flex items-center gap-2" key={check.id}>
              <div className="flex-1">
                <ReadinessCheckRow check={check} />
              </div>
              {check.status === "fail" &&
                (check.id === "aws_account" ||
                  check.id === "sender_configured") && (
                  <Button onClick={handleFixSettings} size="sm" variant="ghost">
                    Fix
                  </Button>
                )}
              {check.status === "fail" && check.id === "templates_exist" && (
                <Button asChild size="sm" variant="ghost">
                  <Link href={`/${orgSlug}/templates`} target="_blank">
                    <ExternalLink className="mr-1 h-3 w-3" />
                    Templates
                  </Link>
                </Button>
              )}
            </div>
          ))}

          {isChecking && (
            <div className="flex items-center gap-3 py-2">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground text-sm">
                Checking templates and conditions...
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            Cancel
          </Button>
          <Button disabled={!canEnable || isEnabling} onClick={onEnable}>
            {isEnabling ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Enabling...
              </>
            ) : (
              "Enable"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
