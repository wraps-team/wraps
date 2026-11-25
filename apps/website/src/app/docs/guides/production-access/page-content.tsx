"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import { Button } from "@wraps/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock } from "lucide-react";
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
import { SES_DENIAL_GAPS } from "@/lib/ses-production-access";

const cliCommand = `aws sesv2 put-account-details \\
  --production-access-enabled \\
  --mail-type TRANSACTIONAL \\
  --website-url https://yourapp.com \\
  --additional-contact-email-addresses you@yourapp.com \\
  --contact-language EN`;

const statusCommand = `aws sesv2 get-account \\
  --query '{Production: ProductionAccessEnabled, Review: Details.ReviewDetails}'`;

const caseReplyTemplate = `We send a weekly newsletter to customers of <product> (<website URL>).

How recipients opt in: every address on the list signed up through the form
at <signup URL> and confirmed by clicking a link in a confirmation email.
We do not buy, rent, or scrape lists.

Volume: about <N> emails per week to <N> subscribers, growing at roughly
<N> new signups a month.

Bounces and complaints: the SES configuration set publishes bounce and
complaint events to EventBridge. Hard bounces and complaints are removed
from the list automatically and added to the account-level suppression
list.

Unsubscribe: every email carries a one-click unsubscribe link in the body
and List-Unsubscribe headers. Requests are honored immediately.

Sending domain: <domain> is verified in SES with DKIM, SPF, and DMARC in
place.`;

