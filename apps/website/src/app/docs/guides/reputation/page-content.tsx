"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import { Button } from "@wraps/ui/components/ui/button";
import { Card } from "@wraps/ui/components/ui/card";
import { ArrowRight, CheckCircle2 } from "lucide-react";
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

const separateStreamsCode = `# Reputation is scored on the account, but SES publishes CloudWatch metrics
# per configuration set. Wraps turns that on by default
# (reputationMetricsEnabled), so a second configuration set gives you a
# second, separately visible reputation signal.
#
# Send marketing from its own subdomain and its own configuration set. A bad
# campaign then shows up as its own number instead of hiding inside the
# account average that your password resets also live in.

  transactional   →  mail.yourdomain.com    →  wraps-email-default
  marketing       →  news.yourdomain.com    →  your-marketing-set

# The account rate is still the one AWS acts on. Splitting the streams does
# not protect you from a suspension; it tells you which stream caused it,
# early enough to stop that one.`;

const cwCode = `# Complaint and bounce rate for one configuration set, hourly, last 24h.
aws cloudwatch get-metric-statistics \\
  --namespace AWS/SES \\
  --metric-name Reputation.ComplaintRate \\
  --dimensions Name=ses:configuration-set,Value=wraps-email-default \\
  --start-time "$(date -u -v-24H '+%Y-%m-%dT%H:%M:%SZ')" \\
  --end-time "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \\
  --period 3600 \\
  --statistics Maximum

# Account-wide, which is the number AWS actually enforces on.
aws sesv2 get-account --query 'SendQuota'`;

