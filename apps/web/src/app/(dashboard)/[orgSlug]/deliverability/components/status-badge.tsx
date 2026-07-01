import { Badge } from "@wraps/ui/components/ui/badge";
import { cn } from "@wraps/ui/lib/utils";
import { AlertTriangle, CheckCircle2, OctagonX } from "lucide-react";
import type { ReputationStatus } from "../lib/sample-data";

const META: Record<
  ReputationStatus,
  { label: string; className: string; Icon: typeof CheckCircle2 }
> = {
  healthy: {
    label: "Healthy",
    className: "border-success/30 bg-success/10 text-success",
    Icon: CheckCircle2,
  },
  review: {
    label: "Under review",
    className: "border-warning/40 bg-warning/10 text-warning",
    Icon: AlertTriangle,
  },
  paused: {
    label: "Sending paused",
    className: "border-destructive/40 bg-destructive/10 text-destructive",
    Icon: OctagonX,
  },
};

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: ReputationStatus;
  label?: string;
  className?: string;
}) {
  const meta = META[status];
  return (
    <Badge className={cn("gap-1", meta.className, className)} variant="outline">
      <meta.Icon aria-hidden="true" className="size-3" />
      {label ?? meta.label}
    </Badge>
  );
}
