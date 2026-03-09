"use client";

import type { LucideIcon } from "lucide-react";
import { Bot, Code2, GitBranch, MousePointerClick, Play } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  CodeBlock,
  CodeBlockBody,
  CodeBlockContent,
  CodeBlockItem,
} from "@/components/ui/shadcn-io/code-block";
import { cn } from "@/lib/utils";
import { FadeIn, ScaleIn } from "./animations";
import { InteractiveWorkflowBuilder } from "./workflow-builder-section";

type ViewMode = "code" | "visual";

const WORKFLOW_CODE = `import {
  defineWorkflow,
  sendEmail,
  delay,
  condition,
  sendSms,
} from '@wraps.dev/client';

export default defineWorkflow({
  name: 'Welcome Series',
  trigger: { type: 'contact_created' },

  steps: [
    sendEmail('welcome', { template: 'welcome-email' }),
    delay('wait-1-day', { days: 1 }),
    condition('setup-complete', {
      field: 'contact.hasCompletedSetup',
      operator: 'equals',
      value: true,
      branches: {
        yes: [sendEmail('success', { template: 'success-story' })],
        no: [sendSms('nudge', { template: 'setup-nudge' })],
      },
    }),
  ],
});`;

const PUSH_CODE = "npx wraps email workflows push";

const features: {
  icon: LucideIcon;
  title: string;
  description: string;
}[] = [
  {
    icon: Code2,
    title: "Developers write code",
    description:
      "Define workflows in TypeScript, version in git, deploy with CI",
  },
  {
    icon: MousePointerClick,
    title: "Teams use the builder",
    description:
      "AI generates workflows from prompts for marketing, sales, and ops",
  },
  {
    icon: Play,
    title: "Runs on the platform",
    description: "Managed execution with built-in retries and logging",
  },
  {
    icon: Bot,
    title: "AI-ready by default",
    description:
      "AI agents use CLIs, not dashboards. Your AI writes workflows and deploys them.",
  },
];

function CodeView() {
  return (
    <div>
      <CodeBlock
        className="h-auto rounded-none border-0"
        data={[
          {
            language: "typescript",
            filename: "welcome-series.ts",
            code: WORKFLOW_CODE,
          },
        ]}
        defaultValue="typescript"
      >
        <CodeBlockBody>
          {(item) => (
            <CodeBlockItem
              key={item.language}
              lineNumbers={false}
              value={item.language}
            >
              <CodeBlockContent language={item.language}>
                {item.code}
              </CodeBlockContent>
            </CodeBlockItem>
          )}
        </CodeBlockBody>
      </CodeBlock>

      <div className="border-t">
        <CodeBlock
          className="h-auto rounded-none border-0"
          data={[
            {
              language: "bash",
              filename: "terminal",
              code: PUSH_CODE,
            },
          ]}
          defaultValue="bash"
        >
          <CodeBlockBody>
            {(item) => (
              <CodeBlockItem
                key={item.language}
                lineNumbers={false}
                value={item.language}
              >
                <CodeBlockContent language={item.language}>
                  {item.code}
                </CodeBlockContent>
              </CodeBlockItem>
            )}
          </CodeBlockBody>
        </CodeBlock>
      </div>
    </div>
  );
}

function ViewToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
}) {
  return (
    <div className="relative inline-flex rounded-full border bg-muted/50 p-1">
      <div
        className={cn(
          "absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full bg-background shadow-sm transition-transform duration-200 ease-out",
          value === "visual" ? "translate-x-[calc(100%+4px)]" : "translate-x-0"
        )}
      />
      <button
        aria-pressed={value === "code"}
        className={cn(
          "relative z-10 flex items-center gap-1.5 rounded-full px-3 py-1 font-medium text-xs transition-colors",
          value === "code"
            ? "text-foreground"
            : "text-muted-foreground hover:text-foreground"
        )}
        onClick={() => onChange("code")}
        type="button"
      >
        <Code2 className="size-3" />
        Code
      </button>
      <button
        aria-pressed={value === "visual"}
        className={cn(
          "relative z-10 flex items-center gap-1.5 rounded-full px-3 py-1 font-medium text-xs transition-colors",
          value === "visual"
            ? "text-foreground"
            : "text-muted-foreground hover:text-foreground"
        )}
        onClick={() => onChange("visual")}
        type="button"
      >
        <GitBranch className="size-3" />
        AI Builder
      </button>
    </div>
  );
}

export function AutomationsCodePanel() {
  const [view, setView] = useState<ViewMode>("code");

  return (
    <div className="space-y-10">
      {/* View toggle */}
      <ScaleIn>
        <div className="flex justify-center">
          <ViewToggle onChange={setView} value={view} />
        </div>
      </ScaleIn>

      {/* Content */}
      <ScaleIn delay={0.1}>
        {view === "code" ? (
          <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border bg-card shadow-lg">
            {/* Traffic-light header */}
            <div className="flex items-center border-b bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5">
                  <div className="size-3 rounded-full bg-red-500/80" />
                  <div className="size-3 rounded-full bg-yellow-500/80" />
                  <div className="size-3 rounded-full bg-green-500/80" />
                </div>
                <span className="font-mono text-muted-foreground text-xs">
                  welcome-series.ts
                </span>
              </div>
            </div>
            <CodeView />
          </div>
        ) : (
          <div className="mx-auto max-w-5xl">
            <InteractiveWorkflowBuilder />
          </div>
        )}
      </ScaleIn>

      {/* Deploy pill */}
      <FadeIn className="text-center" delay={0.1}>
        <div className="inline-flex items-center gap-2 rounded-full border bg-muted/50 px-4 py-2">
          <code className="text-sm">
            <span className="text-orange-500">wraps email workflows push</span>
          </code>
          <span className="text-muted-foreground text-xs">
            → deploys to Wraps platform
          </span>
        </div>
      </FadeIn>

      {/* Feature cards */}
      <FadeIn delay={0.2}>
        <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                className="flex flex-col items-center rounded-xl border bg-background p-6 text-center"
                key={feature.title}
              >
                <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-orange-500/10">
                  <Icon className="size-6 text-orange-500" />
                </div>
                <h4 className="mb-1 font-semibold text-sm">{feature.title}</h4>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </FadeIn>

      {/* CTA */}
      <FadeIn className="text-center" delay={0.3}>
        <Button asChild className="bg-orange-500 hover:bg-orange-600" size="lg">
          <a href="https://app.wraps.dev/auth?mode=signup">
            Start building automations
            <MousePointerClick className="ml-2 size-4" />
          </a>
        </Button>
        <p className="mt-3 text-muted-foreground text-sm">
          1 workflow included free. Unlimited workflows on Starter ($19/mo).
        </p>
      </FadeIn>
    </div>
  );
}
