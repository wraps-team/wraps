"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import { Button } from "@wraps/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import {
  ArrowRight,
  CheckCircle2,
  Layers,
  Rocket,
  Sparkles,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { DocsLayout } from "@/components/docs-layout";
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

function CodeExample({
  code,
  filename,
  language = "typescript",
}: {
  code: string;
  filename: string;
  language?: string;
}) {
  return (
    <CodeBlock
      className="h-auto"
      data={[{ language, filename, code }]}
      defaultValue={language}
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
  );
}

const upgradeCommands = `# View current preset
wraps email status

# Upgrade to production
wraps email upgrade --preset production

# Upgrade to enterprise
wraps email upgrade --preset enterprise`;

export default function ConfigurationPresetsPageContent() {
  return (
    <DocsLayout>
      {/* Page Header */}
      <div className="mb-12">
        <Badge className="mb-4" variant="outline">
          Guide
        </Badge>
        <h1 className="mb-4 font-bold text-4xl tracking-tight">
          Configuration Presets
        </h1>
        <p className="text-lg text-muted-foreground">
          Wraps uses feature-based presets to configure your email
          infrastructure. Each preset adds more AWS resources and capabilities.
        </p>
      </div>

      {/* Overview */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Overview</h2>
        <p className="mb-4 text-muted-foreground">
          When you run{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            wraps email init
          </code>
          , you choose a configuration preset that determines which AWS
          resources are deployed. Presets are designed to match your sending
          volume and feature needs, from a simple setup for side projects to a
          full-featured stack for high-volume senders.
        </p>
        <p className="text-muted-foreground">
          All presets deploy to your AWS account. You own the infrastructure and
          pay AWS directly at transparent pricing.
        </p>
      </section>

      {/* Comparison Matrix */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Preset Comparison</h2>
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="pb-3 pr-4 text-left font-medium">Feature</th>
                <th className="pb-3 px-4 text-center font-medium">Starter</th>
                <th className="pb-3 px-4 text-center font-medium">
                  Production
                </th>
                <th className="pb-3 pl-4 text-center font-medium">
                  Enterprise
                </th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b">
                <td className="py-3 pr-4 font-medium text-foreground">
                  Open & Click Tracking
                </td>
                <td className="py-3 px-4 text-center">
                  <CheckCircle2 className="mx-auto h-4 w-4 text-success" />
                </td>
                <td className="py-3 px-4 text-center">
                  <CheckCircle2 className="mx-auto h-4 w-4 text-success" />
                </td>
                <td className="py-3 pl-4 text-center">
                  <CheckCircle2 className="mx-auto h-4 w-4 text-success" />
                </td>
              </tr>
              <tr className="border-b">
                <td className="py-3 pr-4 font-medium text-foreground">
                  Bounce/Complaint Suppression
                </td>
                <td className="py-3 px-4 text-center">
                  <CheckCircle2 className="mx-auto h-4 w-4 text-success" />
                </td>
                <td className="py-3 px-4 text-center">
                  <CheckCircle2 className="mx-auto h-4 w-4 text-success" />
                </td>
                <td className="py-3 pl-4 text-center">
                  <CheckCircle2 className="mx-auto h-4 w-4 text-success" />
                </td>
              </tr>
              <tr className="border-b">
                <td className="py-3 pr-4 font-medium text-foreground">
                  Real-time Event Tracking
                </td>
                <td className="py-3 px-4 text-center text-muted-foreground">
                  &mdash;
                </td>
                <td className="py-3 px-4 text-center">
                  <CheckCircle2 className="mx-auto h-4 w-4 text-success" />
                </td>
                <td className="py-3 pl-4 text-center">
                  <CheckCircle2 className="mx-auto h-4 w-4 text-success" />
                </td>
              </tr>
              <tr className="border-b">
                <td className="py-3 pr-4 font-medium text-foreground">
                  Email History Storage
                </td>
                <td className="py-3 px-4 text-center text-muted-foreground">
                  &mdash;
                </td>
                <td className="py-3 px-4 text-center">90 days</td>
                <td className="py-3 pl-4 text-center">365 days</td>
              </tr>
              <tr className="border-b">
                <td className="py-3 pr-4 font-medium text-foreground">
                  Reputation Metrics
                </td>
                <td className="py-3 px-4 text-center text-muted-foreground">
                  &mdash;
                </td>
                <td className="py-3 px-4 text-center">
                  <CheckCircle2 className="mx-auto h-4 w-4 text-success" />
                </td>
                <td className="py-3 pl-4 text-center">
                  <CheckCircle2 className="mx-auto h-4 w-4 text-success" />
                </td>
              </tr>
              <tr className="border-b">
                <td className="py-3 pr-4 font-medium text-foreground">
                  SES Event Types
                </td>
                <td className="py-3 px-4 text-center">4</td>
                <td className="py-3 px-4 text-center">6</td>
                <td className="py-3 pl-4 text-center">All 10</td>
              </tr>
              <tr>
                <td className="py-3 pr-4 font-medium text-foreground">
                  Est. Monthly Cost
                </td>
                <td className="py-3 px-4 text-center font-medium text-foreground">
                  ~$0.05
                </td>
                <td className="py-3 px-4 text-center font-medium text-foreground">
                  ~$2-5
                </td>
                <td className="py-3 pl-4 text-center font-medium text-foreground">
                  ~$50-100
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Starter Preset */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Zap className="h-6 w-6 text-primary" />
          Starter Preset
        </h2>
        <Badge className="mb-4" variant="secondary">
          ~$0.05/mo
        </Badge>
        <p className="mb-4 text-muted-foreground">
          Minimal tracking for low-volume senders. Deploys a lightweight SES
          configuration set with engagement tracking and a suppression list for
          bounces and complaints.
        </p>
        <Card className="mb-4">
          <CardContent className="p-6">
            <h3 className="mb-3 font-medium">What you get:</h3>
            <ul className="space-y-2">
              <li className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                <span className="text-muted-foreground">
                  SES configuration set with engagement tracking
                </span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                <span className="text-muted-foreground">
                  Bounce and complaint suppression list
                </span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                <span className="text-muted-foreground">
                  Open and click tracking
                </span>
              </li>
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <h3 className="mb-2 font-medium">Event types tracked:</h3>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">BOUNCE</Badge>
              <Badge variant="outline">COMPLAINT</Badge>
              <Badge variant="outline">OPEN</Badge>
              <Badge variant="outline">CLICK</Badge>
            </div>
          </CardContent>
        </Card>
        <div className="mt-4 rounded-lg border-primary border-l-4 bg-primary/10 p-4">
          <p className="font-medium text-sm">Perfect for:</p>
          <p className="mt-1 text-muted-foreground text-sm">
            MVPs, side projects, early-stage apps, and any application sending
            fewer than 10,000 emails per month.
          </p>
        </div>
      </section>

      {/* Production Preset */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Rocket className="h-6 w-6 text-primary" />
          Production Preset
        </h2>
        <Badge className="mb-4" variant="secondary">
          ~$2-5/mo
        </Badge>
        <p className="mb-4 text-muted-foreground">
          Recommended for most applications. Includes everything in Starter plus
          a full event processing pipeline with real-time tracking, email
          history storage, and reputation metrics.
        </p>
        <Card className="mb-4">
          <CardContent className="p-6">
            <h3 className="mb-3 font-medium">Everything in Starter, plus:</h3>
            <ul className="space-y-2">
              <li className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                <span className="text-muted-foreground">
                  EventBridge, SQS, and Lambda event processing pipeline
                </span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                <span className="text-muted-foreground">
                  90-day email history with search (DynamoDB)
                </span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                <span className="text-muted-foreground">
                  Real-time event tracking
                </span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                <span className="text-muted-foreground">
                  Reputation metrics dashboard
                </span>
              </li>
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <h3 className="mb-2 font-medium">Event types tracked:</h3>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">SEND</Badge>
              <Badge variant="outline">DELIVERY</Badge>
              <Badge variant="outline">OPEN</Badge>
              <Badge variant="outline">CLICK</Badge>
              <Badge variant="outline">BOUNCE</Badge>
              <Badge variant="outline">COMPLAINT</Badge>
            </div>
          </CardContent>
        </Card>
        <div className="mt-4 rounded-lg border-primary border-l-4 bg-primary/10 p-4">
          <p className="font-medium text-sm">Event processing architecture:</p>
          <p className="mt-1 font-mono text-muted-foreground text-sm">
            SES &rarr; EventBridge &rarr; SQS + DLQ &rarr; Lambda &rarr;
            DynamoDB
          </p>
        </div>
      </section>

      {/* Enterprise Preset */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Sparkles className="h-6 w-6 text-primary" />
          Enterprise Preset
        </h2>
        <Badge className="mb-4" variant="secondary">
          ~$50-100/mo
        </Badge>
        <p className="mb-4 text-muted-foreground">
          For high-volume senders processing 100K+ emails per month. Includes
          everything in Production plus extended history retention and all 10
          SES event types.
        </p>
        <Card className="mb-4">
          <CardContent className="p-6">
            <h3 className="mb-3 font-medium">
              Everything in Production, plus:
            </h3>
            <ul className="space-y-2">
              <li className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                <span className="text-muted-foreground">
                  365-day email history retention
                </span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                <span className="text-muted-foreground">
                  All 10 SES event types tracked
                </span>
              </li>
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <h3 className="mb-2 font-medium">All event types tracked:</h3>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">SEND</Badge>
              <Badge variant="outline">DELIVERY</Badge>
              <Badge variant="outline">OPEN</Badge>
              <Badge variant="outline">CLICK</Badge>
              <Badge variant="outline">BOUNCE</Badge>
              <Badge variant="outline">COMPLAINT</Badge>
              <Badge variant="outline">REJECT</Badge>
              <Badge variant="outline">RENDERING_FAILURE</Badge>
              <Badge variant="outline">DELIVERY_DELAY</Badge>
              <Badge variant="outline">SUBSCRIPTION</Badge>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Cost by Volume */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Cost by Volume</h2>
        <p className="mb-4 text-muted-foreground">
          Estimated monthly costs including AWS email sending charges ($0.10 per
          1,000 emails) and infrastructure costs.
        </p>
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="pb-3 pr-4 text-left font-medium">
                  Monthly Volume
                </th>
                <th className="pb-3 px-4 text-right font-medium">Starter</th>
                <th className="pb-3 px-4 text-right font-medium">Production</th>
                <th className="pb-3 pl-4 text-right font-medium">Enterprise</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b">
                <td className="py-3 pr-4 font-medium text-foreground">1,000</td>
                <td className="py-3 px-4 text-right">$0.15</td>
                <td className="py-3 px-4 text-right">$2.15</td>
                <td className="py-3 pl-4 text-right">$52</td>
              </tr>
              <tr className="border-b">
                <td className="py-3 pr-4 font-medium text-foreground">
                  10,000
                </td>
                <td className="py-3 px-4 text-right">$1.05</td>
                <td className="py-3 px-4 text-right">$3.05</td>
                <td className="py-3 pl-4 text-right">$53</td>
              </tr>
              <tr className="border-b">
                <td className="py-3 pr-4 font-medium text-foreground">
                  100,000
                </td>
                <td className="py-3 px-4 text-right">$10.05</td>
                <td className="py-3 px-4 text-right">$14</td>
                <td className="py-3 pl-4 text-right">$64</td>
              </tr>
              <tr>
                <td className="py-3 pr-4 font-medium text-foreground">
                  1,000,000
                </td>
                <td className="py-3 px-4 text-right">$100</td>
                <td className="py-3 px-4 text-right">$110</td>
                <td className="py-3 pl-4 text-right">$175</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-muted-foreground text-sm">
          Costs are AWS charges only. Email sending is $0.10 per 1,000 emails.
          Infrastructure costs vary by preset and usage patterns.
        </p>
      </section>

      {/* Upgrading Between Presets */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Layers className="h-6 w-6 text-primary" />
          Upgrading Between Presets
        </h2>
        <p className="mb-4 text-muted-foreground">
          You can upgrade your preset at any time. Upgrades are non-destructive
          — new resources are added and existing ones stay in place.
        </p>
        <CodeExample
          code={upgradeCommands}
          filename="terminal.sh"
          language="bash"
        />
        <div className="mt-4 rounded-lg border-primary border-l-4 bg-primary/10 p-4">
          <p className="font-medium text-sm">Non-destructive upgrades</p>
          <p className="mt-1 text-muted-foreground text-sm">
            When you upgrade, Wraps adds new AWS resources alongside your
            existing ones. Your current configuration, sending history, and
            domain verification are all preserved.
          </p>
        </div>
      </section>

      {/* Next Steps */}
      <section className="mb-12">
        <h2 className="mb-6 font-bold text-2xl">Next Steps</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">
                What Gets Deployed: Email
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                See every AWS resource Wraps creates for each preset.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/infrastructure/email">
                  Infrastructure Details
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">Email Commands</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Full CLI reference for all email commands.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/cli-reference/email">
                  CLI Reference
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </DocsLayout>
  );
}
