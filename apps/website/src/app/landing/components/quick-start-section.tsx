"use client";

import { Check, Code2, Terminal } from "lucide-react";
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
import {
  Snippet,
  SnippetCopyButton,
  SnippetHeader,
  SnippetTabsContent,
  SnippetTabsList,
  SnippetTabsTrigger,
} from "@/components/ui/shadcn-io/snippet";
import { IconBox, SectionCard, SectionWrapper, TabBar } from "./section-card";

const installCommands = {
  npm: "npm install @wraps.dev/email",
  pnpm: "pnpm add @wraps.dev/email",
  yarn: "yarn add @wraps.dev/email",
  bun: "bun add @wraps.dev/email",
};

const cliExample = `# Deploy infrastructure to AWS
npx @wraps.dev/cli email init

# Add and verify your domain
npx @wraps.dev/cli email domains add -d yourdomain.com
npx @wraps.dev/cli email domains verify -d yourdomain.com

# View deployment status
npx @wraps.dev/cli email status`;

const sdkExample = `import { WrapsEmail } from '@wraps.dev/email';

const email = new WrapsEmail();

const result = await email.send({
  from: 'hello@yourdomain.com',
  to: 'user@example.com',
  subject: 'Welcome to our app!',
  html: '<h1>Welcome!</h1><p>Thanks for signing up.</p>',
});

if (result.success) {
  console.log('Email sent:', result.data.messageId);
}`;

type TabKey = "deploy" | "send";

const tabContent = {
  deploy: {
    title: "Deploy in Under 2 Minutes",
    description:
      "One command deploys SES, DynamoDB, Lambda, EventBridge, and IAM roles. Zero clicking through the AWS Console.",
    ctaText: "View CLI Reference",
    ctaLink: "/docs/cli-reference",
  },
  send: {
    title: "TypeScript-First SDK",
    description:
      "Clean API with full type safety. Automatic credential handling via OIDC. Just email.send() - no boilerplate.",
    ctaText: "View SDK Reference",
    ctaLink: "/docs/sdk-reference",
  },
};

export function QuickStartSection() {
  const [activeTab, setActiveTab] = useState<TabKey>("deploy");

  return (
    <SectionWrapper
      badge="Free · CLI + SDK"
      description="No clicking through IAM, no manual DNS, no SES configuration. Two steps to production-ready email."
      id="quickstart"
      title="Skip the AWS Console"
    >
      <SectionCard
        footer={tabContent[activeTab]}
        header={
          <TabBar
            activeTab={activeTab}
            onTabChange={(tab) => setActiveTab(tab as TabKey)}
            tabs={[
              { key: "deploy", label: "1. Deploy" },
              { key: "send", label: "2. Send" },
            ]}
          />
        }
      >
        {activeTab === "deploy" ? (
          <div className="space-y-6">
            {/* Step indicator */}
            <div className="flex items-center gap-3">
              <IconBox highlighted icon={Terminal} />
              <div>
                <h3 className="font-semibold text-orange-500">
                  Deploy Infrastructure
                </h3>
                <p className="text-muted-foreground text-sm">
                  Run these commands in your terminal
                </p>
              </div>
            </div>

            {/* CLI Code Block */}
            <CodeBlock
              className="h-auto"
              data={[
                { language: "bash", filename: "terminal", code: cliExample },
              ]}
              defaultValue="bash"
            >
              <CodeBlockHeader>
                <CodeBlockFiles>
                  {(item) => (
                    <CodeBlockFilename
                      key={item.language}
                      value={item.language}
                    >
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

            {/* Benefits list */}
            <div className="grid gap-3 rounded-lg bg-background p-4 sm:grid-cols-2">
              {[
                "Validates AWS credentials",
                "Shows cost estimates upfront",
                "Deploys all resources automatically",
                "Zero stored credentials (OIDC)",
              ].map((item) => (
                <div className="flex items-center gap-2" key={item}>
                  <Check className="size-4 text-orange-500" />
                  <span className="text-sm">{item}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Step indicator */}
            <div className="flex items-center gap-3">
              <IconBox highlighted icon={Code2} />
              <div>
                <h3 className="font-semibold text-orange-500">
                  Install SDK & Send Emails
                </h3>
                <p className="text-muted-foreground text-sm">
                  Add the package and start sending
                </p>
              </div>
            </div>

            {/* Package Manager Tabs */}
            <Snippet className="mb-4" defaultValue="npm">
              <SnippetHeader>
                <SnippetTabsList>
                  <SnippetTabsTrigger value="npm">npm</SnippetTabsTrigger>
                  <SnippetTabsTrigger value="pnpm">pnpm</SnippetTabsTrigger>
                  <SnippetTabsTrigger value="yarn">yarn</SnippetTabsTrigger>
                  <SnippetTabsTrigger value="bun">bun</SnippetTabsTrigger>
                </SnippetTabsList>
                <SnippetCopyButton
                  className="opacity-100"
                  value={installCommands.npm}
                />
              </SnippetHeader>
              {Object.entries(installCommands).map(([key, command]) => (
                <SnippetTabsContent key={key} value={key}>
                  {command}
                </SnippetTabsContent>
              ))}
            </Snippet>

            {/* SDK Code Block */}
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "typescript",
                  filename: "send-email.ts",
                  code: sdkExample,
                },
              ]}
              defaultValue="typescript"
            >
              <CodeBlockHeader>
                <CodeBlockFiles>
                  {(item) => (
                    <CodeBlockFilename
                      key={item.language}
                      value={item.language}
                    >
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

            {/* Benefits list */}
            <div className="grid gap-3 rounded-lg bg-background p-4 sm:grid-cols-2">
              {[
                "Full TypeScript support",
                "Automatic OIDC credentials",
                "Simple, intuitive API",
                "Detailed error messages",
              ].map((item) => (
                <div className="flex items-center gap-2" key={item}>
                  <Check className="size-4 text-orange-500" />
                  <span className="text-sm">{item}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </SectionCard>
    </SectionWrapper>
  );
}
