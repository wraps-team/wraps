"use client";

import { useState } from "react";
import { FlowBox } from "./flow-primitives";

export type AmazonCostRow = {
  /** "10K", "100K"... */
  label: string;
  /** Emails per month. */
  emails: number;
  /** All-in monthly bill on each SES plan, already formatted. */
  alacarte: string;
  essentials: string;
};

export type AmazonCostLabels = {
  alacarte: string;
  essentials: string;
};

/**
 * "Plus what Amazon bills for sending": a volume picker over figures the
 * server computed with `estimateCost`. The component never does money math.
 */
export function AmazonCostCard({
  rows,
  labels,
  wrapsFree,
  initial = 1,
}: {
  rows: AmazonCostRow[];
  labels: AmazonCostLabels;
  wrapsFree: string;
  initial?: number;
}) {
  const [index, setIndex] = useState(initial);
  const row = rows[index];

  return (
    <FlowBox label="Amazon sending">
      <p className="mb-2 text-muted-foreground text-sm" id="amazon-volume">
        Plus what Amazon bills for sending, emails per month
      </p>
      <div
        aria-labelledby="amazon-volume"
        className="mb-5 inline-flex border border-border"
        role="group"
      >
        {rows.map((r, i) => (
          <button
            aria-pressed={i === index}
            className="min-w-14 cursor-pointer border-border px-3 py-1.5 font-medium text-sm not-last:border-r focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2 aria-pressed:bg-foreground aria-pressed:text-background"
            key={r.label}
            onClick={() => setIndex(i)}
            type="button"
          >
            {r.label}
          </button>
        ))}
      </div>

      <dl aria-live="polite" className="text-sm">
        <div className="flex items-baseline justify-between gap-4 border-border border-b py-2">
          <dt className="text-muted-foreground">{labels.alacarte}</dt>
          <dd className="font-semibold text-foreground tabular-nums">
            {row.alacarte}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 border-border border-b py-2">
          <dt className="text-muted-foreground">{labels.essentials}</dt>
          <dd className="font-semibold text-foreground tabular-nums">
            {row.essentials}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 py-2">
          <dt className="text-muted-foreground">Wraps, Free plan</dt>
          <dd className="font-semibold text-foreground tabular-nums">
            {wrapsFree}
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex items-end justify-between gap-4 border-border border-t pt-4">
        <p className="text-muted-foreground text-xs leading-snug">
          Your monthly total at {row.label} emails
          <br />
          on Essentials, the default for new accounts
        </p>
        <p className="font-heading font-semibold text-3xl text-foreground tabular-nums">
          {row.essentials}
        </p>
      </div>
    </FlowBox>
  );
}
