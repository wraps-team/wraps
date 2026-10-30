"use client";

import type { WorkflowStepExecutionRecord } from "@wraps/db";
import { Badge } from "@wraps/ui/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@wraps/ui/components/ui/tooltip";
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
import type { ComponentProps } from "react";
import type { StepEngagement } from "@/actions/(ee)/workflows";
import { STEP_STATUS_LABELS } from "@/lib/(ee)/workflows";
import { cn } from "@/lib/utils";

type BadgeVariant = ComponentProps<typeof Badge>["variant"];

/** Mirrors STEP_STATUS_COLORS' semantics as Badge variants. */
function getStepStatusBadgeVariant(
  status: WorkflowStepExecutionRecord["status"]
): BadgeVariant {
  switch (status) {
    case "executing":
      return "info";
    case "completed":
      return "success";
    case "failed":
      return "destructive";
    default:
      return "secondary";
  }
}

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
  if (!startedAt) {
    return "";
  }
  const end = completedAt ? new Date(completedAt) : new Date();
  const ms = end.getTime() - new Date(startedAt).getTime();
  if (ms < 1000) {
    return "<1s";
  }
  if (ms < 60_000) {
    return `${Math.round(ms / 1000)}s`;
  }
  if (ms < 3_600_000) {
    return `${Math.round(ms / 60_000)}m`;
  }
  if (ms < 86_400_000) {
    return `${(ms / 3_600_000).toFixed(1)}h`;
  }
  return `${Math.round(ms / 86_400_000)}d`;
}

const ENGAGEMENT_DOT_CONFIG = {
  sent: { color: "bg-info", label: "Sent" },
  delivered: { color: "bg-success", label: "Delivered" },
  opened: { color: "bg-purple-500", label: "Opened" },
  clicked: { color: "bg-indigo-500", label: "Clicked" },
  bounced: { color: "bg-destructive", label: "Bounced" },
  complained: { color: "bg-warning", label: "Spam complaint" },
  optedOut: { color: "bg-destructive", label: "Opted out" },
} as const;

function formatTimestampShort(date: Date): string {
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function EngagementDots({ engagement }: { engagement: StepEngagement }) {
  const isEmail = engagement.channel === "email";

  const statuses = isEmail
    ? ([
        { key: "sent", timestamp: engagement.sentAt },
        { key: "delivered", timestamp: engagement.deliveredAt },
        { key: "opened", timestamp: engagement.openedAt },
        { key: "clicked", timestamp: engagement.clickedAt },
        { key: "bounced", timestamp: engagement.bouncedAt },
        { key: "complained", timestamp: engagement.complainedAt },
      ] as const)
    : ([
        { key: "sent", timestamp: engagement.sentAt },
        { key: "delivered", timestamp: engagement.deliveredAt },
        { key: "clicked", timestamp: engagement.clickedAt },
        { key: "optedOut", timestamp: engagement.optedOutAt },
      ] as const);

  const activeStatuses = statuses.filter((s) => s.timestamp);

  if (activeStatuses.length === 0) {
    return null;
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      {activeStatuses.map(({ key, timestamp }) => {
        const config = ENGAGEMENT_DOT_CONFIG[key];
        return (
          <Tooltip key={key}>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "inline-block h-2 w-2 rounded-full",
                  config.color
                )}
              />
            </TooltipTrigger>
            <TooltipContent side="top">
              <span className="font-medium">{config.label}</span>
              {timestamp && (
                <span className="ml-1 text-muted-foreground">
                  {formatTimestampShort(new Date(timestamp))}
                </span>
              )}
            </TooltipContent>
          </Tooltip>
        );
      })}
      {engagement.bounceType && (
        <span className="text-destructive text-xs">
          {engagement.bounceType}
          {engagement.bounceSubType ? ` (${engagement.bounceSubType})` : ""}
        </span>
      )}
      {engagement.clickedUrl && (
        <span className="truncate text-muted-foreground text-xs">
          {engagement.clickedUrl}
        </span>
      )}
    </div>
  );
}

type StepTraceProps = {
  stepExecutions: WorkflowStepExecutionRecord[];
  stepNameMap: Record<string, string>;
  stepEngagement?: Record<string, StepEngagement>;
};

export function StepTrace({
  stepExecutions,
  stepNameMap,
  stepEngagement,
}: StepTraceProps) {
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
                <Badge variant={getStepStatusBadgeVariant(step.status)}>
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

              {/* Engagement */}
              {stepEngagement?.[step.id] && (
                <EngagementDots engagement={stepEngagement[step.id]} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
