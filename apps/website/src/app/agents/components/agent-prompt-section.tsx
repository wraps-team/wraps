"use client";

import { Card, CardContent } from "@wraps/ui/components/ui/card";
import { Clipboard, Sparkles, Wand2 } from "lucide-react";
import { useState } from "react";

type Prompt = {
  id: string;
  icon: typeof Sparkles;
  label: string;
  subtitle: string;
  body: string;
};

const prompts: Prompt[] = [
  {
    id: "deploy",
    icon: Sparkles,
    label: "Ask Claude Code to deploy Wraps",
    subtitle: "Paste into Claude Code, Cursor, or any agent with shell access.",
    body: `Deploy Wraps email infrastructure to my AWS account:

1. Use the Context7 MCP server to pull the latest @wraps.dev/cli docs.
2. Run: npx @wraps.dev/cli email init
3. After it finishes, verify my sending domain with:
   npx @wraps.dev/cli email domains verify -d <my-domain>
4. Print the messageId of a test send to confirm.`,
  },
  {
    id: "integrate",
    icon: Wand2,
    label: "Ask your agent to wire send_email as a tool",
    subtitle: "For agents that generate code in your repo.",
    body: `Add a typed send_email tool to this codebase:

1. Install @wraps.dev/email.
2. Create src/tools/send-email.ts exporting an async function sendEmail({ to, subject, html })
   that calls email.send and throws on failure.
3. Register it with the existing agent framework (LangGraph / Vercel AI SDK / Mastra).
4. Use Context7 to reference @wraps.dev/email docs while writing it.`,
  },
  {
    id: "debug",
    icon: Clipboard,
    label: "Ask your agent to debug a bounce",
    subtitle: "Pulls logs from your AWS, not ours.",
    body: `A message to user@example.com bounced. Investigate using my Wraps deployment:

1. Check CloudWatch logs in the wraps-email-* Lambda for the messageId.
2. Look at the SES suppression list for the recipient.
3. Summarize the bounce reason and recommend one next action.`,
  },
];

export function AgentsPromptSection() {
  const [activeId, setActiveId] = useState(prompts[0].id);
  const [copied, setCopied] = useState(false);
  const active = prompts.find((p) => p.id === activeId) ?? prompts[0];

  const onCopy = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }
    await navigator.clipboard.writeText(active.body);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <section className="py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 max-w-3xl">
          <div className="mb-4 inline-flex items-center gap-2 font-mono text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
            <span className="size-1.5 rounded-full bg-orange-500" />
            <span>what to tell your agent</span>
          </div>
          <h2 className="mb-3 font-bold text-3xl tracking-tight sm:text-4xl">
            Copy-paste prompts for your agent.
          </h2>
          <p className="text-lg text-muted-foreground">
            Wraps is a set of primitives agents can already use. Here's exactly
            what to say.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          {/* Prompt list (tabs) */}
          <div className="flex flex-col gap-2">
            {prompts.map((prompt) => {
              const Icon = prompt.icon;
              const isActive = prompt.id === activeId;
              return (
                <button
                  className={`group flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                    isActive
                      ? "border-orange-500/40 bg-orange-500/5"
                      : "border-border bg-card hover:border-orange-500/20"
                  }`}
                  key={prompt.id}
                  onClick={() => setActiveId(prompt.id)}
                  type="button"
                >
                  <Icon
                    className={`mt-0.5 size-4 shrink-0 ${
                      isActive ? "text-orange-500" : "text-muted-foreground"
                    }`}
                  />
                  <span>
                    <span
                      className={`block font-medium text-sm ${
                        isActive ? "text-foreground" : "text-foreground/80"
                      }`}
                    >
                      {prompt.label}
                    </span>
                    <span className="mt-0.5 block text-muted-foreground text-xs">
                      {prompt.subtitle}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active prompt */}
          <Card className="overflow-hidden border-border bg-card">
            <div className="flex items-center justify-between border-border/60 border-b px-4 py-3">
              <span className="font-mono text-[11px] text-muted-foreground tracking-wider uppercase">
                prompt.md
              </span>
              <button
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 font-mono text-[11px] text-muted-foreground uppercase tracking-wider hover:border-orange-500/40 hover:text-foreground"
                onClick={onCopy}
                type="button"
              >
                <Clipboard className="size-3" />
                {copied ? "copied" : "copy"}
              </button>
            </div>
            <CardContent className="p-0">
              <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap break-words px-5 py-5 font-mono text-[13px] leading-relaxed text-foreground/90">
                {active.body}
              </pre>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
