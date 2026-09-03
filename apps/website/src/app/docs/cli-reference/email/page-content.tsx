"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import { Button } from "@wraps/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { ArrowLeft, ArrowRight, Terminal } from "lucide-react";
import Link from "next/link";
import { CLICommand } from "@/components/docs/cli-command";
import { DocsLayout } from "@/components/docs-layout";

export default function CLIReferenceEmailPageContent() {
  return (
    <DocsLayout>
      {/* Breadcrumb */}
      <div className="mb-6">
        <Button asChild className="gap-2" size="sm" variant="ghost">
          <Link href="/docs/cli-reference">
            <ArrowLeft className="h-4 w-4" />
            CLI Reference
          </Link>
        </Button>
      </div>

      {/* Page Header */}
      <div className="mb-12">
        <Badge className="mb-4" variant="outline">
          CLI Reference / Email
        </Badge>
        <h1 className="mb-4 font-bold text-4xl tracking-tight">
          Email Commands
        </h1>
        <p className="text-lg text-muted-foreground">
          Deploy and manage AWS SES email infrastructure with event tracking,
          analytics, and domain management.
        </p>
      </div>

      {/* wraps email init */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Terminal className="h-6 w-6 text-primary" />
          wraps email init
        </h2>
        <p className="mb-4 text-muted-foreground">
          Deploy new email infrastructure to your AWS account. This is the
          primary command for setting up Wraps email for the first time.
        </p>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <CLICommand command="npx @wraps.dev/cli email init [options]" />
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Options</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <code className="rounded bg-muted px-2 py-1">
                  -d, --domain &lt;domain&gt;
                </code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Domain to configure for sending emails (e.g., yourdomain.com)
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">
                  -r, --region &lt;region&gt;
                </code>
                <p className="mt-2 text-muted-foreground text-sm">
                  AWS region to deploy infrastructure (default: us-east-1)
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">
                  --preset &lt;preset&gt;
                </code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Configuration preset: starter, production, enterprise, or
                  custom
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">
                  -p, --provider &lt;provider&gt;
                </code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Hosting provider: vercel, aws, railway, or other
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">--preview</code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Preview infrastructure changes without deploying
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">-y, --yes</code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Skip the deploy confirmation
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">--quick</code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Fast path: sensible defaults, minimal prompts
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">--json</code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Machine-readable output; suppresses interactive UI
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">-f, --force</code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Proceed past preflight resource conflicts without the
                  "Continue anyway?" confirm
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">What It Does</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
              <li>Validates your AWS credentials and account access</li>
              <li>
                Prompts for configuration preferences (if not provided via
                flags)
              </li>
              <li>
                Shows estimated monthly AWS costs based on selected features
              </li>
              <li>
                Deploys AWS SES, DynamoDB, Lambda, EventBridge, SQS, and IAM
                roles
              </li>
              <li>
                Sets up OIDC provider for Vercel deployments (if selected)
              </li>
              <li>Creates configuration metadata for future commands</li>
              <li>Takes 1-2 minutes to complete</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Examples</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="mb-2 text-muted-foreground text-sm">
                Interactive setup (recommended for first time):
              </p>
              <CLICommand command="npx @wraps.dev/cli email init" />
            </div>
            <div className="mt-4">
              <p className="mb-2 text-muted-foreground text-sm">
                Non-interactive with all options:
              </p>
              <CLICommand command="npx @wraps.dev/cli email init --domain yourdomain.com --region us-west-2 --preset production --provider vercel --yes" />
            </div>
          </CardContent>
        </Card>
      </section>

      {/* wraps email status */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Terminal className="h-6 w-6 text-primary" />
          wraps email status
        </h2>
        <p className="mb-4 text-muted-foreground">
          Display detailed status for email infrastructure, including SES
          domains, verification status, and configuration details.
        </p>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <CLICommand command="npx @wraps.dev/cli email status" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">What It Displays</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
              <li>SES domain verification and DKIM status</li>
              <li>MAIL FROM domain configuration</li>
              <li>Active features and preset</li>
              <li>Deployed AWS resources</li>
              <li>DNS records that need configuration</li>
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* wraps email domains */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Terminal className="h-6 w-6 text-primary" />
          wraps email domains
        </h2>
        <p className="mb-4 text-muted-foreground">
          Manage domains in AWS SES. Add domains, list all configured domains,
          retrieve DKIM tokens, verify DNS records, and remove domains from SES.
        </p>

        {/* domains add */}
        <div className="mb-8 ml-4">
          <h3 className="mb-3 font-semibold text-xl">
            wraps email domains add
          </h3>
          <p className="mb-4 text-muted-foreground text-sm">
            Add a new domain to AWS SES with DKIM signing enabled.
          </p>
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-lg">Usage</CardTitle>
            </CardHeader>
            <CardContent>
              <CLICommand command="npx @wraps.dev/cli email domains add -d <domain>" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Options</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                <li>
                  <code className="rounded bg-muted px-2 py-1">
                    -d, --domain &lt;domain&gt;
                  </code>{" "}
                  <span className="text-muted-foreground">
                    (required) Domain name to add
                  </span>
                </li>
                <li>
                  <code className="rounded bg-muted px-2 py-1">
                    --tracking-domain &lt;host|none&gt;
                  </code>{" "}
                  <span className="text-muted-foreground">
                    Custom redirect domain for open/click links. Defaults to{" "}
                    <code className="rounded bg-muted px-1">
                      track.&lt;domain&gt;
                    </code>
                    ; pass <code className="rounded bg-muted px-1">none</code>{" "}
                    to skip.
                  </span>
                </li>
                <li>
                  <code className="rounded bg-muted px-2 py-1">
                    --tracking-https / --no-tracking-https
                  </code>{" "}
                  <span className="text-muted-foreground">
                    Serve tracking links over HTTPS via a CloudFront
                    distribution + free ACM certificate in your account
                    (defaults to on when a tracking domain is set). Costs a
                    CloudFront distribution: fractions of a cent per 10k
                    tracking requests; the certificate is free.
                  </span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* domains list */}
        <div className="mb-8 ml-4">
          <h3 className="mb-3 font-semibold text-xl">
            wraps email domains list
          </h3>
          <p className="mb-4 text-muted-foreground text-sm">
            List all domains configured in AWS SES with their verification and
            DKIM status.
          </p>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Usage</CardTitle>
            </CardHeader>
            <CardContent>
              <CLICommand command="npx @wraps.dev/cli email domains list" />
            </CardContent>
          </Card>
        </div>

        {/* domains get-dkim */}
        <div className="mb-8 ml-4">
          <h3 className="mb-3 font-semibold text-xl">
            wraps email domains get-dkim
          </h3>
          <p className="mb-4 text-muted-foreground text-sm">
            Retrieve DKIM tokens for a domain to configure DNS records.
          </p>
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-lg">Usage</CardTitle>
            </CardHeader>
            <CardContent>
              <CLICommand command="npx @wraps.dev/cli email domains get-dkim -d <domain>" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Options</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                <li>
                  <code className="rounded bg-muted px-2 py-1">
                    -d, --domain &lt;domain&gt;
                  </code>{" "}
                  <span className="text-muted-foreground">
                    (required) Domain name to get DKIM tokens for
                  </span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* domains verify */}
        <div className="mb-8 ml-4">
          <h3 className="mb-3 font-semibold text-xl">
            wraps email domains verify
          </h3>
          <p className="mb-4 text-muted-foreground text-sm">
            Check the DNS verification status of a domain, including DKIM, SPF,
            and DMARC records.
          </p>
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-lg">Usage</CardTitle>
            </CardHeader>
            <CardContent>
              <CLICommand command="npx @wraps.dev/cli email domains verify -d <domain>" />
            </CardContent>
          </Card>
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-lg">What It Checks</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
                <li>SES domain verification status</li>
                <li>DKIM DNS records (3 CNAME records)</li>
                <li>SPF record (TXT record for sender verification)</li>
                <li>
                  DMARC record (TXT record for email authentication policy)
                </li>
                <li>MAIL FROM MX records (if custom MAIL FROM configured)</li>
                <li>Provides copy-paste ready DNS record values</li>
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* domains remove */}
        <div className="mb-8 ml-4">
          <h3 className="mb-3 font-semibold text-xl">
            wraps email domains remove
          </h3>
          <p className="mb-4 text-muted-foreground text-sm">
            Remove a domain from AWS SES. This action cannot be undone.
          </p>
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-lg">Usage</CardTitle>
            </CardHeader>
            <CardContent>
              <CLICommand command="npx @wraps.dev/cli email domains remove -d <domain>" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Options</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                <li>
                  <code className="rounded bg-muted px-2 py-1">
                    -d, --domain &lt;domain&gt;
                  </code>{" "}
                  <span className="text-muted-foreground">
                    (required) Domain name to remove
                  </span>
                </li>
                <li>
                  <code className="rounded bg-muted px-2 py-1">
                    -f, --force
                  </code>{" "}
                  <span className="text-muted-foreground">
                    Skip confirmation prompt
                  </span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* domains config */}
        <div className="mb-8 ml-4">
          <h3 className="mb-3 font-semibold text-xl">
            wraps email domains config
          </h3>
          <p className="mb-4 text-muted-foreground text-sm">
            Configure SES configuration set options for a domain. Adjusts
            tracking, delivery, reputation, suppression, archiving, sending, and
            VDM settings directly on the domain&apos;s SES configuration set.
            Works in interactive menu mode or non-interactively via flags.
          </p>
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-lg">Usage</CardTitle>
            </CardHeader>
            <CardContent>
              <CLICommand command="npx @wraps.dev/cli email domains config [options]" />
            </CardContent>
          </Card>
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-lg">Options</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm">
                <li>
                  <code className="rounded bg-muted px-2 py-1">
                    -d, --domain &lt;domain&gt;
                  </code>{" "}
                  <span className="text-muted-foreground">
                    Domain to configure (prompted interactively if omitted)
                  </span>
                </li>
                <li className="pt-1 font-medium text-foreground">Tracking</li>
                <li>
                  <code className="rounded bg-muted px-2 py-1">
                    --opens / --no-opens
                  </code>{" "}
                  <span className="text-muted-foreground">
                    Enable or disable open tracking
                  </span>
                </li>
                <li>
                  <code className="rounded bg-muted px-2 py-1">
                    --clicks / --no-clicks
                  </code>{" "}
                  <span className="text-muted-foreground">
                    Enable or disable click tracking
                  </span>
                </li>
                <li>
                  <code className="rounded bg-muted px-2 py-1">
                    --tracking-domain &lt;host|none&gt;
                  </code>{" "}
                  <span className="text-muted-foreground">
                    Set or clear the custom redirect domain on this
                    domain&apos;s configuration set. Must be a subdomain of the
                    domain. Not available for the primary domain — use{" "}
                    <code className="rounded bg-muted px-1">
                      wraps email upgrade
                    </code>
                    .
                  </span>
                </li>
                <li>
                  <code className="rounded bg-muted px-2 py-1">
                    --tracking-https / --no-tracking-https
                  </code>{" "}
                  <span className="text-muted-foreground">
                    Enable or disable HTTPS for the tracking domain, backed by a
                    CloudFront distribution and an ACM certificate in your
                    account. Requires a tracking domain to already be set. Costs
                    a CloudFront distribution: fractions of a cent per 10k
                    tracking requests; the certificate is free.
                  </span>
                </li>
                <li className="pt-1 font-medium text-foreground">Delivery</li>
                <li>
                  <code className="rounded bg-muted px-2 py-1">
                    --tls-required / --no-tls-required
                  </code>{" "}
                  <span className="text-muted-foreground">
                    Require TLS encryption for delivery
                  </span>
                </li>
                <li className="pt-1 font-medium text-foreground">Sending</li>
                <li>
                  <code className="rounded bg-muted px-2 py-1">
                    --sending-enabled / --no-sending-enabled
                  </code>{" "}
                  <span className="text-muted-foreground">
                    Enable or disable sending for this domain
                  </span>
                </li>
                <li className="pt-1 font-medium text-foreground">Reputation</li>
                <li>
                  <code className="rounded bg-muted px-2 py-1">
                    --reputation-metrics / --no-reputation-metrics
                  </code>{" "}
                  <span className="text-muted-foreground">
                    Enable or disable reputation metrics tracking
                  </span>
                </li>
                <li className="pt-1 font-medium text-foreground">
                  Suppression
                </li>
                <li>
                  <code className="rounded bg-muted px-2 py-1">
                    --suppress-bounce / --no-suppress-bounce
                  </code>{" "}
                  <span className="text-muted-foreground">
                    Add or remove BOUNCE from the suppression list
                  </span>
                </li>
                <li>
                  <code className="rounded bg-muted px-2 py-1">
                    --suppress-complaint / --no-suppress-complaint
                  </code>{" "}
                  <span className="text-muted-foreground">
                    Add or remove COMPLAINT from the suppression list
                  </span>
                </li>
                <li className="pt-1 font-medium text-foreground">Archive</li>
                <li>
                  <code className="rounded bg-muted px-2 py-1">
                    --archive / --no-archive
                  </code>{" "}
                  <span className="text-muted-foreground">
                    Enable or disable email archiving via Mail Manager
                  </span>
                </li>
                <li className="pt-1 font-medium text-foreground">
                  VDM (Virtual Deliverability Manager)
                </li>
                <li>
                  <code className="rounded bg-muted px-2 py-1">
                    --vdm-engagement / --no-vdm-engagement
                  </code>{" "}
                  <span className="text-muted-foreground">
                    Enable or disable VDM engagement tracking
                  </span>
                </li>
                <li>
                  <code className="rounded bg-muted px-2 py-1">
                    --vdm-inbox / --no-vdm-inbox
                  </code>{" "}
                  <span className="text-muted-foreground">
                    Enable or disable VDM inbox placement optimization
                  </span>
                </li>
              </ul>
            </CardContent>
          </Card>
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-lg">How It Works</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
                <li>
                  <strong className="text-foreground">Interactive mode</strong>{" "}
                  — when no flags are passed, displays a menu with all 7
                  configuration groups. Select a group, adjust its setting, then
                  return to the menu. Select &quot;Done&quot; to apply all
                  changes.
                </li>
                <li>
                  <strong className="text-foreground">Flag mode</strong> — when
                  any flag is passed, applies only those settings immediately
                  without showing the menu.
                </li>
                <li>
                  <strong className="text-foreground">Primary domain</strong> —
                  changes are applied directly to the SES configuration set. A
                  note is shown afterward to run{" "}
                  <code className="rounded bg-muted px-1 py-0.5">
                    wraps email upgrade
                  </code>{" "}
                  to sync Pulumi state.
                </li>
                <li>
                  <strong className="text-foreground">
                    Additional domains
                  </strong>{" "}
                  — changes are applied to the domain&apos;s configuration set
                  and saved to local metadata.
                </li>
                <li>
                  <strong className="text-foreground">Email archive</strong> —
                  uses a shared{" "}
                  <code className="rounded bg-muted px-1 py-0.5">
                    wraps-email-archive
                  </code>{" "}
                  Mail Manager archive, created automatically on first use.
                </li>
                <li>
                  <strong className="text-foreground">VDM options</strong> —
                  only shown when your AWS account has Virtual Deliverability
                  Manager enabled.
                </li>
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Examples</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="mb-2 text-muted-foreground text-sm">
                  Interactive configuration wizard:
                </p>
                <CLICommand command="npx @wraps.dev/cli email domains config" />
              </div>
              <div className="mt-4">
                <p className="mb-2 text-muted-foreground text-sm">
                  Enable open and click tracking for a domain:
                </p>
                <CLICommand command="npx @wraps.dev/cli email domains config -d yourdomain.com --opens --clicks" />
              </div>
              <div className="mt-4">
                <p className="mb-2 text-muted-foreground text-sm">
                  Require TLS and disable reputation metrics:
                </p>
                <CLICommand command="npx @wraps.dev/cli email domains config -d yourdomain.com --tls-required --no-reputation-metrics" />
              </div>
              <div className="mt-4">
                <p className="mb-2 text-muted-foreground text-sm">
                  Enable archiving and suppress bounces:
                </p>
                <CLICommand command="npx @wraps.dev/cli email domains config -d yourdomain.com --archive --suppress-bounce" />
              </div>
              <div className="mt-4">
                <p className="mb-2 text-muted-foreground text-sm">
                  Set a custom tracking domain for open/click links:
                </p>
                <CLICommand command="npx @wraps.dev/cli email domains config -d news.yourdomain.com --tracking-domain track.news.yourdomain.com" />
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* wraps email inbound */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Terminal className="h-6 w-6 text-primary" />
          wraps email inbound
        </h2>
        <p className="mb-4 text-muted-foreground">
          Deploy and manage inbound email receiving infrastructure. Receive
          emails at your domain, parse them automatically, and process with your
          application.
        </p>

        {/* inbound init */}
        <div className="mb-8 ml-4">
          <h3 className="mb-3 font-semibold text-xl">
            wraps email inbound init
          </h3>
          <p className="mb-4 text-muted-foreground text-sm">
            Deploy inbound email receiving infrastructure to your AWS account.
          </p>
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-lg">Usage</CardTitle>
            </CardHeader>
            <CardContent>
              <CLICommand command="npx @wraps.dev/cli email inbound init [options]" />
            </CardContent>
          </Card>
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-lg">Options</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                <li>
                  <code className="rounded bg-muted px-2 py-1">
                    -d, --domain &lt;domain&gt;
                  </code>{" "}
                  <span className="text-muted-foreground">
                    Domain to receive emails at
                  </span>
                </li>
                <li>
                  <code className="rounded bg-muted px-2 py-1">
                    -r, --region &lt;region&gt;
                  </code>{" "}
                  <span className="text-muted-foreground">
                    AWS region (must support SES inbound)
                  </span>
                </li>
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">What It Deploys</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
                <li>S3 bucket for storing incoming emails</li>
                <li>SES receipt rule set with active rule</li>
                <li>Lambda function to parse and process emails</li>
                <li>EventBridge rule for email.received events</li>
                <li>IAM roles and policies for cross-service access</li>
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* inbound status */}
        <div className="mb-8 ml-4">
          <h3 className="mb-3 font-semibold text-xl">
            wraps email inbound status
          </h3>
          <p className="mb-4 text-muted-foreground text-sm">
            Display the status of inbound email infrastructure, including MX
            records and receipt rules.
          </p>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Usage</CardTitle>
            </CardHeader>
            <CardContent>
              <CLICommand command="npx @wraps.dev/cli email inbound status" />
            </CardContent>
          </Card>
        </div>

        {/* inbound test */}
        <div className="mb-8 ml-4">
          <h3 className="mb-3 font-semibold text-xl">
            wraps email inbound test
          </h3>
          <p className="mb-4 text-muted-foreground text-sm">
            Send a test email to verify your inbound configuration is working
            correctly.
          </p>
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-lg">Usage</CardTitle>
            </CardHeader>
            <CardContent>
              <CLICommand command="npx @wraps.dev/cli email inbound test [options]" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Options</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                Sends a test email to your configured inbound receiving domain.
                Accepts{" "}
                <code className="rounded bg-muted px-1 py-0.5">
                  -r, --region
                </code>{" "}
                and <code className="rounded bg-muted px-1 py-0.5">--json</code>{" "}
                flags.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* inbound verify */}
        <div className="mb-8 ml-4">
          <h3 className="mb-3 font-semibold text-xl">
            wraps email inbound verify
          </h3>
          <p className="mb-4 text-muted-foreground text-sm">
            Check that DNS records for your inbound receiving domain(s) are
            correctly configured. Verifies MX records point to SES inbound SMTP
            and SPF records include amazonses.com. Also confirms the SES receipt
            rule set is active.
          </p>
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-lg">Usage</CardTitle>
            </CardHeader>
            <CardContent>
              <CLICommand command="npx @wraps.dev/cli email inbound verify [options]" />
            </CardContent>
          </Card>
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-lg">Options</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                <li>
                  <code className="rounded bg-muted px-2 py-1">
                    -r, --region &lt;region&gt;
                  </code>{" "}
                  <span className="text-muted-foreground">
                    AWS region to check
                  </span>
                </li>
                <li>
                  <code className="rounded bg-muted px-2 py-1">--json</code>{" "}
                  <span className="text-muted-foreground">
                    Output result as JSON
                  </span>
                </li>
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">What It Checks</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
                <li>
                  MX record points to{" "}
                  <code className="rounded bg-muted px-1 py-0.5">
                    inbound-smtp.&lt;region&gt;.amazonaws.com
                  </code>
                </li>
                <li>
                  SPF TXT record includes{" "}
                  <code className="rounded bg-muted px-1 py-0.5">
                    amazonses.com
                  </code>
                </li>
                <li>SES receipt rule set is active</li>
                <li>
                  Checks all configured inbound domains when multiple exist
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* inbound add */}
        <div className="mb-8 ml-4">
          <h3 className="mb-3 font-semibold text-xl">
            wraps email inbound add
          </h3>
          <p className="mb-4 text-muted-foreground text-sm">
            Add an additional receiving domain to your inbound email
            infrastructure. Requires inbound to already be deployed via{" "}
            <code className="rounded bg-muted px-1 py-0.5">
              wraps email inbound init
            </code>
            . Updates the SES receipt rule and optionally auto-creates DNS
            records.
          </p>
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-lg">Usage</CardTitle>
            </CardHeader>
            <CardContent>
              <CLICommand command="npx @wraps.dev/cli email inbound add [options]" />
            </CardContent>
          </Card>
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-lg">Options</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                <li>
                  <code className="rounded bg-muted px-2 py-1">
                    -d, --domain &lt;domain&gt;
                  </code>{" "}
                  <span className="text-muted-foreground">
                    Parent domain for the new inbound subdomain
                  </span>
                </li>
                <li>
                  <code className="rounded bg-muted px-2 py-1">
                    --subdomain &lt;name&gt;
                  </code>{" "}
                  <span className="text-muted-foreground">
                    Subdomain prefix (e.g., inbound, support)
                  </span>
                </li>
                <li>
                  <code className="rounded bg-muted px-2 py-1">--root</code>{" "}
                  <span className="text-muted-foreground">
                    Use root domain instead of a subdomain
                  </span>
                </li>
                <li>
                  <code className="rounded bg-muted px-2 py-1">
                    -r, --region &lt;region&gt;
                  </code>{" "}
                  <span className="text-muted-foreground">
                    AWS region (must support SES inbound)
                  </span>
                </li>
                <li>
                  <code className="rounded bg-muted px-2 py-1">-y, --yes</code>{" "}
                  <span className="text-muted-foreground">
                    Skip confirmation prompts
                  </span>
                </li>
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Examples</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="mb-2 text-muted-foreground text-sm">
                  Add a support subdomain interactively:
                </p>
                <CLICommand command="npx @wraps.dev/cli email inbound add" />
              </div>
              <div className="mt-4">
                <p className="mb-2 text-muted-foreground text-sm">
                  Add a specific subdomain non-interactively:
                </p>
                <CLICommand command="npx @wraps.dev/cli email inbound add --domain yourdomain.com --subdomain support --yes" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* inbound remove */}
        <div className="mb-8 ml-4">
          <h3 className="mb-3 font-semibold text-xl">
            wraps email inbound remove
          </h3>
          <p className="mb-4 text-muted-foreground text-sm">
            Remove an inbound receiving domain from SES receipt rules and
            metadata. Cannot remove the last domain — use{" "}
            <code className="rounded bg-muted px-1 py-0.5">
              wraps email inbound destroy
            </code>{" "}
            to remove all inbound infrastructure instead.
          </p>
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-lg">Usage</CardTitle>
            </CardHeader>
            <CardContent>
              <CLICommand command="npx @wraps.dev/cli email inbound remove [options]" />
            </CardContent>
          </Card>
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-lg">Options</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                <li>
                  <code className="rounded bg-muted px-2 py-1">
                    -d, --domain &lt;domain&gt;
                  </code>{" "}
                  <span className="text-muted-foreground">
                    The receiving domain to remove (e.g.,
                    support.yourdomain.com)
                  </span>
                </li>
                <li>
                  <code className="rounded bg-muted px-2 py-1">
                    -r, --region &lt;region&gt;
                  </code>{" "}
                  <span className="text-muted-foreground">AWS region</span>
                </li>
                <li>
                  <code className="rounded bg-muted px-2 py-1">-y, --yes</code>{" "}
                  <span className="text-muted-foreground">
                    Skip confirmation prompt
                  </span>
                </li>
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Important Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
                <li>
                  You must have at least two inbound domains to use this command
                </li>
                <li>
                  After removal, manually delete the MX and SPF DNS records for
                  the removed domain
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* inbound destroy */}
        <div className="mb-8 ml-4">
          <h3 className="mb-3 font-semibold text-xl">
            wraps email inbound destroy
          </h3>
          <p className="mb-4 text-muted-foreground text-sm">
            Remove inbound email infrastructure. Stored emails in S3 will remain
            unless you delete the bucket manually.
          </p>
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-lg">Usage</CardTitle>
            </CardHeader>
            <CardContent>
              <CLICommand command="npx @wraps.dev/cli email inbound destroy [options]" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Options</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                <li>
                  <code className="rounded bg-muted px-2 py-1">
                    -f, --force
                  </code>{" "}
                  <span className="text-muted-foreground">
                    Skip confirmation prompt
                  </span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* wraps email connect */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Terminal className="h-6 w-6 text-primary" />
          wraps email connect
        </h2>
        <p className="mb-4 text-muted-foreground">
          Connect to existing AWS SES resources and add Wraps features
          non-destructively. Never modifies your existing SES setup.
        </p>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <CLICommand command="npx @wraps.dev/cli email connect [options]" />
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Options</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <code className="rounded bg-muted px-2 py-1">
                  --region &lt;region&gt;
                </code>
                <p className="mt-2 text-muted-foreground text-sm">
                  AWS region to scan for existing resources
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">--preview</code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Preview infrastructure changes without deploying
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">What It Does</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
              <li>Scans existing SES domains and configuration sets</li>
              <li>Prompts for which features to add</li>
              <li>
                Creates new resources with{" "}
                <code className="rounded bg-muted px-1 py-0.5">wraps-</code>{" "}
                prefix
              </li>
              <li>Never modifies or deletes existing resources</li>
              <li>Configures event tracking and analytics</li>
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* wraps email upgrade */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Terminal className="h-6 w-6 text-primary" />
          wraps email upgrade
        </h2>
        <p className="mb-4 text-muted-foreground">
          Add additional features to your existing Wraps deployment. Upgrade
          from Starter to Production, or add individual features incrementally.
        </p>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <CLICommand command="npx @wraps.dev/cli email upgrade [options]" />
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">What It Does</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
              <li>Shows currently enabled features</li>
              <li>Prompts for additional features to enable</li>
              <li>Deploys new resources incrementally</li>
              <li>Updates IAM policies with new permissions</li>
              <li>Shows updated cost estimates</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Example Upgrades</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
              <li>
                Starter → Production: Adds real-time event tracking and 90-day
                history
              </li>
              <li>
                Production → Enterprise: Adds dedicated IP and 1-year history
                retention
              </li>
              <li>
                Add individual features: Enable specific event types or extend
                storage
              </li>
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* wraps email sync */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Terminal className="h-6 w-6 text-primary" />
          wraps email sync
        </h2>
        <p className="mb-4 text-muted-foreground">
          Synchronize local state with deployed infrastructure. Useful after CLI
          updates or manual AWS console changes.
        </p>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <CLICommand command="npx @wraps.dev/cli email sync [options]" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">What It Does</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
              <li>
                Detects differences between local config and deployed
                infrastructure
              </li>
              <li>
                Applies CLI updates (bug fixes, new features) to resources
              </li>
              <li>Updates Lambda functions and IAM policies</li>
              <li>Does not change your configuration preset or features</li>
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* wraps email restore */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Terminal className="h-6 w-6 text-primary" />
          wraps email restore
        </h2>
        <p className="mb-4 text-muted-foreground">
          Restore Wraps deployment from existing metadata. Useful if you've lost
          local configuration but infrastructure still exists in AWS.
        </p>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <CLICommand command="npx @wraps.dev/cli email restore [options]" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">What It Does</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
              <li>Scans AWS for existing Wraps resources</li>
              <li>Reconstructs deployment metadata</li>
              <li>Re-imports Pulumi stack state</li>
              <li>Restores local configuration</li>
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* wraps email destroy */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Terminal className="h-6 w-6 text-primary" />
          wraps email destroy
        </h2>
        <p className="mb-4 text-muted-foreground">
          Remove email infrastructure. Use this to remove only the email service
          while keeping other services intact.
        </p>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <CLICommand command="npx @wraps.dev/cli email destroy [options]" />
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Options</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <code className="rounded bg-muted px-2 py-1">-f, --force</code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Skip confirmation prompt (use with caution)
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">--preview</code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Preview what would be destroyed without making changes
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">What It Removes</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
              <li>Email-specific IAM roles and policies</li>
              <li>DynamoDB tables (email history will be lost)</li>
              <li>Lambda functions for event processing</li>
              <li>EventBridge rules and SQS queues</li>
              <li>Route53 DNS records (DKIM, DMARC, MAIL FROM) if confirmed</li>
              <li>Local metadata for email service</li>
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* wraps email doctor */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Terminal className="h-6 w-6 text-primary" />
          wraps email doctor
        </h2>
        <p className="mb-4 text-muted-foreground">
          Diagnose email infrastructure health by scanning your AWS account for
          all <code className="rounded bg-muted px-1 py-0.5">wraps-*</code>{" "}
          resources and checking whether they are managed by a Pulumi stack or
          orphaned.
        </p>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <CLICommand command="npx @wraps.dev/cli email doctor [options]" />
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Options</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <code className="rounded bg-muted px-2 py-1">
                  -r, --region &lt;region&gt;
                </code>
                <p className="mt-2 text-muted-foreground text-sm">
                  AWS region to scan (auto-detected from metadata when omitted)
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">--cleanup</code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Delete{" "}
                  <code className="rounded bg-muted px-1 py-0.5">wraps-*</code>{" "}
                  resources that Wraps has proved are orphaned — no Pulumi
                  stack, no CloudFormation stack, and not recorded in connection
                  metadata. Lists every resource it will delete (and every one
                  it is keeping because it is managed) and asks for confirmation
                  before deleting anything. Refuses to delete anything when a
                  Pulumi stack exists (suggests{" "}
                  <code className="rounded bg-muted px-1 py-0.5">
                    wraps email destroy
                  </code>{" "}
                  or{" "}
                  <code className="rounded bg-muted px-1 py-0.5">
                    wraps email upgrade
                  </code>{" "}
                  instead), when Pulumi state could not be read, or when
                  CloudFormation ownership could not be checked.
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">--json</code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Output result as JSON
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">What It Scans</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
              <li>SES configuration sets</li>
              <li>SNS topics</li>
              <li>DynamoDB tables</li>
              <li>Lambda functions</li>
              <li>IAM roles</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Examples</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="mb-2 text-muted-foreground text-sm">
                Scan for issues:
              </p>
              <CLICommand command="npx @wraps.dev/cli email doctor" />
            </div>
            <div className="mt-4">
              <p className="mb-2 text-muted-foreground text-sm">
                Scan and clean up orphaned resources:
              </p>
              <CLICommand command="npx @wraps.dev/cli email doctor --cleanup" />
            </div>
          </CardContent>
        </Card>
      </section>

      {/* wraps email test */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Terminal className="h-6 w-6 text-primary" />
          wraps email test
        </h2>
        <p className="mb-4 text-muted-foreground">
          Send a test email using the AWS SES mailbox simulator. Verify your
          email infrastructure is working without affecting your sender
          reputation.
        </p>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <CLICommand command="npx @wraps.dev/cli email test [options]" />
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Options</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <code className="rounded bg-muted px-2 py-1">
                  --to &lt;email&gt;
                </code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Recipient email address (defaults to SES simulator address)
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">
                  --scenario &lt;type&gt;
                </code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Simulator scenario: success, bounce, complaint, ooto, or
                  suppression_list
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">--json</code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Output result as JSON
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">What It Does</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
              <li>Sends a test email via the AWS SES mailbox simulator</li>
              <li>Shows the delivery result and message ID</li>
              <li>
                Supports different scenarios to test bounce and complaint
                handling
              </li>
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* wraps email check */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Terminal className="h-6 w-6 text-primary" />
          wraps email check
        </h2>
        <p className="mb-4 text-muted-foreground">
          Run a comprehensive deliverability audit on your domain. Checks all
          critical email authentication records and provides an overall
          deliverability score.
        </p>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <CLICommand command="npx @wraps.dev/cli email check [options]" />
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Options</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <code className="rounded bg-muted px-2 py-1">
                  --domain &lt;domain&gt;
                </code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Domain to audit
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">-q, --quick</code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Quick mode: check fewer DKIM selectors and only top blacklists
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">--verbose</code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Show all checks including passing ones (e.g., full SPF lookup
                  tree)
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">
                  --dkim-selector &lt;selector&gt;
                </code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Check a specific DKIM selector instead of scanning common
                  ones. If omitted and a Wraps deployment exists, SES DKIM
                  tokens are used automatically.
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">
                  --skip-blacklists
                </code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Skip all blacklist checks entirely
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">--skip-tls</code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Skip MX server TLS (STARTTLS) checks
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">
                  --timeout &lt;ms&gt;
                </code>
                <p className="mt-2 text-muted-foreground text-sm">
                  DNS timeout in milliseconds
                </p>
              </div>
              <div>
                <code className="rounded bg-muted px-2 py-1">--json</code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Output result as JSON
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">What It Checks</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
              <li>DKIM records and signing configuration</li>
              <li>SPF alignment and record validity</li>
              <li>DMARC policy strength and configuration</li>
              <li>MX record TLS support</li>
              <li>Blacklist presence across major providers</li>
              <li>Overall deliverability score with recommendations</li>
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* wraps email templates */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Terminal className="h-6 w-6 text-primary" />
          wraps email templates
        </h2>
        <p className="mb-4 text-muted-foreground">
          Manage email templates as code. Initialize a templates directory,
          preview with hot-reload, and push compiled templates to SES and the
          Wraps dashboard.
        </p>

        {/* templates init */}
        <div className="mb-8 ml-4">
          <h3 className="mb-3 font-semibold text-xl">
            wraps email templates init
          </h3>
          <p className="mb-4 text-muted-foreground text-sm">
            Initialize a templates-as-code directory with an example template,
            configuration file, and brand file.
          </p>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Usage</CardTitle>
            </CardHeader>
            <CardContent>
              <CLICommand command="npx @wraps.dev/cli email templates init" />
            </CardContent>
          </Card>
        </div>

        {/* templates preview */}
        <div className="mb-8 ml-4">
          <h3 className="mb-3 font-semibold text-xl">
            wraps email templates preview
          </h3>
          <p className="mb-4 text-muted-foreground text-sm">
            Start a local preview server with hot-reload for developing email
            templates. Defaults to port 3333.
          </p>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Usage</CardTitle>
            </CardHeader>
            <CardContent>
              <CLICommand command="npx @wraps.dev/cli email templates preview" />
            </CardContent>
          </Card>
        </div>

        {/* templates push */}
        <div className="mb-8 ml-4">
          <h3 className="mb-3 font-semibold text-xl">
            wraps email templates push
          </h3>
          <p className="mb-4 text-muted-foreground text-sm">
            Compile and push templates to AWS SES and the Wraps dashboard.
          </p>
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-lg">Usage</CardTitle>
            </CardHeader>
            <CardContent>
              <CLICommand command="npx @wraps.dev/cli email templates push [options]" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Options</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                <li>
                  <code className="rounded bg-muted px-2 py-1">
                    --template &lt;name&gt;
                  </code>{" "}
                  <span className="text-muted-foreground">
                    Push a specific template by name
                  </span>
                </li>
                <li>
                  <code className="rounded bg-muted px-2 py-1">--force</code>{" "}
                  <span className="text-muted-foreground">
                    Overwrite existing templates without confirmation
                  </span>
                </li>
                <li>
                  <code className="rounded bg-muted px-2 py-1">--dry-run</code>{" "}
                  <span className="text-muted-foreground">
                    Preview what would be pushed without making changes
                  </span>
                </li>
                <li>
                  <code className="rounded bg-muted px-2 py-1">--json</code>{" "}
                  <span className="text-muted-foreground">
                    Output result as JSON
                  </span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* wraps email workflows */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Terminal className="h-6 w-6 text-primary" />
          wraps email workflows
        </h2>
        <p className="mb-4 text-muted-foreground">
          Validate and push email workflow definitions to the Wraps Platform.
        </p>

        {/* workflows validate */}
        <div className="mb-8 ml-4">
          <h3 className="mb-3 font-semibold text-xl">
            wraps email workflows validate
          </h3>
          <p className="mb-4 text-muted-foreground text-sm">
            Validate workflow definitions against the Wraps workflow schema.
            Catches errors before pushing to production.
          </p>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Usage</CardTitle>
            </CardHeader>
            <CardContent>
              <CLICommand command="npx @wraps.dev/cli email workflows validate" />
            </CardContent>
          </Card>
        </div>

        {/* workflows push */}
        <div className="mb-8 ml-4">
          <h3 className="mb-3 font-semibold text-xl">
            wraps email workflows push
          </h3>
          <p className="mb-4 text-muted-foreground text-sm">
            Push workflow definitions to the Wraps Platform.
          </p>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Usage</CardTitle>
            </CardHeader>
            <CardContent>
              <CLICommand command="npx @wraps.dev/cli email workflows push" />
            </CardContent>
          </Card>
        </div>
      </section>

      {/* wraps workflow init */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Terminal className="h-6 w-6 text-primary" />
          wraps workflow init
        </h2>
        <p className="mb-4 text-muted-foreground">
          Scaffold a workflows-as-code project with example workflow files and a
          configuration file. Creates a{" "}
          <code className="rounded bg-muted px-1 py-0.5">wraps/workflows/</code>{" "}
          directory in your current project with ready-to-edit examples.
        </p>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <CLICommand command="npx @wraps.dev/cli workflow init [options]" />
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Options</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <code className="rounded bg-muted px-2 py-1">-y, --yes</code>
                <p className="mt-2 text-muted-foreground text-sm">
                  Overwrite existing example files without prompting
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">What It Creates</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
              <li>
                <code className="rounded bg-muted px-1 py-0.5">
                  wraps/wraps.config.ts
                </code>{" "}
                — Project configuration (org, from address, region)
              </li>
              <li>
                <code className="rounded bg-muted px-1 py-0.5">
                  wraps/workflows/cart-recovery.ts
                </code>{" "}
                — Cross-channel cascade example (email then SMS)
              </li>
              <li>
                <code className="rounded bg-muted px-1 py-0.5">
                  wraps/workflows/welcome-sequence.ts
                </code>{" "}
                — Welcome series with conditional branching
              </li>
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* wraps email config */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Terminal className="h-6 w-6 text-primary" />
          wraps email config
        </h2>
        <p className="mb-4 text-muted-foreground">
          Apply CLI configuration updates to deployed infrastructure. Syncs
          local configuration changes with your deployed AWS resources.
        </p>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <CLICommand command="npx @wraps.dev/cli email config" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">What It Does</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
              <li>
                Reads local configuration and compares with deployed
                infrastructure
              </li>
              <li>
                Applies any pending configuration changes to AWS resources
              </li>
              <li>
                Updates IAM policies, Lambda functions, and EventBridge rules as
                needed
              </li>
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button asChild variant="outline">
          <Link href="/docs/cli-reference">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to CLI Reference
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/docs/cli-reference/cdn">
            CDN Commands
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </DocsLayout>
  );
}