export default function ProductionAccessPageContent() {
  return (
    <DocsLayout>
      {/* Page Header */}
      <div className="mb-12">
        <Badge className="mb-4" variant="outline">
          Guide
        </Badge>
        <h1 className="mb-4 font-bold text-4xl tracking-tight">
          Moving to Production Access
        </h1>
        <p className="text-lg text-muted-foreground">
          Learn how to move out of the AWS SES sandbox and start sending emails
          to any recipient.
        </p>
        <div className="mt-4 flex items-center gap-4 text-muted-foreground text-sm">
          <span className="flex items-center gap-1">
            <Clock className="h-4 w-4" />2 min read
          </span>
        </div>
      </div>

      {/* What is the Sandbox */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">What is the SES Sandbox?</h2>
        <p className="mb-4 text-muted-foreground">
          When you first set up AWS SES, your account is placed in{" "}
          <strong>sandbox mode</strong>. This is a safety measure to prevent
          abuse. You'll see this warning banner in your SES console:
        </p>
        <img
          alt="SES sandbox warning banner in AWS console"
          className="mb-4 rounded-lg border"
          src="/docs/ses-sandbox-banner.png"
        />
        <p className="mb-4 text-muted-foreground">
          While in the sandbox, you have these restrictions:
        </p>
        <Card className="mb-4">
          <CardContent className="p-6">
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
                <span className="text-muted-foreground">
                  <strong className="text-foreground">
                    Verified recipients only
                  </strong>{" "}
                  — You can only send to email addresses you've manually
                  verified
                </span>
              </li>
              <li className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
                <span className="text-muted-foreground">
                  <strong className="text-foreground">
                    200 emails per day
                  </strong>{" "}
                  — Maximum of 200 messages in a 24-hour period
                </span>
              </li>
              <li className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
                <span className="text-muted-foreground">
                  <strong className="text-foreground">
                    1 email per second
                  </strong>{" "}
                  — Sending rate is limited to 1 message per second
                </span>
              </li>
            </ul>
          </CardContent>
        </Card>
        <p className="text-muted-foreground">
          Once you have production access, you can send to any recipient (your
          "From" address must still be verified).
        </p>
      </section>

      {/* Before You Request */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Before You Request</h2>
        <div className="rounded-lg border-primary border-l-4 bg-primary/10 p-4">
          <p className="font-medium text-sm">
            Verify your domain first for faster approval
          </p>
          <p className="mt-2 text-muted-foreground text-sm">
            AWS recommends verifying your sending domain before requesting
            production access. This significantly speeds up the approval
            process. See our{" "}
            <a
              className="font-medium text-primary underline"
              href="/docs/guides/domain-verification"
            >
              Domain Verification guide
            </a>{" "}
            for instructions.
          </p>
        </div>
        <p className="mt-4 text-muted-foreground">
          There is a{" "}
          <Link
            className="font-medium text-primary underline"
            href="/blog/ses-sandbox-guide#pre-request-checklist"
          >
            16-point pre-request checklist
          </Link>{" "}
          that covers the technical setup, the account profile and the request
          itself. It ticks off as you go and remembers where you got to.
        </p>
      </section>

      {/* Request via Console */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Option 1: AWS Console</h2>
        <ol className="mb-4 list-decimal space-y-4 pl-6 text-muted-foreground">
          <li>
            Open the{" "}
            <a
              className="font-medium text-primary underline"
              href="https://console.aws.amazon.com/ses/"
              rel="noopener noreferrer"
              target="_blank"
            >
              Amazon SES console
            </a>
          </li>
          <li>
            Navigate to{" "}
            <strong className="text-foreground">Account dashboard</strong>
          </li>
          <li>
            Click{" "}
            <strong className="text-foreground">
              "Request production access"
            </strong>{" "}
            in the sandbox warning banner
          </li>
          <li>
            Fill out the form:
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>
                <strong className="text-foreground">Email type:</strong>{" "}
                Transactional or Marketing (choose what applies to most of your
                emails)
              </li>
              <li>
                <strong className="text-foreground">Website URL:</strong> Your
                application's URL
              </li>
              <li>
                <strong className="text-foreground">Contact emails:</strong> Up
                to 4 email addresses for account communications
              </li>
            </ul>
          </li>
          <li>Check the acknowledgement box and submit</li>
        </ol>
        <video
          autoPlay
          className="rounded-lg border"
          loop
          muted
          playsInline
          preload="none"
          src="/docs/ses-request-production-access.mp4"
        >
          <track
            kind="descriptions"
            label="Requesting production access in SES console"
          />
        </video>
      </section>

      {/* Request via CLI */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Option 2: AWS CLI</h2>
        <p className="mb-4 text-muted-foreground">
          You can also request production access using the AWS CLI:
        </p>
        <CodeBlock
          className="h-auto"
          data={[
            {
              language: "bash",
              filename: "terminal.sh",
              code: cliCommand,
            },
          ]}
          defaultValue="bash"
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
        <p className="mt-4 text-muted-foreground text-sm">
          Replace{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">TRANSACTIONAL</code>{" "}
          with <code className="rounded bg-muted px-1.5 py-0.5">MARKETING</code>{" "}
          if you primarily send marketing emails.
        </p>
      </section>

      {/* What to Expect */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">What to Expect</h2>
        <Card className="mb-4">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-none bg-primary/10">
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-medium">Review Timeline</h3>
                <p className="mt-1 text-muted-foreground">
                  AWS typically responds within <strong>24 hours</strong>. If
                  they need additional information, the review may take longer.
                  You cannot edit your request while it's under review.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <p className="mb-4 text-muted-foreground">
          Once approved, the sandbox warning will disappear from your dashboard:
        </p>
        <img
          alt="SES dashboard after production access is approved"
          className="rounded-lg border"
          src="/docs/ses-production-approved.png"
        />
      </section>

      {/* Tips for Approval */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Tips for Faster Approval</h2>
        <ul className="space-y-3">
          <li className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
            <span className="text-muted-foreground">
              <strong className="text-foreground">
                Verify your domain first
              </strong>{" "}
              — This is the biggest factor in approval speed
            </span>
          </li>
          <li className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
            <span className="text-muted-foreground">
              <strong className="text-foreground">
                Use a real website URL
              </strong>{" "}
              — Helps AWS understand your use case
            </span>
          </li>
          <li className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
            <span className="text-muted-foreground">
              <strong className="text-foreground">
                Provide accurate contact info
              </strong>{" "}
              — In case AWS needs to reach you
            </span>
          </li>
          <li className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
            <span className="text-muted-foreground">
              <strong className="text-foreground">Acknowledge the terms</strong>{" "}
              — Confirm you'll only send to opted-in recipients and handle
              bounces/complaints properly
            </span>
          </li>
        </ul>
      </section>

      {/* If Your Request Is Denied */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">If Your Request Is Denied</h2>
        <p className="mb-4 text-muted-foreground">
          A denial is not final. AWS delivers the decision through a Support
          Center case tied to your request, and that case is where you reply
          with more detail. You can also submit a fresh request from the SES
          console once the review has closed.
        </p>
        <h3 className="mb-2 font-medium text-lg">Check the review status</h3>
        <p className="mb-4 text-muted-foreground">
          The SES account details carry the latest review status and the support
          case ID:
        </p>
        <CodeBlock
          className="mb-4 h-auto"
          data={[
            {
              language: "bash",
              filename: "terminal.sh",
              code: statusCommand,
            },
          ]}
          defaultValue="bash"
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
        <Card className="mb-6">
          <CardContent className="p-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-2 text-left">Status</th>
                  <th className="pb-2 text-left">Meaning</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b">
                  <td className="py-2 font-medium text-foreground">PENDING</td>
                  <td className="py-2">AWS is still reviewing the request.</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 font-medium text-foreground">GRANTED</td>
                  <td className="py-2">
                    Production access is on. The sandbox banner disappears.
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 font-medium text-foreground">DENIED</td>
                  <td className="py-2">
                    AWS declined. Open the case ID in Support Center and read
                    the reason they gave.
                  </td>
                </tr>
                <tr>
                  <td className="py-2 font-medium text-foreground">FAILED</td>
                  <td className="py-2">
                    An internal error on the AWS side and the request never
                    reached review. Submit it again.
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
        <h3 className="mb-2 font-medium text-lg">Why requests get denied</h3>
        <p className="mb-4 text-muted-foreground">
          The request form only asks for an email type, a website, and contact
          addresses, so AWS has to infer your sending practices from very
          little. Denied requests usually share one of these gaps:
        </p>
        <ul className="mb-6 space-y-3">
          {SES_DENIAL_GAPS.map((gap) => (
            <li className="flex items-start gap-3" key={gap.id}>
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
              <span className="text-muted-foreground">
                <strong className="text-foreground">{gap.title}</strong> —{" "}
                {gap.summary}
              </span>
            </li>
          ))}
          <li className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <span className="text-muted-foreground">
              <strong className="text-foreground">Brand-new AWS account</strong>{" "}
              — Reviewers have less history to go on, so expect more questions
              before approval
            </span>
          </li>
        </ul>
        <div className="mb-6 rounded-lg border-primary border-l-4 bg-primary/10 p-4">
          <p className="font-medium text-sm">
            Paste the denial into the request builder
          </p>
          <p className="mt-2 text-muted-foreground text-sm">
            The{" "}
            <Link
              className="font-medium text-primary underline"
              href="/tools/ses-production-access"
            >
              SES production access request builder
            </Link>{" "}
            matches a denial against these same gaps and drafts the reply for
            the support case. It runs in your browser — the text you paste is
            not uploaded anywhere.
          </p>
        </div>
        <h3 className="mb-2 font-medium text-lg">What to put in the reply</h3>
        <p className="mb-4 text-muted-foreground">
          Answer the questions the form never asked. Reply on the support case
          with a short, specific description like this one, then adjust it to
          match what you actually send:
        </p>
        <CodeBlock
          className="mb-4 h-auto"
          data={[
            {
              language: "text",
              filename: "case-reply.txt",
              code: caseReplyTemplate,
            },
          ]}
          defaultValue="text"
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
        <div className="rounded-lg border-primary border-l-4 bg-primary/10 p-4">
          <p className="font-medium text-sm">
            Fix the gap before you reply, not after
          </p>
          <p className="mt-2 text-muted-foreground text-sm">
            If the domain is not verified, verify it first. If the site has no
            signup form or privacy page, add one. A reply that describes a
            process AWS cannot see on your site or in your account does not help
            your case. Wraps sets up the bounce and complaint pipeline and the
            suppression list during{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">
              wraps email init
            </code>
            , so you can describe it accurately.
          </p>
        </div>
      </section>

      {/* Next Steps */}
      <section className="mb-12">
        <h2 className="mb-6 font-bold text-2xl">Next Steps</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">Verify Your Domain</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Set up DKIM, SPF, and DMARC for better deliverability.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/guides/domain-verification">
                  Domain Verification
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">Send Your First Email</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Once approved, start sending with the Wraps SDK.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/quickstart/email">
                  Email Quickstart
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
