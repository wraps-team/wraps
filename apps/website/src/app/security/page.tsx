import { Card } from "@wraps/ui/components/ui/card";
import { ArrowRight, Check, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { SectionKicker } from "@/app/landing/components/section-kicker";
import { JsonLd } from "@/components/json-ld";

const TITLE = "Security at Wraps — the trust boundary, in detail";
const DESCRIPTION =
  "How Wraps accesses your AWS account: a cross-account IAM role with an external ID, short-lived STS credentials, no stored AWS keys, resources namespaced wraps-*. What we store, what stays in your account, and what certifications we do and do not have.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: `${TITLE} | Wraps`,
    description: DESCRIPTION,
    url: "https://wraps.dev/security",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${TITLE} | Wraps`,
    description: DESCRIPTION,
  },
  alternates: { canonical: "https://wraps.dev/security" },
};

const LAST_UPDATED = "August 28, 2026";

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "Home",
      item: "https://wraps.dev",
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "Security",
      item: "https://wraps.dev/security",
    },
  ],
};

// Deliberately split into "can" and "cannot". A security page that only lists
// capabilities reads as marketing; the boundary is the interesting half.
const canDo = [
  "Read SES account state: sending statistics, identities, verification status, configuration sets",
  "Read and write SES templates and, when you enable sending, call SES SendEmail on your behalf",
  "Read and write DynamoDB tables named wraps-email-* — the event history we deployed",
  "Read and write SQS queues named wraps-email-* and put events on wraps-email-* event buses",
  "Read AWS End User Messaging configuration when you deploy the SMS service",
];

const cannotDo = [
  "Read any DynamoDB table, S3 bucket, or queue that is not namespaced wraps-email-* or wraps-sms-*",
  "Read your application database, source code, or secrets",
  "Create, modify, or delete IAM users, roles, or policies",
  "Modify SES resources that Wraps did not create — existing identities and configuration sets are untouched",
  "Access your account with anything other than a temporary credential issued through STS",
];

const dataRows: {
  data: string;
  where: string;
  ours: boolean;
  retention: string;
}[] = [
  {
    data: "The emails themselves — content, recipients, headers",
    where: "Your AWS account (SES)",
    ours: false,
    retention: "You decide",
  },
  {
    data: "Raw delivery events (send, delivery, bounce, complaint, open, click)",
    where: "Your AWS account (DynamoDB, EventBridge, SQS)",
    ours: false,
    retention: "You decide",
  },
  {
    data: "Account, organization, and session records",
    where: "Neon Postgres, United States",
    ours: true,
    retention: "While your account is active",
  },
  {
    data: "Contacts, audiences, templates, and the send ledger",
    where: "Neon Postgres, United States",
    ours: true,
    retention: "While your account is active; deleted on request",
  },
  {
    data: "Recipient engagement metadata (open/click user agent)",
    where: "Neon Postgres, United States",
    ours: true,
    retention: "With the send ledger row it belongs to",
  },
  {
    data: "AWS access keys and secret keys",
    where: "Nowhere",
    ours: false,
    retention: "Never stored, at any point",
  },
  {
    data: "CLI telemetry (anonymous, opt-out)",
    where: "PostHog Cloud, United States",
    ours: true,
    retention: "90 days",
  },
  {
    data: "Server logs",
    where: "Vercel, United States",
    ours: true,
    retention: "7 days",
  },
];

const posture: { claim: string; status: "yes" | "no"; detail: string }[] = [
  {
    claim: "SOC 2 Type II",
    status: "no",
    detail:
      "Not certified and not currently in an audit window. If you need one to buy, tell us — it moves up the roadmap when a real customer needs it.",
  },
  {
    claim: "ISO 27001",
    status: "no",
    detail: "Not certified.",
  },
  {
    claim: "HIPAA BAA",
    status: "no",
    detail:
      "We do not sign BAAs. Do not send protected health information through the Wraps platform layer.",
  },
  {
    claim: "GDPR — data processing agreement",
    status: "yes",
    detail:
      "We act as your processor for platform data. Standard terms are published at /dpa.",
  },
  {
    claim: "Penetration test report",
    status: "no",
    detail:
      "No third-party pen test has been commissioned. The entire codebase is public instead — see below.",
  },
  {
    claim: "Source code auditable by you",
    status: "yes",
    detail:
      "Wraps is AGPLv3. Every IAM policy, every deployed resource, and the telemetry implementation are readable in the public repository.",
  },
];

export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />
      <JsonLd data={breadcrumbSchema} />

      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="mx-auto max-w-4xl">
          {/* ================= HERO ================= */}
          <section className="mb-14">
            <SectionKicker>Security</SectionKicker>
            <h1 className="mb-5 font-heading font-semibold text-4xl tracking-tight sm:text-5xl">
              The trust boundary is the product.
            </h1>
            <p className="mb-4 max-w-2xl text-lg text-muted-foreground">
              Most email vendors ask you to route your mail through their
              servers and trust a policy document. Wraps deploys infrastructure
              into your AWS account and reads it across a role you create, own,
              and can delete. The security story is mostly architecture, so this
              page describes the architecture rather than listing adjectives.
            </p>
            <p className="max-w-2xl text-lg text-muted-foreground">
              It also says plainly what we do not have. As of {LAST_UPDATED}{" "}
              that includes SOC 2.
            </p>
          </section>

          {/* ================= ACCESS MODEL ================= */}
          <section className="mb-16">
            <h2 className="mb-3 font-heading font-semibold text-2xl tracking-tight">
              How Wraps reaches your AWS account
            </h2>
            <p className="mb-6 max-w-2xl text-muted-foreground">
              There is exactly one path, and it does not involve a credential
              you hand us.
            </p>

            <ol className="mb-6 grid gap-6">
              {[
                {
                  title: "You create the role, with your own credentials",
                  body: (
                    <>
                      Running <code>wraps platform connect</code> uses the AWS
                      credentials already on your machine to create an IAM role
                      named <code>wraps-console-access-role</code> in your
                      account. Wraps never holds a credential capable of doing
                      this itself.
                    </>
                  ),
                },
                {
                  title: "The trust policy names one account and one secret",
                  body: (
                    <>
                      The role's trust policy allows <code>sts:AssumeRole</code>{" "}
                      from the Wraps platform AWS account{" "}
                      <code>905130073023</code>, gated on an{" "}
                      <code>sts:ExternalId</code> condition. That external ID is
                      generated per connection, so possession of your account ID
                      alone is not enough to assume the role — this is the
                      standard mitigation for the confused-deputy problem.
                    </>
                  ),
                },
                {
                  title: "Every call uses a short-lived credential",
                  body: (
                    <>
                      The dashboard assumes the role through STS and receives
                      temporary credentials that expire on their own. No AWS
                      access key or secret key of yours is ever transmitted to
                      or stored by Wraps. For Vercel-hosted sending we use OIDC
                      federation, which likewise issues short-lived credentials
                      rather than storing a key.
                    </>
                  ),
                },
                {
                  title: "The permissions are namespaced, not account-wide",
                  body: (
                    <>
                      Data-plane permissions are scoped by ARN to resources
                      Wraps deployed —{" "}
                      <code>arn:aws:dynamodb:*:*:table/wraps-email-*</code>,{" "}
                      <code>arn:aws:sqs:*:*:wraps-email-*</code>,{" "}
                      <code>arn:aws:events:*:*:event-bus/wraps-email-*</code>.
                      Statements are added only for the features you actually
                      enable: no event tracking, no DynamoDB statement.
                    </>
                  ),
                },
                {
                  title: "You revoke it by deleting it",
                  body: (
                    <>
                      Delete the role — or just the external ID condition's
                      trust — and Wraps loses access immediately, with no ticket
                      and no waiting on us. Your infrastructure keeps running
                      and your mail keeps sending, because none of it depends on
                      Wraps being reachable.
                    </>
                  ),
                },
              ].map((step, i) => (
                <li className="flex gap-4" key={step.title}>
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted font-mono font-semibold text-foreground text-xs">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="mb-1.5 font-semibold text-foreground">
                      {step.title}
                    </h3>
                    <p className="text-muted-foreground text-sm leading-[1.6] [&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:text-foreground">
                      {step.body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>

            <Card className="p-5">
              <p className="text-muted-foreground text-sm">
                You do not have to take any of this on faith. The policy
                document is generated by{" "}
                <a
                  className="text-primary underline"
                  href="https://github.com/wraps-team/wraps/blob/main/packages/cli/src/commands/platform/connect.ts"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <code>packages/cli/src/commands/platform/connect.ts</code>
                </a>{" "}
                and the CLI prints it before it creates anything. Read it, diff
                it against what lands in IAM, and refuse it if they disagree.
              </p>
            </Card>
          </section>

          {/* ================= CAN / CANNOT ================= */}
          <section className="mb-16">
            <h2 className="mb-3 font-heading font-semibold text-2xl tracking-tight">
              What that role can and cannot do
            </h2>
            <p className="mb-6 max-w-2xl text-muted-foreground">
              The exact statement list depends on which services you deployed.
              This is the shape of the maximum.
            </p>
            <div className="grid gap-6 sm:grid-cols-2">
              <Card className="p-6">
                <h3 className="mb-4 font-semibold text-foreground">Can</h3>
                <ul className="grid gap-3 text-muted-foreground text-sm">
                  {canDo.map((item) => (
                    <li className="flex gap-2.5" key={item}>
                      <Check
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-500"
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </Card>
              <Card className="p-6">
                <h3 className="mb-4 font-semibold text-foreground">Cannot</h3>
                <ul className="grid gap-3 text-muted-foreground text-sm">
                  {cannotDo.map((item) => (
                    <li className="flex gap-2.5" key={item}>
                      <X
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-muted-foreground/70"
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          </section>

          {/* ================= ZERO STORED CREDENTIALS ================= */}
          <section className="mb-16">
            <h2 className="mb-3 font-heading font-semibold text-2xl tracking-tight">
              Zero stored credentials, and what that phrase does not mean
            </h2>
            <p className="mb-4 max-w-2xl text-muted-foreground">
              The phrase gets used for two unrelated things. In authentication
              it usually means passwordless login: no password hashes sitting in
              a user table for somebody to crack offline. That is not what it
              means here.
            </p>
            <p className="mb-6 max-w-2xl text-muted-foreground">
              On this page it is a claim about infrastructure access. Wraps
              holds no AWS access key or secret key belonging to you, at any
              point. Reaching your account requires assuming a role you created,
              from one named AWS account, gated on an external ID, for
              credentials that expire on their own. There is no long-lived
              secret of yours in our database to steal, because one was never
              issued.
            </p>
            <p className="mb-6 max-w-2xl text-muted-foreground">
              The practical difference shows up on the worst day either party
              has.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-border border-b">
                    <th className="w-1/3 py-3 pr-4 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                      If this is breached
                    </th>
                    <th className="py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                      What the attacker walks away with
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-border/60 border-b align-top">
                    <th className="py-4 pr-4 font-medium text-sm" scope="row">
                      A provider that stores your SES keys
                    </th>
                    <td className="py-4 text-muted-foreground">
                      Long-lived AWS credentials for your account, usable from
                      anywhere on the internet until somebody notices and
                      rotates them.
                    </td>
                  </tr>
                  <tr className="border-border/60 border-b align-top">
                    <th className="py-4 pr-4 font-medium text-sm" scope="row">
                      Wraps
                    </th>
                    <td className="py-4 text-muted-foreground">
                      A role ARN and an external ID. Neither works without the
                      ability to call <code>sts:AssumeRole</code> as AWS account{" "}
                      <code>905130073023</code>, and you can end that by
                      deleting the role.
                    </td>
                  </tr>
                  <tr className="border-border/60 border-b align-top">
                    <th className="py-4 pr-4 font-medium text-sm" scope="row">
                      Your own AWS account
                    </th>
                    <td className="py-4 text-muted-foreground">
                      The same blast radius either way. Moving sending into your
                      account moves that risk to you, which is the trade BYOC
                      asks you to make.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-6 max-w-2xl text-muted-foreground">
              The limit worth stating: this covers the sending path only. Your
              contacts, templates, and workflows live in the Wraps database, and
              a breach there is a breach of that data. Zero stored credentials
              is a statement about access to your AWS account, not a claim that
              we hold nothing of yours.
            </p>
          </section>

          {/* ================= DATA ================= */}
          <section className="mb-16">
            <h2 className="mb-3 font-heading font-semibold text-2xl tracking-tight">
              Where every category of data lives
            </h2>
            <p className="mb-6 max-w-2xl text-muted-foreground">
              "Your data stays in your account" is true of the sending path and
              the raw event stream. It is not true of everything — the platform
              features need a database, and that database is ours. Here is the
              line.
            </p>

            <Card className="overflow-hidden py-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-4 text-left font-medium">Data</th>
                      <th className="p-4 text-left font-medium">
                        Where it lives
                      </th>
                      <th className="p-4 text-left font-medium">Retention</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dataRows.map((row) => (
                      <tr className="border-b last:border-0" key={row.data}>
                        <td className="p-4 font-medium text-foreground">
                          {row.data}
                        </td>
                        <td className="p-4 text-muted-foreground">
                          {row.where}
                          {row.ours ? (
                            <span className="ml-2 inline-block rounded bg-orange-500/10 px-1.5 py-0.5 font-medium text-[11px] text-orange-700 dark:bg-orange-500/15 dark:text-orange-400">
                              Wraps holds this
                            </span>
                          ) : null}
                        </td>
                        <td className="p-4 text-muted-foreground">
                          {row.retention}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <p className="mt-4 text-muted-foreground text-sm">
              Data in transit is encrypted with HTTPS/TLS on every external
              connection. Platform data is scoped to your organization and is
              never combined with another customer's. Full detail, including
              your deletion and export rights, is in the{" "}
              <Link className="text-primary underline" href="/privacy">
                privacy policy
              </Link>
              .
            </p>
          </section>

          {/* ================= POSTURE ================= */}
          <section className="mb-16">
            <h2 className="mb-3 font-heading font-semibold text-2xl tracking-tight">
              Certifications: what we have and what we don't
            </h2>
            <p className="mb-6 max-w-2xl text-muted-foreground">
              Wraps is a small company. Claiming an audit we have not completed
              would be the single fastest way to lose the trust this page is
              trying to earn, so the list below is blunt.
            </p>
            <div className="grid gap-4">
              {posture.map((row) => (
                <Card
                  className="flex flex-row items-start gap-4 p-5"
                  key={row.claim}
                >
                  {row.status === "yes" ? (
                    <Check
                      aria-hidden="true"
                      className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-500"
                    />
                  ) : (
                    <X
                      aria-hidden="true"
                      className="mt-0.5 size-5 shrink-0 text-muted-foreground/60"
                    />
                  )}
                  <div>
                    <h3 className="font-semibold text-foreground">
                      {row.claim}
                    </h3>
                    <p className="mt-1 text-muted-foreground text-sm leading-[1.6]">
                      {row.detail}
                    </p>
                  </div>
                </Card>
              ))}
            </div>
          </section>

          {/* ================= OPERATIONS ================= */}
          <section className="mb-16">
            <h2 className="mb-3 font-heading font-semibold text-2xl tracking-tight">
              Operational practices
            </h2>
            <div className="grid gap-5 sm:grid-cols-2">
              {[
                {
                  title: "Access control",
                  body: "Production access is limited to the engineers who need it. Authentication to the dashboard supports SSO and SCIM provisioning on the Business plan.",
                },
                {
                  title: "Tenant isolation",
                  body: "Every query against platform data is scoped by organization. This is enforced in code and checked by an automated architecture test that fails the build on an unscoped query.",
                },
                {
                  title: "Dependency hygiene",
                  body: "Dependencies are reviewed weekly and CVE scans run daily against the repository. Findings are tracked publicly as issues.",
                },
                {
                  title: "Subprocessors",
                  body: "Six, all named, with what each one receives. We commit to notifying customers before adding one that processes personal data.",
                },
                {
                  title: "Incident response",
                  body: "If we become aware of a breach affecting your personal data we will notify you without undue delay and within 72 hours of becoming aware, with what we know at the time.",
                },
                {
                  title: "Reporting a vulnerability",
                  body: "Email security@wraps.dev. We will acknowledge within two business days. Please give us a reasonable window to fix before disclosing; we will not pursue researchers acting in good faith.",
                },
              ].map((item) => (
                <Card className="p-6" key={item.title}>
                  <h3 className="mb-2 font-semibold text-foreground">
                    {item.title}
                  </h3>
                  <p className="text-muted-foreground text-sm leading-[1.6]">
                    {item.body}
                  </p>
                </Card>
              ))}
            </div>
          </section>

          {/* ================= CTA ================= */}
          <section className="rounded-xl border border-border bg-muted/30 p-8">
            <h2 className="mb-3 font-heading font-semibold text-2xl tracking-tight">
              Reviewing Wraps for your team?
            </h2>
            <p className="mb-6 max-w-2xl text-muted-foreground">
              The subprocessor list and the data processing agreement are
              published, not gated behind a sales call. If your review needs
              something that is not here, ask and we will either answer it or
              tell you we cannot.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                className="inline-flex items-center gap-1.5 font-medium text-primary text-sm underline"
                href="/subprocessors"
              >
                Subprocessors
                <ArrowRight aria-hidden="true" className="size-3.5" />
              </Link>
              <Link
                className="inline-flex items-center gap-1.5 font-medium text-primary text-sm underline"
                href="/dpa"
              >
                Data processing agreement
                <ArrowRight aria-hidden="true" className="size-3.5" />
              </Link>
              <Link
                className="inline-flex items-center gap-1.5 font-medium text-primary text-sm underline"
                href="/privacy"
              >
                Privacy policy
                <ArrowRight aria-hidden="true" className="size-3.5" />
              </Link>
            </div>
            <p className="mt-6 text-muted-foreground text-sm">
              Last updated {LAST_UPDATED}. Wraps is a product of FlatironKids
              LLC, registered in Colorado, United States.
            </p>
          </section>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
