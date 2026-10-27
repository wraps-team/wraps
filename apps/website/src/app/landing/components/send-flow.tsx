"use client";

import {
  FlowBox,
  FlowCard,
  FlowConnector,
  Reveal,
  StatusDot,
} from "./flow-primitives";
import { type Timeline, useStageLoop } from "./use-stage-loop";

/*
 * Beat 01, "Send with one call": the SDK call runs, the email arrives, and its
 * events come back. The code is the SDK's real API; the inbox is an example.
 */

const TIMELINE: Timeline = [
  [500, 1],
  [1300, 2],
  [2100, 3],
  [2900, 4],
  [3500, 5],
  [4100, 6],
];

export const SEND_FLOW = { final: 6, timeline: TIMELINE, loopMs: 9000 };

const KW = "text-brand";
const STR = "text-success";
const FG = "text-foreground";
const MUTED = "text-muted-foreground";

type Token = [text: string, tone: string];

const SETUP: Token[][] = [
  [
    ["const ", KW],
    ["email", FG],
    [" = ", MUTED],
    ["new ", KW],
    ["WrapsEmail", FG],
    ["();", MUTED],
  ],
];

const SEND: Token[][] = [
  [
    ["await ", KW],
    ["email", FG],
    [".", MUTED],
    ["send", FG],
    ["({", MUTED],
  ],
  [
    ["  from: ", MUTED],
    ["'hello@acme.com'", STR],
    [",", MUTED],
  ],
  [
    ["  to: ", MUTED],
    ["user.email", FG],
    [",", MUTED],
  ],
  [
    ["  subject: ", MUTED],
    ["'Welcome to Acme'", STR],
    [",", MUTED],
  ],
  [
    ["  react: ", MUTED],
    ["<WelcomeEmail name={user.name} />", FG],
    [",", MUTED],
  ],
  [["});", MUTED]],
];

function Code({ lines }: { lines: Token[][] }) {
  return lines.map((line) => (
    <span
      className="block min-w-0 overflow-hidden text-ellipsis whitespace-pre"
      key={line.map(([t]) => t).join("")}
    >
      {line.map(([text, tone]) => (
        <span className={tone} key={text}>
          {text}
        </span>
      ))}
    </span>
  ));
}

export function SendFlow() {
  const { stage, ref } = useStageLoop({ ...SEND_FLOW, trigger: "view" });
  const running = stage >= 1 && stage < 3;

  return (
    <FlowCard cardRef={ref} stage={stage}>
      <FlowBox label="Your app">
        <pre className="m-0 font-mono text-xs leading-relaxed sm:text-sm">
          <Code lines={SETUP} />
          <span className="block h-3" />
          <span
            className={`-mx-2 block rounded-md px-2 transition-colors duration-300 ${
              running ? "bg-brand/10" : "bg-transparent"
            }`}
          >
            <Code lines={SEND} />
          </span>
        </pre>
      </FlowBox>

      <FlowConnector at={2} stage={stage}>
        ↓ through Amazon SES, in your AWS account
      </FlowConnector>

      <FlowBox label="Ada's inbox">
        <Reveal at={3} stage={stage}>
          <div className="flex items-start gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-foreground text-xs">
              A
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline justify-between gap-2">
                <span className="truncate font-medium text-foreground text-sm">
                  Acme
                  <span className="ms-2 font-normal text-muted-foreground text-xs">
                    hello@acme.com
                  </span>
                </span>
                <span className="shrink-0 font-mono text-2xs text-muted-foreground">
                  now
                </span>
              </p>
              <p className="truncate text-foreground text-sm">
                Welcome to Acme
              </p>
              <p className="truncate text-muted-foreground text-xs">
                Hi Ada, thanks for signing up. Here is how to get started.
              </p>
            </div>
          </div>
        </Reveal>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-border border-t pt-2.5">
          <Reveal at={4} stage={stage}>
            <StatusDot dot="bg-success">Delivered</StatusDot>
          </Reveal>
          <Reveal at={5} stage={stage}>
            <StatusDot dot="bg-brand">Opened</StatusDot>
          </Reveal>
          <Reveal at={6} stage={stage}>
            <StatusDot dot="bg-foreground">Clicked</StatusDot>
          </Reveal>
          <Reveal at={4} className="ms-auto" stage={stage}>
            <span className="font-mono text-2xs text-muted-foreground">
              events land in your table
            </span>
          </Reveal>
        </div>
      </FlowBox>
    </FlowCard>
  );
}
