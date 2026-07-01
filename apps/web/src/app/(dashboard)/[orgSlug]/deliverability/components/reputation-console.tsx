"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { Separator } from "@wraps/ui/components/ui/separator";
import { cn } from "@wraps/ui/lib/utils";
import { Server, TrendingUp } from "lucide-react";
import {
  BOUNCE_THRESHOLDS,
  bounceStatus,
  COMPLAINT_THRESHOLDS,
  complaintStatus,
  providerPlacement,
  reputation,
} from "../lib/sample-data";
import { KillSwitch } from "./kill-switch";
import { ReputationGauge } from "./reputation-gauge";
import { ReputationTrend } from "./reputation-trend";
import { StatusBadge } from "./status-badge";
import { ThresholdBar } from "./threshold-bar";

/** Days until `value` crosses `line`, given the recent 7-day slope. */
function daysToLine(
  history: { bounce: number; complaint: number }[],
  key: "bounce" | "complaint",
  line: number
) {
  const recent = history.slice(-7);
  const first = recent[0]?.[key] ?? 0;
  const last = recent.at(-1)?.[key] ?? 0;
  const perDay = (last - first) / (recent.length - 1);
  if (perDay <= 0 || last >= line) {
    return null;
  }
  return Math.max(1, Math.round((line - last) / perDay));
}

export function ReputationConsole() {
  const bStatus = bounceStatus(reputation.bounceRate);
  const cStatus = complaintStatus(reputation.complaintRate);
  const bounceEta = daysToLine(reputation.history, "bounce", BOUNCE_THRESHOLDS.review);

  return (
    <div className="space-y-6">
      {/* Account enforcement status + kill switch */}
      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Server className="size-4 text-muted-foreground" />
              Account enforcement
            </CardTitle>
            <CardDescription>SES account {reputation.sendingEnabled ? "in good standing" : "restricted"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Sending status</span>
              <StatusBadge
                label={reputation.sendingEnabled ? "Enabled" : "Paused"}
                status={reputation.sendingEnabled ? "healthy" : "paused"}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Enforcement</span>
              <span className="font-medium">None active</span>
            </div>
            <Separator />
            <p className="rounded-lg bg-muted/50 p-2.5 text-muted-foreground text-xs leading-relaxed">
              This is your <span className="font-medium text-foreground">raw AWS account reputation</span>
              , not a provider aggregate. Renting from Resend hides this number
              entirely.
            </p>
          </CardContent>
        </Card>

        <div className="lg:pt-1">
          <KillSwitch />
        </div>
      </div>

      {/* Gauges */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Bounce rate</CardTitle>
            <CardDescription>
              Measured against AWS enforcement lines
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <ReputationGauge
              label="14-day rolling average"
              pausedAt={BOUNCE_THRESHOLDS.paused}
              reviewAt={BOUNCE_THRESHOLDS.review}
              status={bStatus}
              value={reputation.bounceRate}
            />
            <ThresholdBar
              pausedAt={BOUNCE_THRESHOLDS.paused}
              reviewAt={BOUNCE_THRESHOLDS.review}
              status={bStatus}
              value={reputation.bounceRate}
            />
            {bounceEta ? (
              <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3">
                <TrendingUp
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-warning"
                />
                <p className="text-sm">
                  <span className="font-medium">Trajectory:</span> at your
                  current climb you&apos;ll reach the{" "}
                  <span className="font-medium text-warning">review line (5%)</span>{" "}
                  in about{" "}
                  <span className="font-mono font-semibold">
                    {bounceEta} days
                  </span>
                  . Prune hard bounces now to stay clear.
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Complaint rate</CardTitle>
            <CardDescription>
              Measured against AWS enforcement lines
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <ReputationGauge
              format={(v) => `${v}%`}
              label="14-day rolling average"
              pausedAt={COMPLAINT_THRESHOLDS.paused}
              reviewAt={COMPLAINT_THRESHOLDS.review}
              status={cStatus}
              value={reputation.complaintRate}
            />
            <ThresholdBar
              format={(v) => `${v}%`}
              pausedAt={COMPLAINT_THRESHOLDS.paused}
              reviewAt={COMPLAINT_THRESHOLDS.review}
              status={cStatus}
              value={reputation.complaintRate}
            />
            <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/5 p-3">
              <TrendingUp
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-success"
              />
              <p className="text-sm">
                <span className="font-medium">Trajectory:</span> complaint rate
                is flat and well below the{" "}
                <span className="font-medium text-success">0.1% review line</span>
                . No action needed.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Trend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">14-day reputation trend</CardTitle>
          <CardDescription>
            Bounce and complaint rates plotted against the lines AWS actually
            enforces on.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-2 sm:px-6">
          <ReputationTrend />
        </CardContent>
      </Card>

      {/* Placement by mailbox provider */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Deliverability by mailbox provider
          </CardTitle>
          <CardDescription>
            Where your mail lands, broken down by inbox provider — sourced from
            events in your own AWS account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {providerPlacement.map((p) => {
              const status =
                p.inbox >= 95 ? "healthy" : p.inbox >= 90 ? "review" : "paused";
              return (
                <div className="rounded-lg border p-3" key={p.provider}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{p.provider}</span>
                    <StatusBadge label={`${p.inbox}%`} status={status} />
                  </div>
                  <p className="mt-2 font-mono text-muted-foreground text-xs">
                    {p.delivered.toLocaleString()} delivered
                  </p>
                  <div
                    className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
                    aria-hidden="true"
                  >
                    <div
                      className={cn(
                        "h-full rounded-full",
                        status === "healthy"
                          ? "bg-success"
                          : status === "review"
                            ? "bg-warning"
                            : "bg-destructive"
                      )}
                      style={{ width: `${p.inbox}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
