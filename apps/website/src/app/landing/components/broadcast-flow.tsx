"use client";

import { FlowBox, FlowCard, FlowConnector, Reveal } from "./flow-primitives";
import { type Timeline, useStageLoop } from "./use-stage-loop";

/*
 * Beat 02, "Send a broadcast": the composer's real four steps and audience
 * choices, a send, then the delivery funnel. Counts are an example and
 * internally consistent; every broadcast carries a one-click unsubscribe.
 */

const TIMELINE: Timeline = [
  [400, 1],
  [1100, 2],
  [1800, 3],
  [2600, 4],
  [3300, 5],
  [4100, 6],
  [4600, 7],
  [5100, 8],
  [5600, 9],
  [6200, 10],
];

export const BROADCAST_FLOW = { final: 10, timeline: TIMELINE, loopMs: 10_000 };

const STEPS = ["Setup", "Content", "Audience", "Review & Send"];

const AUDIENCES = [
  { label: "All Contacts", detail: "5,432 contacts", selected: true },
  { label: "Topic Subscribers", detail: "", selected: false },
  { label: "Segment", detail: "", selected: false },
];

const FUNNEL = [
  {
    label: "Sent",
    value: "5,432",
    width: "w-full",
    bar: "bg-muted-foreground",
  },
  { label: "Delivered", value: "5,401", width: "w-11/12", bar: "bg-success" },
  { label: "Opened", value: "2,187", width: "w-5/12", bar: "bg-brand" },
  { label: "Clicked", value: "512", width: "w-1/12", bar: "bg-foreground" },
];

function status(stage: number) {
  if (stage >= 6) {
    return {
      text: "Sent",
      tone: "border-success/40 bg-success/10 text-success",
    };
  }
  if (stage === 5) {
    return {
      text: "Sending",
      tone: "border-warning/40 bg-warning/10 text-warning",
    };
  }
  return {
    text: "Draft",
    tone: "border-border bg-muted text-muted-foreground",
  };
}

export function BroadcastFlow() {
  const { stage, ref } = useStageLoop({ ...BROADCAST_FLOW, trigger: "view" });
  const chip = status(stage);

  return (
    <FlowCard cardRef={ref} stage={stage}>
      <FlowBox label="Wraps dashboard">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground text-sm">
              Product launch
            </p>
            <p className="text-muted-foreground text-xs">Broadcast</p>
          </div>
          <span
            className={`rounded border px-2 py-0.5 font-mono text-2xs uppercase tracking-widest transition-colors duration-300 ${chip.tone}`}
          >
            {chip.text}
          </span>
        </div>

        <ol className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-2xs">
          {STEPS.map((step, i) => {
            const done = stage > i;
            const current = stage === i;
            return (
              <li
                className={`inline-flex items-center gap-1.5 transition-colors duration-300 ${
                  done || current ? "text-foreground" : "text-muted-foreground"
                }`}
                key={step}
              >
                <span
                  className={`flex size-4 items-center justify-center rounded-full border transition-colors duration-300 ${
                    done
                      ? "border-success bg-success/10 text-success"
                      : "border-border"
                  }`}
                >
                  {done ? "✓" : i + 1}
                </span>
                {step}
              </li>
            );
          })}
        </ol>

        <ul className="mt-3 space-y-1.5">
          {AUDIENCES.map((a) => {
            const chosen = a.selected && stage >= 3;
            return (
              <li
                className={`flex items-center justify-between gap-3 rounded-md border px-2.5 py-1.5 text-xs transition-colors duration-300 ${
                  chosen
                    ? "border-brand/50 bg-brand/5 text-foreground"
                    : "border-border text-muted-foreground"
                }`}
                key={a.label}
              >
                <span className="inline-flex items-center gap-2">
                  <span
                    className={`size-2.5 rounded-full border transition-colors duration-300 ${
                      chosen ? "border-brand bg-brand" : "border-border"
                    }`}
                  />
                  {a.label}
                </span>
                {a.detail ? (
                  <span className="font-mono text-2xs">{a.detail}</span>
                ) : null}
              </li>
            );
          })}
        </ul>

        <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full bg-brand transition-all duration-1000 ease-out motion-reduce:transition-none ${
              stage >= 5 ? "w-full" : "w-0"
            }`}
          />
        </div>
      </FlowBox>

      <FlowConnector at={6} stage={stage}>
        ↓ results, as the events come in
      </FlowConnector>

      <FlowBox label="Results">
        <ul className="space-y-2">
          {FUNNEL.map((row, i) => (
            <li
              className="flex items-center gap-3 font-mono text-xs"
              key={row.label}
            >
              <span className="w-16 shrink-0 text-muted-foreground sm:w-20">
                {row.label}
              </span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className={`block h-full rounded-full transition-all duration-700 ease-out motion-reduce:transition-none ${row.bar} ${
                    stage >= 6 + i ? row.width : "w-0"
                  }`}
                />
              </span>
              <span
                className={`w-12 shrink-0 text-right text-foreground tabular-nums transition-opacity duration-300 ${
                  stage >= 6 + i ? "opacity-100" : "opacity-0"
                }`}
              >
                {row.value}
              </span>
            </li>
          ))}
        </ul>
        <Reveal at={10} stage={stage}>
          <p className="mt-3 border-border border-t pt-2.5 font-mono text-success text-xs">
            ✓ One-click unsubscribe on every email
          </p>
        </Reveal>
      </FlowBox>
    </FlowCard>
  );
}
