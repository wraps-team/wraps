import type * as React from "react";

/** Fades a piece of an animation in once its stage is reached; layout never shifts. */
export function Reveal({
  at,
  stage,
  className = "",
  children,
}: {
  at: number;
  stage: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`transition-all duration-300 motion-reduce:transition-none ${
        stage >= at ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
      } ${className}`}
    >
      {children}
    </div>
  );
}

/** The mono label that sits on a box's top border ("Your AWS account"). */
export function BoxLabel({
  children,
  tone = "text-muted-foreground",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return (
    <span
      className={`absolute -top-2.5 left-3 bg-card px-2 font-mono text-2xs uppercase tracking-widest ${tone}`}
    >
      {children}
    </span>
  );
}

/** A labelled box inside a flow card. */
export function FlowBox({
  label,
  tone,
  dashed = false,
  className = "",
  children,
}: {
  label: string;
  tone?: string;
  dashed?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`relative rounded-xl border px-3 pt-5 pb-3 sm:px-4 ${
        dashed
          ? "border-brand/50 border-dashed bg-brand/5"
          : "border-border bg-background"
      } ${className}`}
    >
      <BoxLabel tone={tone}>{label}</BoxLabel>
      {children}
    </div>
  );
}

/** The outer card every flow sits in. The animation is decorative; the figure caption carries the meaning. */
export function FlowCard({
  stage,
  cardRef,
  children,
}: {
  stage: number;
  cardRef?: React.Ref<HTMLDivElement>;
  children: React.ReactNode;
}) {
  return (
    <div
      aria-hidden="true"
      className="rounded-2xl border border-border bg-card p-3 text-left shadow-sm sm:p-5"
      data-stage={stage}
      ref={cardRef}
    >
      {children}
    </div>
  );
}

/** A short connector between two boxes, with a label that appears at its stage. */
export function FlowConnector({
  at,
  stage,
  children,
}: {
  at: number;
  stage: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-9 items-center justify-center">
      <Reveal at={at} className="flex items-center gap-2" stage={stage}>
        <span className="h-4 w-px border-border border-l border-dashed" />
        <span className="font-mono text-2xs text-muted-foreground">
          {children}
        </span>
      </Reveal>
    </div>
  );
}

/** A small status chip: a dot and a word. */
export function StatusDot({
  dot,
  children,
}: {
  dot: string;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs">
      <span className={`size-1.5 shrink-0 rounded-full ${dot}`} />
      {children}
    </span>
  );
}
