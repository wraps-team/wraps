"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { Input } from "@wraps/ui/components/ui/input";
import { Label } from "@wraps/ui/components/ui/label";
import { AlertTriangle, Info } from "lucide-react";
import Link from "next/link";
import { parseAsInteger, useQueryStates } from "nuqs";
import {
  estimateSesRates,
  type MetricResult,
  type RateStatus,
} from "@/lib/ses-bounce-rate";

const parsers = {
  sends: parseAsInteger.withDefault(0),
  hard: parseAsInteger.withDefault(0),
  soft: parseAsInteger.withDefault(0),
  complaints: parseAsInteger.withDefault(0),
};

const STATUS_LABEL: Record<RateStatus, string> = {
  "within-best-practice": "Within best practice",
  "above-best-practice": "Above best practice",
  review: "At or past the review line",
  pause: "At or past the pause line",
};

const STATUS_VARIANT: Record<
  RateStatus,
  "success" | "warning" | "destructive"
> = {
  "within-best-practice": "success",
  "above-best-practice": "warning",
  review: "warning",
  pause: "destructive",
};

const number = new Intl.NumberFormat("en-US");

function formatPercent(value: number): string {
  if (value === 0) {
    return "0%";
  }
  return `${value < 0.1 ? value.toFixed(3) : value.toFixed(2)}%`;
}

function NumberField({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="numeric"
        min={0}
        onChange={(event) => {
          const parsed = Number.parseInt(event.target.value, 10);
          onChange(Number.isNaN(parsed) || parsed < 0 ? 0 : parsed);
        }}
        type="number"
        value={value === 0 ? "" : value}
      />
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}

function MetricCard({
  title,
  eventName,
  result,
  reviewLabel,
  pauseLabel,
}: {
  title: string;
  eventName: string;
  result: MetricResult;
  reviewLabel: string;
  pauseLabel: string;
}) {
  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="font-heading text-lg tracking-tight">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="font-heading font-semibold text-4xl tracking-tight">
          {formatPercent(result.ratePercent)}
        </p>
        <Badge variant={STATUS_VARIANT[result.status]}>
          {STATUS_LABEL[result.status]}
        </Badge>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">
              Review line ({reviewLabel})
            </dt>
            <dd className="font-mono">
              {number.format(result.countAtReview)} {eventName}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Pause line ({pauseLabel})</dt>
            <dd className="font-mono">
              {number.format(result.countAtPause)} {eventName}
            </dd>
          </div>
        </dl>
        <p className="text-sm">
          {result.headroomToReview === 0 ? (
            <span className="text-warning">
              You are at or past the review line at this volume.
            </span>
          ) : (
            <>
              <span className="font-mono">
                {number.format(result.headroomToReview)}
              </span>{" "}
              <span className="text-muted-foreground">
                more {eventName} at this volume reaches the review line.
              </span>
            </>
          )}
        </p>
      </CardContent>
    </Card>
  );
}

export default function BounceRateCalculatorPageContent() {
  const [state, setState] = useQueryStates(parsers, { history: "replace" });
  const estimate = estimateSesRates({
    sends: state.sends,
    hardBounces: state.hard,
    softBounces: state.soft,
    complaints: state.complaints,
  });

  return (
    <div className="space-y-6">
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="font-heading text-lg tracking-tight">
            Your numbers
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <NumberField
            id="sends"
            label="Emails sent"
            onChange={(sends) => setState({ sends })}
            value={state.sends}
          />
          <NumberField
            hint="Permanent failures, such as an address that does not exist."
            id="hard"
            label="Hard bounces"
            onChange={(hard) => setState({ hard })}
            value={state.hard}
          />
          <NumberField
            hint="Optional. Shown below, but SES does not count them."
            id="soft"
            label="Soft bounces"
            onChange={(soft) => setState({ soft })}
            value={state.soft}
          />
          <NumberField
            id="complaints"
            label="Complaints"
            onChange={(complaints) => setState({ complaints })}
            value={state.complaints}
          />
        </CardContent>
      </Card>

      {estimate ? (
        <>
          <div className="rounded-lg border border-info/30 bg-info/5 p-4">
            <div className="flex items-start gap-3">
              <Info
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0 text-info"
              />
              <p className="text-muted-foreground text-sm">
                This is an estimate. AWS measures over a representative volume
                it does not publish and counts only hard bounces to unverified
                domains, so your SES number can differ. See{" "}
                <Link
                  className="text-brand underline underline-offset-2"
                  href="/ses/bounce-rate"
                >
                  how SES counts bounces
                </Link>{" "}
                and{" "}
                <Link
                  className="text-brand underline underline-offset-2"
                  href="/ses/complaint-rate"
                >
                  complaints
                </Link>
                .
              </p>
            </div>
          </div>

          {estimate.inconsistent && (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle
                  aria-hidden="true"
                  className="mt-0.5 h-4 w-4 shrink-0 text-warning"
                />
                <p className="text-muted-foreground text-sm">
                  Hard bounces or complaints are higher than emails sent. Check
                  that all four numbers cover the same period.
                </p>
              </div>
            </div>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            <MetricCard
              eventName="hard bounces"
              pauseLabel="10%"
              result={estimate.bounce}
              reviewLabel="5%"
              title="Bounce rate (hard bounces)"
            />
            <MetricCard
              eventName="complaints"
              pauseLabel="0.5%"
              result={estimate.complaint}
              reviewLabel="0.1%"
              title="Complaint rate"
            />
          </div>

          {estimate.softBounces > 0 && (
            <p className="text-muted-foreground text-sm">
              Soft bounces: {number.format(estimate.softBounces)} (
              {formatPercent((estimate.softBounces / estimate.sends) * 100)} of
              sends). Not counted by SES toward your bounce rate, so they are
              left out above.
            </p>
          )}
        </>
      ) : (
        <p className="text-muted-foreground text-sm">
          Enter how many emails you sent to see your rates.
        </p>
      )}
    </div>
  );
}
