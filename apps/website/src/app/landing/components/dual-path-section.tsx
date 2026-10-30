"use client";

import Image from "next/image";
import Link from "next/link";
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
import { assetUrl } from "@/lib/utils";

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

const workflowData = [
  {
    language: "typescript",
    filename: "workflows/welcome-series.ts",
    code: workflowCode,
  },
];

const templateData = [
  { language: "tsx", filename: "templates/welcome.tsx", code: templateCode },
];

function ComparisonRow({
  label,
  codeData,
  codeLang,
  codeCaption,
  imageLightSrc,
  imageDarkSrc,
  imageAlt,
  imageLink,
  visualCaption,
}: {
  label: string;
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
    <div>
      <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <div className="grid gap-4 md:gap-6 md:grid-cols-2">
        {/* Code side */}
        <div className="flex min-w-0 flex-col">
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
    </div>
  );
}

export function DualPathSection() {
  return (
    <section className="py-16 md:py-24" id="dual-path">
      <div className="mx-auto max-w-[1600px] px-2 sm:px-4">
        {/* Header */}
        <div className="mb-12">
          <div className="mb-8 flex flex-wrap items-center justify-center gap-3 sm:gap-6">
            <Link
              className="flex items-center gap-2 rounded-full px-3 py-1 transition-colors hover:bg-success/5"
              href="/sdk"
            >
              <span className="inline-flex items-center rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">
                Code
              </span>
              <span className="text-sm text-muted-foreground">
                for engineers
              </span>
            </Link>
            <span className="text-sm text-muted-foreground">+</span>
            <Link
              className="flex items-center gap-2 rounded-full px-3 py-1 transition-colors hover:bg-brand/5"
              href="/platform"
            >
              <span className="inline-flex items-center rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-medium text-brand-text">
                Visual
              </span>
              <span className="text-sm text-muted-foreground">
                for marketers
              </span>
            </Link>
          </div>
          <h2 className="mb-4 text-center font-bold text-3xl tracking-tight font-heading md:text-4xl">
            One platform. No more handoffs.
          </h2>
          <p className="mx-auto max-w-3xl text-center text-lg text-muted-foreground text-pretty">
            Engineers define automations in TypeScript. Marketers drag nodes on
            a canvas. Same result, different tools — nobody waits on anyone.
          </p>
        </div>

        {/* Comparison rows */}
        <div className="space-y-10 md:space-y-16">
          {/* Automations */}
          <ComparisonRow
            codeCaption="Delays, conditions, branching — all type-safe. Ship your onboarding sequence in the same PR as your signup flow."
            codeData={workflowData}
            codeLang="typescript"
            imageAlt="Visual workflow builder canvas with drag-and-drop nodes for delays, conditions, and email sends"
            imageDarkSrc="/automations-builder-dark.webp"
            imageLightSrc="/automations-builder-light.webp"
            imageLink="/platform#automations"
            label="Automations"
            visualCaption="Drag nodes onto a canvas. Connect triggers, delays, and conditions. No code required — same workflow under the hood."
          />

          {/* Templates */}
          <ComparisonRow
            codeCaption="Typed props. Component composition. Reviewed in the same PR as the feature it supports."
            codeData={templateData}
            codeLang="tsx"
            imageAlt="Template editor with AI chat panel generating a welcome email"
            imageDarkSrc={assetUrl("template-editor-full-dark.webp")}
            imageLightSrc={assetUrl("template-editor-full-light.webp")}
            imageLink="/platform#templates"
            label="Templates"
            visualCaption="Describe what you want. AI generates the template. Edit visually or switch to code. No ticket required."
          />
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
            Same execution engine. Same git history. Same deploy pipeline. Code
            or visual — your choice, every time.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              className="inline-flex items-center text-sm font-medium text-brand-text hover:text-brand-text"
              href="/docs/quickstart/email"
            >
              Read the docs →
            </Link>
            <Link
              className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground"
              href="/platform#automations"
            >
              Try the builder →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
