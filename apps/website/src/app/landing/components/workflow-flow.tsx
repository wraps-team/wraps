"use client";

import {
  Clock,
  GitBranch,
  type LucideIcon,
  Mail,
  MessageSquare,
  Zap,
} from "lucide-react";
import { FlowBox, FlowCard, Reveal } from "./flow-primitives";
import { type Timeline, useStageLoop } from "./use-stage-loop";

/*
 * Beat 03, "Automate the rest": one contact walking a welcome series built from
 * the builder's real node types (trigger, send email, delay, condition, send
 * SMS). The contact and copy are an example.
 */

const TIMELINE: Timeline = [
  [500, 1],
  [1400, 2],
  [2400, 3],
  [3400, 4],
  [4300, 5],
];

export const WORKFLOW_FLOW = { final: 5, timeline: TIMELINE, loopMs: 8500 };

type Node = {
  icon: LucideIcon;
  tone: string;
  title: string;
  detail: string;
  /** The stage at which the contact reaches this node. */
  at: number;
};

const SPINE: Node[] = [
  {
    icon: Zap,
    tone: "bg-warning/15 text-warning",
    title: "When a contact signs up",
    detail: "Event: user.signup",
    at: 1,
  },
  {
    icon: Mail,
    tone: "bg-brand/10 text-brand",
    title: "Send welcome email",
    detail: "Template: Welcome",
    at: 2,
  },
  {
    icon: Clock,
    tone: "bg-muted text-muted-foreground",
    title: "Wait 2 days",
    detail: "Delay",
    at: 3,
  },
  {
    icon: GitBranch,
    tone: "bg-success/10 text-success",
    title: "Opened the welcome email?",
    detail: "Condition",
    at: 4,
  },
];

const YES: Node = {
  icon: Mail,
  tone: "bg-brand/10 text-brand",
  title: "Send getting-started tips",
  detail: "Email",
  at: 5,
};

const NO: Node = {
  icon: MessageSquare,
  tone: "bg-success/10 text-success",
  title: "Send a reminder text",
  detail: "SMS",
  at: 5,
};

function NodeCard({
  node,
  stage,
  skipped = false,
}: {
  node: Node;
  stage: number;
  skipped?: boolean;
}) {
  const Icon = node.icon;
  const active = stage === node.at && !skipped;
  const done = stage >= node.at && !skipped;
  return (
    <div
      className={`flex items-center gap-2.5 rounded-lg border bg-background px-2.5 py-2 transition-all duration-300 ${
        active ? "border-brand ring-2 ring-brand/20" : "border-border"
      } ${skipped && stage >= node.at ? "opacity-40" : "opacity-100"}`}
    >
      <span
        className={`flex size-6 shrink-0 items-center justify-center rounded-md ${node.tone}`}
      >
        <Icon aria-hidden="true" className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-foreground text-xs leading-snug sm:text-sm">
          {node.title}
        </span>
        <span className="block truncate font-mono text-2xs text-muted-foreground">
          {node.detail}
        </span>
      </span>
      <span
        className={`shrink-0 font-mono text-success text-xs transition-opacity duration-300 ${
          done ? "opacity-100" : "opacity-0"
        }`}
      >
        ✓
      </span>
    </div>
  );
}

function Link({ lit }: { lit: boolean }) {
  return (
    <span
      className={`mx-auto block h-3 w-px transition-colors duration-300 ${
        lit ? "bg-brand" : "bg-border"
      }`}
    />
  );
}

export function WorkflowFlow() {
  const { stage, ref } = useStageLoop({ ...WORKFLOW_FLOW, trigger: "view" });

  return (
    <FlowCard cardRef={ref} stage={stage}>
      <FlowBox label="Workflow · Welcome series">
        <Reveal at={1} stage={stage}>
          <p className="mb-2.5 flex items-center justify-between font-mono text-2xs text-muted-foreground">
            <span>Contact</span>
            <span className="text-foreground">ada@acme.com</span>
          </p>
        </Reveal>

        {SPINE.map((node, i) => (
          <div key={node.title}>
            {i > 0 ? <Link lit={stage >= node.at} /> : null}
            <NodeCard node={node} stage={stage} />
          </div>
        ))}

        <Link lit={stage >= 5} />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="mb-1 text-center font-mono text-2xs text-success">
              Yes
            </p>
            <NodeCard node={YES} stage={stage} />
          </div>
          <div>
            <p className="mb-1 text-center font-mono text-2xs text-muted-foreground">
              No
            </p>
            <NodeCard node={NO} skipped stage={stage} />
          </div>
        </div>
      </FlowBox>
    </FlowCard>
  );
}
