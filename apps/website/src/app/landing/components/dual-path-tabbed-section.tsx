"use client";

import type { LucideIcon } from "lucide-react";
import { FileCode2, Workflow } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  CodeBlock,
  CodeBlockBody,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockFiles,
  CodeBlockHeader,
  CodeBlockItem,
} from "@/components/ui/shadcn-io/code-block";
import { assetUrl, cn } from "@/lib/utils";

type TabKey = "automations" | "templates";

const tabs: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: "automations", label: "Automations", icon: Workflow },
  { key: "templates", label: "Templates", icon: FileCode2 },
];

const workflowCode = `import { defineWorkflow, sendEmail, delay, condition } from '@wraps.dev/client';

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
        no: [sendEmail('nudge', { template: 'setup-nudge' })],
      },
    }),
  ],
});`;

const templateCode = `import { Html, Body, Container, Text, Button } from '@react-email/components';

export const subject = 'Welcome, {{name}}!';
export const previewText = 'Your account is ready';

export default function Welcome({ name, url }: Props) {
  return (
    <Html>
      <Body>
        <Container>
          <Text>Hi {name}, your account is ready.</Text>
          <Button href={url}>Open Dashboard</Button>
        </Container>
      </Body>
    </Html>
  );
}`;

function TabBar({
  activeIndex,
  onTabClick,
}: {
  activeIndex: number;
  onTabClick: (index: number) => void;
}) {
  return (
    <div className="mb-8 flex justify-center">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-brand/20 blur-xl" />
        <div className="relative inline-flex gap-1 rounded-full border border-brand/20 bg-background/80 p-1.5 shadow-lg backdrop-blur-sm dark:bg-background/50">
          {tabs.map((tab, index) => {
            const isActive = activeIndex === index;
            const Icon = tab.icon;
            return (
              <button
                className={cn(
                  "group relative flex items-center gap-2 overflow-hidden rounded-full px-5 py-2.5 font-medium text-sm transition-all duration-300",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-lg shadow-brand/30"
                    : "text-muted-foreground hover:bg-brand/10 hover:text-foreground dark:hover:bg-brand/20"
                )}
                key={tab.key}
                onClick={() => onTabClick(index)}
                type="button"
              >
                {isActive && (
                  <div className="absolute inset-0 rounded-full bg-brand blur-md opacity-50" />
                )}
                <Icon
                  className={cn(
                    "relative size-4 transition-transform duration-300",
                    isActive
                      ? "scale-110"
                      : "group-hover:scale-110 group-hover:text-brand-text"
                  )}
                />
                <span className="relative">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ComparisonPanel({
  codeData,
  codeLang,
  codeCaption,
  imageLightSrc,
  imageDarkSrc,
  imageAlt,
  imageLink,
  visualCaption,
}: {
  codeData: { language: string; filename: string; code: string }[];
  codeLang: string;
  codeCaption: string;
  imageLightSrc: string;
  imageDarkSrc: string;
  imageAlt: string;
  imageLink?: string;
  visualCaption: string;
}) {
  return (
    <div className="grid gap-4 md:gap-6 md:grid-cols-2">
      {/* Code side */}
      <div className="flex min-w-0 flex-col">
        <Link
          className="mb-3 flex items-center gap-2 rounded-full w-fit px-1 transition-colors hover:bg-success/5"
          href="/sdk"
        >
          <span className="inline-flex items-center rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">
            Code
          </span>
          <span className="text-sm text-muted-foreground">for engineers</span>
        </Link>
        <CodeBlock
          className="h-auto flex-1"
          data={codeData}
          defaultValue={codeLang}
        >
          <CodeBlockHeader>
            <CodeBlockFiles>
              {(item) => (
                <CodeBlockFilename key={item.language} value={item.language}>
                  {item.filename}
                </CodeBlockFilename>
              )}
            </CodeBlockFiles>
            <CodeBlockCopyButton />
          </CodeBlockHeader>
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
        <p className="mt-3 text-sm text-muted-foreground">{codeCaption}</p>
      </div>

      {/* Visual side */}
      <div className="flex min-w-0 flex-col">
        <Link
          className="mb-3 flex items-center gap-2 rounded-full w-fit px-1 transition-colors hover:bg-brand/5"
          href="/platform"
        >
          <span className="inline-flex items-center rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-medium text-brand-text">
            Visual
          </span>
          <span className="text-sm text-muted-foreground">for your team</span>
        </Link>
        {imageLink ? (
          <Link
            className="group/img flex-1 overflow-hidden rounded-lg md:rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md"
            href={imageLink}
          >
            <Image
              alt={imageAlt}
              className="block w-full object-cover transition-transform duration-300 group-hover/img:scale-[1.02] dark:hidden"
              height={400}
              src={imageLightSrc}
              width={600}
            />
            <Image
              alt={imageAlt}
              className="hidden w-full object-cover transition-transform duration-300 group-hover/img:scale-[1.02] dark:block"
              height={400}
              src={imageDarkSrc}
              width={600}
            />
          </Link>
        ) : (
          <div className="flex-1 overflow-hidden rounded-lg md:rounded-xl border bg-card shadow-sm">
            <Image
              alt={imageAlt}
              className="block w-full object-cover dark:hidden"
              height={400}
              src={imageLightSrc}
              width={600}
            />
            <Image
              alt={imageAlt}
              className="hidden w-full object-cover dark:block"
              height={400}
              src={imageDarkSrc}
              width={600}
            />
          </div>
        )}
        <p className="mt-3 text-sm text-muted-foreground">{visualCaption}</p>
      </div>
    </div>
  );
}

export function DualPathTabbedSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeTab = tabs[activeIndex].key;

  return (
    <section className="py-16 md:py-24" id="dual-path">
      <div className="mx-auto max-w-[1600px] px-2 sm:px-4">
        {/* Header */}
        <div className="mb-12 text-center">
          <h2 className="mb-4 font-bold text-3xl tracking-tight font-heading md:text-4xl text-balance">
            Write it in TypeScript. Or drag it onto a canvas. Nobody files a
            ticket.
          </h2>
          <p className="mx-auto max-w-3xl text-lg text-muted-foreground text-pretty">
            Automations and templates that your whole team can own. Engineers
            get TypeScript, everyone else gets a visual editor. Same result
            either way.
          </p>
        </div>

        {/* Tabs */}
        <TabBar activeIndex={activeIndex} onTabClick={setActiveIndex} />

        {/* Tab content — both panels stay mounted, hidden via CSS to prevent layout jitter */}
        <div>
          <div className={activeTab === "automations" ? "" : "hidden"}>
            <ComparisonPanel
              codeCaption="Define your welcome series next to the code that triggers it. Delays, conditions, branching, all type-safe."
              codeData={[
                {
                  language: "typescript",
                  filename: "workflows/welcome-series.ts",
                  code: workflowCode,
                },
              ]}
              codeLang="typescript"
              imageAlt="Visual workflow builder canvas with drag-and-drop nodes for delays, conditions, and email sends"
              imageDarkSrc="/automations-builder-dark.webp"
              imageLightSrc="/automations-builder-light.webp"
              imageLink="/platform#automations"
              visualCaption="Drag nodes onto a canvas. Triggers, delays, conditions — change the workflow without opening a PR."
            />
          </div>
          <div className={activeTab === "templates" ? "" : "hidden"}>
            <ComparisonPanel
              codeCaption="Your template is a React component. It lives in your repo and ships in the same PR as the feature."
              codeData={[
                {
                  language: "tsx",
                  filename: "templates/welcome.tsx",
                  code: templateCode,
                },
              ]}
              codeLang="tsx"
              imageAlt="Template editor with AI chat panel generating a welcome email"
              imageDarkSrc={assetUrl("template-editor-full-dark.webp")}
              imageLightSrc={assetUrl("template-editor-full-light.webp")}
              imageLink="/platform#templates"
              visualCaption="Chat with the AI, edit the result visually, or eject to code. No ticket required."
            />
          </div>
        </div>

        {/* Convergence */}
        <div className="mt-16 text-center">
          <div className="mx-auto mb-6 flex max-w-md items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-sm font-medium text-muted-foreground">
              Same output
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <p className="text-lg text-muted-foreground">
            Same execution engine, same git history, same deploy pipeline.
            Switch whenever you want.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              className="inline-flex items-center text-sm font-medium text-brand-text hover:text-brand-text"
              href="/docs/quickstart/email"
            >
              Start with code →
            </Link>
            <Link
              className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground"
              href="/platform#automations"
            >
              See the visual builder →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
