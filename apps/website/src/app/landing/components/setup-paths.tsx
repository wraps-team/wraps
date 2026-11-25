"use client";

import { Button } from "@wraps/ui/components/ui/button";
import { Check, ClipboardCopy } from "lucide-react";
import { Tabs } from "radix-ui";
import { useState } from "react";
import { trackEvent } from "@/utils/analytics";
import { FlowBox } from "./flow-primitives";

export type SetupAgentLinks = {
  claudeApp: string;
  claudeCode: string;
  cursor: string;
  /** The exact prompt the links carry and Copy prompt copies. */
  prompt: string;
};

const TRIGGER =
  "flex flex-1 cursor-pointer flex-col items-start gap-0.5 border border-border px-4 py-3 text-left text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2 data-[state=active]:border-foreground data-[state=active]:bg-foreground data-[state=active]:text-background";

const TILE =
  "group flex w-full cursor-pointer items-center gap-3 border border-border bg-background px-4 py-3 text-left text-foreground hover:border-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 motion-reduce:transition-none";

function track(cta_text: string, location: string) {
  trackEvent("cta_click", { location, cta_text });
}

function Tile({
  title,
  note,
  href,
  main = false,
}: {
  title: string;
  note: string;
  href: string;
  main?: boolean;
}) {
  return (
    <a
      className={`${TILE} ${main ? "border-brand/60 bg-brand/5" : ""}`}
      href={href}
      onClick={() => track(`Open in ${title}`, "setup_agent")}
    >
      <span className="grid min-w-0 flex-1">
        <b className="font-semibold">{title}</b>
        <small className="text-muted-foreground text-xs">{note}</small>
      </span>
      <span aria-hidden="true" className="text-muted-foreground">
        →
      </span>
    </a>
  );
}

function CopyPromptTile({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    track("Copy prompt", "setup_agent");
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard can be blocked. The prompt is on screen under "See the
      // prompt" to select by hand.
    }
  }

  return (
    <button className={TILE} onClick={copy} type="button">
      <span className="grid min-w-0 flex-1">
        <b className="font-semibold">Copy prompt</b>
        <small className="text-muted-foreground text-xs">
          Codex, Windsurf or any other agent
        </small>
      </span>
      {copied ? (
        <Check aria-hidden="true" className="size-4 text-success" />
      ) : (
        <ClipboardCopy
          aria-hidden="true"
          className="size-4 text-muted-foreground"
        />
      )}
      <span aria-live="polite" className="sr-only">
        {copied ? "Prompt copied" : ""}
      </span>
    </button>
  );
}

const TICK = (
  <Check
    aria-hidden="true"
    className="mt-0.5 size-4 shrink-0 text-brand-text"
  />
);

function Notes({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-2.5 text-muted-foreground text-sm leading-relaxed">
      {items.map((item) => (
        <li className="flex gap-2.5" key={item}>
          {TICK}
          {item}
        </li>
      ))}
    </ul>
  );
}

const ILLUSTRATION = [
  { who: "you", text: "Set up Wraps email for me." },
  { who: "done", text: "Checked your AWS access and installed Wraps." },
  {
    who: "ask",
    text: "Which region should I use? I'll show the estimated AWS cost before deploying.",
  },
  { who: "you", text: "us-east-1." },
  { who: "end", text: "Deployed. Next: add your domain in the dashboard." },
] as const;

