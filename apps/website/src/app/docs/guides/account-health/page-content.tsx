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

const curlCode = `curl https://api.wraps.dev/v1/account/health \\
  -H "Authorization: Bearer wraps_your_api_key"`;

const responseCode = `{
  "status": "at_risk",
  "checkedAt": "2026-09-04T09:00:00.000Z",
  "accounts": [
    {
      "id": "aws-acc-123",
      "accountNumber": "123456789012",
      "region": "us-east-1",
      "status": "at_risk",
      "checkedAt": "2026-09-04T09:00:00.000Z",
      "sandbox": false,
      "productionAccessEnabled": true,
      "sendingEnabled": true,
      "enforcementStatus": "HEALTHY",
      "quota": {
        "max24Hour": 50000,
        "sentLast24Hours": 41230,
        "usedRatio": 0.8246,
        "maxSendRate": 14
      },
      "reputation": {
        "bounceRate": 0.004,
        "complaintRate": 0.0001
      },
      "thresholds": {
        "bounceReview": 0.05,
        "bouncePause": 0.10,
        "complaintReview": 0.001,
        "complaintPause": 0.005,
        "quotaWarn": 0.8
      },
      "reasons": ["quota_high"]
    }
  ]
}`;

const singleAccountCode = `curl https://api.wraps.dev/v1/account/health/aws-acc-123 \\
  -H "Authorization: Bearer wraps_your_api_key"`;

