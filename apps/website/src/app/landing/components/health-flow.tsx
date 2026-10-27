"use client";

import { FlowBox, FlowCard, FlowConnector, Reveal } from "./flow-primitives";
import { type Timeline, useStageLoop } from "./use-stage-loop";

/*
 * Beat 04, "Keep your sending healthy": the dashboard flags a problem, the
 * audit names the cause, it gets fixed, and health is back. The readout lines
 * are the CLI's own wording (see audit-readout.tsx); the domain and rates are
 * an example.
 */

const TIMELINE: Timeline = [
  [600, 1],
  [1500, 2],
  [2100, 3],
  [2900, 4],
  [3700, 5],
  [4600, 6],
];

export const HEALTH_FLOW = { final: 6, timeline: TIMELINE, loopMs: 9500 };

export function HealthFlow() {
  const { stage, ref } = useStageLoop({ ...HEALTH_FLOW, trigger: "view" });
  const problem = stage >= 1 && stage < 6;

  return (
    <FlowCard cardRef={ref} stage={stage}>
      <FlowBox label="Wraps dashboard">
        <div className="flex items-center justify-between gap-3">
          <p className="font-medium text-foreground text-sm">Sending health</p>
          <span
            className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-2xs uppercase tracking-widest transition-colors duration-300 ${
              problem
                ? "border-warning/40 bg-warning/10 text-warning"
                : "border-success/40 bg-success/10 text-success"
            }`}
          >
            <span
              className={`size-1.5 rounded-full ${problem ? "bg-warning" : "bg-success"}`}
            />
            {problem ? "Needs attention" : "All systems healthy"}
          </span>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs">
          <dt className="text-muted-foreground">Bounce rate</dt>
          <dd className="text-right text-foreground tabular-nums">0.8%</dd>
          <dt className="text-muted-foreground">Complaint rate</dt>
          <dd className="text-right text-foreground tabular-nums">0.02%</dd>
        </dl>

        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-border border-t pt-2.5 font-mono text-xs">
          <span className="text-success">✓ SPF</span>
          <span
            className={`transition-colors duration-300 ${problem ? "text-warning" : "text-success"}`}
          >
            {problem ? "⚠ DKIM" : "✓ DKIM"}
          </span>
          <span className="text-success">✓ DMARC</span>
        </p>
      </FlowBox>

      <FlowConnector at={2} stage={stage}>
        ↓ one command says why
      </FlowConnector>

      <FlowBox label="Your terminal">
        <div className="space-y-1 font-mono text-xs">
          <Reveal at={2} stage={stage}>
            <p className="text-foreground">
              <span className="text-brand">$</span> wraps email check
              example.com
            </p>
          </Reveal>
          <Reveal at={3} stage={stage}>
            <p className="overflow-hidden text-ellipsis whitespace-pre text-success">
              ✓ SPF{"   "}v=spf1 -all
            </p>
            <p className="overflow-hidden text-ellipsis whitespace-pre text-warning">
              ⚠ DKIM{"  "}Found but invalid or revoked
            </p>
            <p className="overflow-hidden text-ellipsis whitespace-pre text-success">
              ✓ DMARC v=DMARC1;p=reject;sp=reject
            </p>
          </Reveal>
          <Reveal at={4} stage={stage}>
            <p className="pt-1 text-muted-foreground tracking-widest">ISSUES</p>
            <p className="text-foreground">1. No valid DKIM record</p>
          </Reveal>
          <Reveal at={5} stage={stage}>
            <p className="pt-1 text-muted-foreground">
              # republish the DKIM record in DNS
            </p>
          </Reveal>
        </div>
      </FlowBox>
    </FlowCard>
  );
}