export function SetupPaths({ links }: { links: SetupAgentLinks }) {
  return (
    <Tabs.Root defaultValue="browser">
      <Tabs.List
        aria-label="How to connect your AWS account"
        className="mb-8 grid gap-3 sm:grid-cols-2"
      >
        <Tabs.Trigger className={TRIGGER} value="browser">
          <b className="font-semibold">In your browser</b>
          <span className="text-xs opacity-80">No terminal needed</span>
        </Tabs.Trigger>
        <Tabs.Trigger className={TRIGGER} value="agent">
          <b className="font-semibold">With your AI agent</b>
          <span className="text-xs opacity-80">
            If you use Claude or Cursor
          </span>
        </Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content className="outline-none" value="browser">
        <div className="grid items-start gap-8 lg:grid-cols-2">
          <div>
            <h3 className="font-heading font-semibold text-foreground text-xl">
              Click through it yourself
            </h3>
            <p className="mt-1 text-muted-foreground text-sm">
              Everything happens in your browser. No terminal, no code, nothing
              to install.
            </p>
            <ol className="my-5 grid gap-3 text-sm leading-relaxed">
              {[
                [
                  "Click Deploy with CloudFormation",
                  " in the Wraps dashboard. AWS opens a ready-made setup.",
                ],
                ["Approve it", " in AWS and wait for it to finish."],
                [
                  "Paste two values",
                  " from AWS (a role ARN and an external ID) back into Wraps. Done.",
                ],
              ].map(([bold, rest], i) => (
                <li className="flex gap-3" key={bold}>
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border font-semibold text-foreground text-xs">
                    {i + 1}
                  </span>
                  <span className="text-muted-foreground">
                    <b className="font-semibold text-foreground">{bold}</b>
                    {rest}
                  </span>
                </li>
              ))}
            </ol>
            <Button asChild size="lg" variant="brand">
              <a
                href="https://app.wraps.dev/auth?mode=signup"
                onClick={() => track("Start free and connect", "setup_browser")}
              >
                Start free and connect
              </a>
            </Button>
          </div>
          <FlowBox label="What you need">
            <Notes
              items={[
                "An AWS account. Creating one is free.",
                "Access to your domain's settings, or someone who has it.",
                "Nothing to install, no servers to run.",
              ]}
            />
          </FlowBox>
        </div>
      </Tabs.Content>

      <Tabs.Content className="outline-none" value="agent">
        <div className="grid items-start gap-8 lg:grid-cols-2">
          <div>
            <h3 className="font-heading font-semibold text-foreground text-xl">
              Pick where to open it
            </h3>
            <p className="mt-1 text-muted-foreground text-sm">
              The setup steps are already typed in. Nothing runs until you press
              Enter.
            </p>
            <div className="my-5 grid gap-2.5 sm:grid-cols-2">
              <Tile
                href={links.claudeApp}
                main
                note="Claude Code inside the desktop app"
                title="Claude app"
              />
              <Tile
                href={links.claudeCode}
                note="Opens in your terminal"
                title="Claude Code"
              />
              <Tile
                href={links.cursor}
                note="Opens the agent chat"
                title="Cursor"
              />
              <CopyPromptTile prompt={links.prompt} />
            </div>
            <Notes
              items={[
                "You'll need AWS access set up on your computer, Node.js, and Claude or Cursor.",
                "The prompt tells your agent to stop and ask you before signing in, picking a region or deploying.",
              ]}
            />
            <p className="mt-4 text-muted-foreground text-sm">
              Nothing opened? Claude Code links work after you&apos;ve used
              Claude Code once on this computer. Copy the prompt instead.
            </p>
            <details className="mt-4 border border-border">
              <summary className="cursor-pointer px-4 py-2.5 font-medium text-foreground text-sm focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2">
                See the prompt
              </summary>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap border-border border-t p-4 text-muted-foreground text-xs leading-relaxed">
                {links.prompt}
              </pre>
            </details>
          </div>

          <FlowBox label="Claude · Setting up Wraps">
            <span className="absolute -top-2.5 right-3 bg-background px-2 font-sans font-semibold text-2xs text-muted-foreground uppercase tracking-eyebrow">
              Illustration
            </span>
            <ol
              aria-label="Illustration of an AI agent setting up Wraps"
              className="grid gap-2.5 text-sm"
            >
              {ILLUSTRATION.map((m) => (
                <li
                  className={
                    m.who === "you"
                      ? "ml-auto max-w-[85%] border border-border bg-muted/40 px-3 py-2 text-foreground"
                      : "flex gap-2.5 text-muted-foreground"
                  }
                  key={m.text}
                >
                  {m.who === "you" ? null : (
                    <span
                      aria-hidden="true"
                      className={`mt-1.5 size-2 shrink-0 rounded-full ${m.who === "ask" ? "bg-brand" : "bg-success"}`}
                    />
                  )}
                  <span>
                    {m.who === "ask" ? (
                      <em className="mr-1.5 font-semibold text-brand-text not-italic">
                        Needs you
                      </em>
                    ) : null}
                    {m.who === "end" ? (
                      <>
                        <b className="font-semibold text-foreground">
                          Deployed.
                        </b>{" "}
                        Next: add your domain in the dashboard.
                      </>
                    ) : (
                      m.text
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </FlowBox>
        </div>
      </Tabs.Content>
    </Tabs.Root>
  );
}
