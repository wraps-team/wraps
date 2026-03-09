"use client";

import type { WorkflowStepExecutionRecord } from "@wraps/db";
import {
  CheckCircle,
  CircleDot,
  Clock,
  GitBranch,
  Loader2,
  Mail,
  MessageSquare,
  SkipForward,
  UserCog,
  Webhook,
  XCircle,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { STEP_STATUS_COLORS, STEP_STATUS_LABELS } from "@/lib/workflows";

const STEP_TYPE_ICONS: Record<string, typeof Zap> = {
  trigger: Zap,
  send_email: Mail,
  send_sms: MessageSquare,
  delay: Clock,
  condition: GitBranch,
  webhook: Webhook,
  update_contact: UserCog,
  wait_for_event: Clock,
};

const STATUS_ICONS: Record<string, typeof CheckCircle> = {
  completed: CheckCircle,
  failed: XCircle,
  executing: Loader2,
  skipped: SkipForward,
  pending: CircleDot,
};

function formatStepDuration(
  startedAt: Date | null,
  completedAt: Date | null
): string {
  if (!startedAt) return "";
  const end = completedAt ? new Date(completedAt) : new Date();
  const ms = end.getTime() - new Date(startedAt).getTime();
  if (ms < 1000) return "<1s";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${(ms / 3_600_000).toFixed(1)}h`;
  return `${Math.round(ms / 86_400_000)}d`;
}

type StepTraceProps = {
  stepExecutions: WorkflowStepExecutionRecord[];
  stepNameMap: Record<string, string>;
};

export function StepTrace({ stepExecutions, stepNameMap }: StepTraceProps) {
  if (stepExecutions.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No steps executed yet.</p>
    );
  }

  return (
    <div className="space-y-0">
      {stepExecutions.map((step, index) => {
        const TypeIcon = STEP_TYPE_ICONS[step.stepType] ?? CircleDot;
        const StatusIcon = STATUS_ICONS[step.status] ?? CircleDot;
        const isFailed = step.status === "failed";
        const isLast = index === stepExecutions.length - 1;
        const stepName = stepNameMap[step.stepId] ?? step.stepType;
        const duration = formatStepDuration(step.startedAt, step.completedAt);

        return (
          <div className="flex gap-3" key={step.id}>
            {/* Timeline line */}
            <div className="flex flex-col items-center">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
                  isFailed
                    ? "border-destructive/30 bg-destructive/10"
                    : "border-border bg-muted"
                }`}
              >
                <TypeIcon
                  className={`h-4 w-4 ${
                    isFailed ? "text-destructive" : "text-muted-foreground"
                  }`}
                />
              </div>
              {!isLast && <div className="w-px flex-1 bg-border" />}
            </div>

            {/* Step content */}
            <div className={`pb-6 ${isLast ? "pb-0" : ""}`}>
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{stepName}</span>
                <Badge
                  className={STEP_STATUS_COLORS[step.status]}
                  variant="secondary"
                >
                  <StatusIcon
                    className={`mr-1 h-3 w-3 ${
                      step.status === "executing" ? "animate-spin" : ""
                    }`}
                  />
                  {STEP_STATUS_LABELS[step.status]}
                </Badge>
                {step.branch && <Badge variant="outline">{step.branch}</Badge>}
                {duration && (
                  <span className="text-muted-foreground text-xs">
                    {duration}
                  </span>
                )}
              </div>

              {/* Error message */}
              {step.error && (
                <div className="mt-1 rounded bg-destructive/10 px-3 py-2 text-destructive text-sm">
                  {step.error}
                </div>
              )}

              {/* Skip reason */}
              {step.skipReason && (
                <div className="mt-1 text-muted-foreground text-xs">
                  Skipped: {step.skipReason}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