export default function AccountHealthPageContent() {
  return (
    <DocsLayout>
      <div className="mb-10">
        <Badge className="mb-3" variant="outline">
          Guide
        </Badge>
        <h1 className="mb-4 font-heading font-semibold text-3xl tracking-tight sm:text-4xl">
          Account Health API
        </h1>
        <p className="text-lg text-muted-foreground">
          Wraps deploys your email infrastructure into your own AWS account,
          which means you own its failure modes too: the sandbox, production
          access, enforcement pauses, reputation review thresholds, the 24-hour
          quota.{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            GET /v1/account/health
          </code>{" "}
          is the queryable answer to "am I safe to send right now?" — a fact
          about infrastructure you own, not a support article.
        </p>
      </div>

      <section className="mb-12">
        <Card className="p-5">
          <p className="text-muted-foreground text-sm">
            A hosted ESP has no per-customer SES account to describe, so this
            endpoint has no equivalent there. It exists because the hourly
            account-health sweep that watches your connected AWS accounts
            already computes every number below — this route just answers with
            what it already knows, reading Postgres only. No AWS call happens
            while you wait on this request.
          </p>
        </Card>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 font-heading font-semibold text-2xl tracking-tight">
          Org-wide rollup
        </h2>
        <p className="mb-4 text-muted-foreground">
          Returns every AWS account connected to your organization, plus a
          top-level rollup: the worst status across all of them wins.
        </p>
        <CodeBlock
          className="mb-4 h-auto"
          data={[{ language: "bash", filename: "terminal.sh", code: curlCode }]}
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
        <CodeBlock
          className="h-auto"
          data={[
            { language: "json", filename: "response.json", code: responseCode },
          ]}
          defaultValue="json"
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
      </section>

      <section className="mb-12">
        <h2 className="mb-4 font-heading font-semibold text-2xl tracking-tight">
          Single account
        </h2>
        <p className="mb-4 text-muted-foreground">
          <code className="rounded bg-muted px-1.5 py-0.5">
            GET /v1/account/health/:awsAccountId
          </code>{" "}
          returns the same per-account shape for exactly one connected account,
          org-scoped — a request naming an account that belongs to another
          organization, or that does not exist, returns{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">404</code>.
        </p>
        <CodeBlock
          className="h-auto"
          data={[
            {
              language: "bash",
              filename: "terminal.sh",
              code: singleAccountCode,
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
      </section>

      <section className="mb-12">
        <h2 className="mb-4 font-heading font-semibold text-2xl tracking-tight">
          Reading the status field
        </h2>
        <p className="mb-4 text-muted-foreground">
          Every status is one of exactly four values, on both the per-account
          objects and the top-level rollup:
        </p>
        <Card>
          <div className="overflow-x-auto p-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-2 text-left">Status</th>
                  <th className="pb-2 text-left">Meaning</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b">
                  <td className="py-2 font-medium text-foreground">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      healthy
                    </code>
                  </td>
                  <td className="py-2">
                    Sending is enabled, enforcement is HEALTHY, and every rate
                    is below AWS's review line.
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 font-medium text-foreground">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      at_risk
                    </code>
                  </td>
                  <td className="py-2">
                    One or more numbers has crossed AWS's review line —
                    enforcement is PROBATION, or bounce/complaint rate is in the
                    review range, or the 24-hour quota is nearly used up.
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 font-medium text-foreground">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      in_danger
                    </code>
                  </td>
                  <td className="py-2">
                    Sending is disabled, enforcement has moved past PROBATION,
                    or a rate has crossed AWS's pause line. This covers a paused
                    account — the specific cause is always in{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      reasons
                    </code>
                    .
                  </td>
                </tr>
                <tr>
                  <td className="py-2 font-medium text-foreground">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      unknown
                    </code>
                  </td>
                  <td className="py-2">
                    No hourly sweep has ever completed for this account. Not a
                    fifth severity level — the absence of a measurement.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 font-heading font-semibold text-2xl tracking-tight">
          Why unknown is not healthy
        </h2>
        <p className="mb-4 text-muted-foreground">
          An account nobody has been able to check is exactly the account most
          likely to be in trouble — treating it as{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">healthy</code> would
          be the exact lie this endpoint exists to avoid. The same rule applies
          to the org-wide rollup:{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">unknown</code>{" "}
          outranks{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">healthy</code>, so an
          org with one never-swept account and nine healthy ones still rolls up
          to <code className="rounded bg-muted px-1.5 py-0.5">unknown</code>.
          The full ranking, worst first:{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            in_danger &gt; at_risk &gt; unknown &gt; healthy
          </code>
          .
        </p>
        <p className="text-muted-foreground">
          The same rule holds field by field: a never-swept account reports{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">null</code> for every
          rate, quota figure, and{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">sandbox</code> —
          never a measured-looking{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">0</code> or{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">false</code>.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 font-heading font-semibold text-2xl tracking-tight">
          Thresholds and headroom
        </h2>
        <p className="mb-4 text-muted-foreground">
          <code className="rounded bg-muted px-1.5 py-0.5">thresholds</code> on
          every account is AWS's own published review and pause lines — the same
          numbers Wraps compares against when it computes{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">status</code>, not
          numbers Wraps invented. A caller can compute its own headroom (e.g.{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            thresholds.bouncePause - reputation.bounceRate
          </code>
          ) rather than waiting for the status to change.
        </p>
        <Card className="p-5">
          <p className="text-muted-foreground text-sm">
            <span className="font-medium text-foreground">
              Every rate is a decimal between 0 and 1, never a percentage.
            </span>{" "}
            A bounce rate of 5% is{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">0.05</code>, not{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">5</code>. The same
            is true of{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">
              quota.usedRatio
            </code>{" "}
            and every field under{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">thresholds</code>.
          </p>
        </Card>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 font-heading font-semibold text-2xl tracking-tight">
          Freshness: checkedAt
        </h2>
        <p className="mb-4 text-muted-foreground">
          Every number here comes from the last completed hourly account-health
          sweep, not a live AWS read.{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">checkedAt</code> is
          the contract that keeps that honest — it is the timestamp of that
          sweep, per account and, on the rollup, the OLDEST timestamp among the
          accounts represented, so the freshness claim holds for every account
          the rollup speaks for. A verdict from over an hour ago usually just
          means the next sweep hasn't run yet; a verdict from much longer ago is
          worth investigating on its own.
        </p>
        <ul className="grid gap-3 text-muted-foreground">
          <li className="flex gap-2.5">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-500" />
            Poll this endpoint before a send, not instead of watching for
            in-band send failures — the verdict is at most an hour stale.
          </li>
          <li className="flex gap-2.5">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-500" />
            An account that has never connected, or whose console-access role
            cannot be assumed, reports{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">unknown</code> —
            check{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">
              /docs/guides/production-access
            </code>{" "}
            if that persists.
          </li>
        </ul>
      </section>

      <section className="rounded-2xl border bg-muted/30 p-6">
        <h2 className="mb-2 font-heading font-semibold text-xl tracking-tight">
          Next steps
        </h2>
        <p className="mb-5 text-muted-foreground">
          The thresholds this endpoint reports come from AWS's real enforcement
          lines. The bounce guide covers what moves them and the alarms Wraps
          deploys per preset.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/docs/guides/bounce-handling">
              Bounce &amp; complaint handling
              <ArrowRight className="ml-2 size-4" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/docs/guides/production-access">Production access</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/docs/reference/api">API Reference</Link>
          </Button>
        </div>
      </section>
    </DocsLayout>
  );
}