export default function ReputationPageContent() {
  return (
    <DocsLayout>
      <div className="mb-10">
        <Badge className="mb-3" variant="outline">
          Guide
        </Badge>
        <h1 className="mb-4 font-heading font-semibold text-3xl tracking-tight sm:text-4xl">
          Domain reputation on SES
        </h1>
        <p className="text-lg text-muted-foreground">
          A complaint rate is a recipient-quality problem before it is a
          technical one. Authentication and bounce handling keep you out of
          obvious trouble; who you mail and how often is what actually moves the
          number.
        </p>
      </div>

      <section className="mb-12">
        <Card className="p-5">
          <p className="text-muted-foreground text-sm">
            The AWS thresholds, the CloudWatch alarms Wraps deploys per preset,
            and how to read a bounce are covered in{" "}
            <Link
              className="text-primary underline"
              href="/docs/guides/bounce-handling"
            >
              Bounce &amp; complaint handling
            </Link>
            . This page is the other half: keeping the rate low in the first
            place, and what to do when it starts climbing anyway.
          </p>
        </Card>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 font-heading font-semibold text-2xl tracking-tight">
          What actually moves the number
        </h2>
        <p className="mb-4 text-muted-foreground">
          In rough order of effect. The first two are worth more than everything
          below them combined.
        </p>
        <ol className="grid gap-4 text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">
              Mail people who asked.
            </span>{" "}
            Confirmed opt-in costs you list size and buys you a complaint rate
            that stays flat under volume. A purchased or scraped list will cross
            0.1% on its first real send, and no amount of authentication
            prevents that.
          </li>
          <li>
            <span className="font-medium text-foreground">
              Stop mailing people who stopped reading.
            </span>{" "}
            Engagement is an input to placement at Gmail and Outlook. Someone
            who has not opened anything in six months is more likely to report
            spam than to convert. Suppress them on a schedule rather than
            waiting for them to complain.
          </li>
          <li>
            <span className="font-medium text-foreground">
              Make unsubscribing easier than complaining.
            </span>{" "}
            Every spam button press is a complaint against your domain. A
            visible unsubscribe link plus <code>List-Unsubscribe</code> and{" "}
            <code>List-Unsubscribe-Post</code> headers give an annoyed recipient
            a cheaper exit. Google and Yahoo require one-click unsubscribe for
            bulk senders, and it is the single easiest complaint-rate win.
          </li>
          <li>
            <span className="font-medium text-foreground">
              Ramp new domains slowly.
            </span>{" "}
            A cold domain sending 100,000 messages on day one looks exactly like
            a compromised one. Start in the hundreds, double every day or two
            while the rates stay clean, and send to your most engaged recipients
            first.
          </li>
          <li>
            <span className="font-medium text-foreground">
              One message per recipient.
            </span>{" "}
            Thirty addresses in a single BCC means SES cannot tell you who
            complained. One send each keeps the attribution exact, which is what
            lets you suppress the right person.
          </li>
          <li>
            <span className="font-medium text-foreground">
              Authenticate everything.
            </span>{" "}
            SPF, DKIM, and a DMARC record that is actually enforcing. This is
            table stakes rather than an advantage — it stops you being filtered
            for the wrong reason, and it does nothing for a bad list.
          </li>
        </ol>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 font-heading font-semibold text-2xl tracking-tight">
          Separate the streams so you can see which one is failing
        </h2>
        <p className="mb-4 text-muted-foreground">
          Reputation is scored on the account. That means one bad campaign can
          take your password resets down with it, and the account average will
          not tell you which stream caused it.
        </p>
        <CodeBlock
          className="mb-6 h-auto"
          data={[
            {
              language: "bash",
              filename: "streams",
              code: separateStreamsCode,
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
        <p className="text-muted-foreground">
          Wraps does not create the second configuration set for you or split
          the streams by default. It enables reputation metrics on the one it
          deploys, which is what makes the split legible once you make it.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 font-heading font-semibold text-2xl tracking-tight">
          Watching it
        </h2>
        <p className="mb-4 text-muted-foreground">
          The dashboard shows bounce and complaint trends with bot opens
          filtered out. When you want the raw numbers, or want them in your own
          alerting, they are CloudWatch metrics in your account:
        </p>
        <CodeBlock
          className="mb-6 h-auto"
          data={[{ language: "bash", filename: "terminal", code: cwCode }]}
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
        <p className="text-muted-foreground">
          The rate AWS enforces on is a trailing account-wide average, so it
          moves slowly in both directions. That is why it has to be watched
          rather than checked: by the time it is visibly bad, pulling it back
          down takes as much clean volume as it took to spoil.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 font-heading font-semibold text-2xl tracking-tight">
          When it starts climbing
        </h2>
        <p className="mb-4 text-muted-foreground">
          A runbook, in order. The first step is the one people skip.
        </p>
        <ol className="grid gap-3 text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">
              Stop the bulk sending.
            </span>{" "}
            Not the transactional stream. Pause campaigns and automated
            re-engagement before you start investigating, because every hour of
            continued sending adds to the average you are trying to pull down.
          </li>
          <li>
            <span className="font-medium text-foreground">
              Find the segment.
            </span>{" "}
            Group recent complaints by campaign, by signup source, and by signup
            date. A complaint spike is almost always one list, one import, or
            one re-engagement send to people who forgot who you are.
          </li>
          <li>
            <span className="font-medium text-foreground">
              Suppress that segment entirely.
            </span>{" "}
            Not just the individuals who complained. If one import is producing
            complaints, the rest of that import will too.
          </li>
          <li>
            <span className="font-medium text-foreground">
              Verify the suppression list is being enforced.
            </span>{" "}
            Confirm bounces and complaints are actually landing on the SES
            account-level list rather than only in your own database.
          </li>
          <li>
            <span className="font-medium text-foreground">
              Resume at lower volume, most engaged first.
            </span>{" "}
            Clean volume is the only thing that brings a trailing average back.
            Recipients who open reliably are the safest volume to send.
          </li>
          <li>
            <span className="font-medium text-foreground">
              If AWS has already written to you, answer with specifics.
            </span>{" "}
            What the cause was, which segment you suppressed, and what you
            changed so it cannot recur. A reply that names a mechanism gets
            better outcomes than one that promises to be careful.
          </li>
        </ol>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 font-heading font-semibold text-2xl tracking-tight">
          Quarterly check
        </h2>
        <ul className="grid gap-3 text-muted-foreground">
          <li className="flex gap-2.5">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-500" />
            DMARC is enforcing, not <code>p=none</code>, and someone reads the
            reports.
          </li>
          <li className="flex gap-2.5">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-500" />
            One-click unsubscribe works, end to end, on a real send.
          </li>
          <li className="flex gap-2.5">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-500" />
            Recipients with no engagement in six months are suppressed or in a
            separate low-frequency stream.
          </li>
          <li className="flex gap-2.5">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-500" />
            Marketing and transactional are on different subdomains and
            different configuration sets.
          </li>
          <li className="flex gap-2.5">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-500" />
            Reputation alarms exist and point at a channel a human reads. The
            Starter preset ships with alerting off.
          </li>
        </ul>
      </section>

      <section className="rounded-2xl border bg-muted/30 p-6">
        <h2 className="mb-2 font-heading font-semibold text-xl tracking-tight">
          Next steps
        </h2>
        <p className="mb-5 text-muted-foreground">
          Thresholds and alarms live in the bounce guide. Suppression mechanics
          live in the suppression guide.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/docs/guides/bounce-handling">
              Bounce &amp; complaint handling
              <ArrowRight className="ml-2 size-4" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/docs/guides/suppression-lists">Suppression lists</Link>
          </Button>
        </div>
      </section>
    </DocsLayout>
  );
}
