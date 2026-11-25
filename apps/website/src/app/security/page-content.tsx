import { DotPattern } from "@wraps/ui/components/dot-pattern";
import { Check, X } from "lucide-react";
import Link from "next/link";
import { ClosingPanel } from "@/app/landing/components/closing-panel";
import { FlowBox } from "@/app/landing/components/flow-primitives";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { Band, SectionHead } from "@/app/landing/components/page-band";
import { SectionKicker } from "@/app/landing/components/section-kicker";
import { LICENSE_STATEMENT } from "@/config/license";

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
    claim: "SOC 2",
    status: "no",
    detail: "We don't have SOC 2 yet.",
  },
  {
    claim: "ISO 27001",
    status: "no",
    detail: "Not certified.",
  },
  {
    claim: "HIPAA",
    status: "no",
    detail:
      "We don't have HIPAA certification yet. Don't send protected health information through the Wraps platform layer.",
  },
  {
    claim: "GDPR data processing agreement",
    status: "yes",
    detail:
      "We act as your processor for platform data. Standard terms are published at /dpa.",
  },
  {
    claim: "Penetration test report",
    status: "no",
    detail: `No third-party pen test has been commissioned. The code is public instead. ${LICENSE_STATEMENT}`,
  },
  {
    claim: "Source code you can read",
    status: "yes",
    detail: `Every IAM policy, every deployed resource and the telemetry implementation are readable in the public repository. ${LICENSE_STATEMENT}`,
  },
];

const steps = [
  {
    title: "You create the role, with your own credentials",
    body: (
      <>
        Running <code>wraps platform connect</code> uses the AWS credentials
        already on your machine to create an IAM role named{" "}
        <code>wraps-console-access-role</code> in your account. Wraps never
        holds a credential that could do this itself.
      </>
    ),
  },
  {
    title: "The trust policy names one account and one secret",
    body: (
      <>
        The role's trust policy allows <code>sts:AssumeRole</code> from the
        Wraps platform AWS account <code>905130073023</code>, gated on an{" "}
        <code>sts:ExternalId</code> condition. The external ID is generated per
        connection, so knowing your account ID is not enough to assume the role.
        This is the standard fix for the confused-deputy problem.
      </>
    ),
  },
  {
    title: "Every call uses a short-lived credential",
    body: (
      <>
        The dashboard assumes the role through STS and gets temporary
        credentials that expire on their own. No AWS access key or secret key of
        yours is ever sent to or stored by Wraps. For Vercel-hosted sending we
        use OIDC federation, which also issues short-lived credentials.
      </>
    ),
  },
  {
    title: "The permissions are namespaced, not account-wide",
    body: (
      <>
        Data-plane permissions are scoped by ARN to resources Wraps deployed:{" "}
        <code>arn:aws:dynamodb:*:*:table/wraps-email-*</code>,{" "}
        <code>arn:aws:sqs:*:*:wraps-email-*</code>,{" "}
        <code>arn:aws:events:*:*:event-bus/wraps-email-*</code>. Statements are
        added only for features you enable: no event tracking, no DynamoDB
        statement.
      </>
    ),
  },
  {
    title: "You revoke it by deleting it",
    body: (
      <>
        Delete the role, or just the external ID condition's trust, and Wraps
        loses access immediately. No ticket, no waiting on us. Your
        infrastructure keeps running and your mail keeps sending, because none
        of it depends on Wraps being reachable.
      </>
    ),
  },
];

const operations = [
  {
    title: "Access control",
    body: "Production access is limited to the engineers who need it. Sign-in to the dashboard supports SSO and SCIM provisioning on the Business plan.",
  },
  {
    title: "Tenant isolation",
    body: "Every query against platform data is scoped by organization. This is enforced in code and checked by an automated architecture test that fails the build on an unscoped query.",
  },
  {
    title: "Dependency hygiene",
    body: "GitHub Actions versions are pinned to commit hashes, and Dependabot opens a weekly pull request to bump them.",
  },
  {
    title: "Subprocessors",
    body: "Six, all named, with what each one receives. We commit to notifying customers before adding one that processes personal data.",
  },
  {
    title: "Incident response",
    body: "If we become aware of a breach affecting your personal data, we will notify you without undue delay and within 72 hours, with what we know at the time.",
  },
  {
    title: "Reporting a vulnerability",
    body: "Email security@wraps.dev. We acknowledge within two business days. Please give us a reasonable window to fix before disclosing. We will not pursue researchers acting in good faith.",
  },
];

const codeClass =
  "[&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:text-foreground";

const LAST_UPDATED = "November 25, 2026";

export function SecurityPageContent() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />
      <main>
        <section className="relative overflow-hidden pt-20 pb-12 sm:pt-28">
          <div className="absolute inset-0">
            <DotPattern className="opacity-100" fadeStyle="ellipse" size="md" />
          </div>
          <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <SectionKicker>Security</SectionKicker>
              <h1 className="mb-5 text-pretty font-heading font-semibold text-4xl leading-tight tracking-tight sm:text-5xl">
                What Wraps can reach in your AWS account, and what it can't.
              </h1>
              <p className="mb-4 text-lg text-muted-foreground">
                Most email vendors ask you to route your mail through their
                servers and trust a policy document. Wraps deploys
                infrastructure into your AWS account and reads it across a role
                you create, own and can delete. The security story is mostly
                architecture, so this page describes the architecture.
              </p>
              <p className="text-lg text-muted-foreground">
                It also says what we don't have. We don't have SOC 2 yet.
              </p>
            </div>
          </div>
        </section>

        <Band id="access">
          <SectionHead
            body="There is one path, and it doesn't involve a credential you hand us."
            kicker="Access"
            title="How Wraps reaches your AWS account"
          />
          <ol className="mb-8 grid gap-x-6 gap-y-8 md:grid-cols-2">
            {steps.map((step, index) => (
              <li key={step.title}>
                <FlowBox
                  className="h-full"
                  dashed={index === 1}
                  label={`Step ${index + 1}`}
                >
                  <h3 className="mb-1.5 font-heading font-semibold text-foreground">
                    {step.title}
                  </h3>
                  <p
                    className={`text-muted-foreground text-sm leading-relaxed ${codeClass}`}
                  >
                    {step.body}
                  </p>
                </FlowBox>
              </li>
            ))}
          </ol>
          <FlowBox label="Check it yourself">
            <p className="text-muted-foreground text-sm">
              You don't have to take any of this on faith. The policy document
              is generated by{" "}
              <a
                className="text-foreground underline underline-offset-4"
                href="https://github.com/wraps-team/wraps/blob/main/packages/cli/src/commands/platform/connect.ts"
                rel="noopener noreferrer"
                target="_blank"
              >
                <code className="bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">
                  packages/cli/src/commands/platform/connect.ts
                </code>
              </a>{" "}
              and the CLI prints it before it creates anything. Read it, diff it
              against what lands in IAM, and refuse it if they disagree.
            </p>
          </FlowBox>
        </Band>

        <Band id="boundary" sunken>
          <SectionHead
            body="The exact statement list depends on which services you deployed. This is the shape of the maximum."
            kicker="The role"
            title="What that role can and cannot do"
          />
          <div className="grid gap-x-6 gap-y-8 md:grid-cols-2">
            <FlowBox dashed label="Can">
              <ul className="grid gap-3 text-muted-foreground text-sm">
                {canDo.map((item) => (
                  <li className="flex gap-2.5" key={item}>
                    <Check
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-success"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </FlowBox>
            <FlowBox label="Cannot">
              <ul className="grid gap-3 text-muted-foreground text-sm">
                {cannotDo.map((item) => (
                  <li className="flex gap-2.5" key={item}>
                    <X
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </FlowBox>
          </div>
        </Band>

        <Band id="credentials">
          <SectionHead
            kicker="Credentials"
            title="Zero stored credentials, and what that phrase doesn't mean"
          />
          <div className="mb-8 grid max-w-3xl gap-4 text-muted-foreground">
            <p>
              The phrase gets used for two unrelated things. In authentication
              it usually means passwordless login: no password hashes in a user
              table for somebody to crack offline. That is not what it means
              here.
            </p>
            <p>
              Here it is a claim about infrastructure access. Wraps holds no AWS
              access key or secret key of yours, at any point. Reaching your
              account takes a role you created, from one named AWS account,
              gated on an external ID, for credentials that expire on their own.
              There is no long-lived secret of yours in our database to steal,
              because one was never issued.
            </p>
            <p>The difference shows up on the worst day either party has.</p>
          </div>
          <FlowBox label="If this is breached">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-border border-b">
                    <th className="w-1/3 py-3 pr-4 font-sans font-semibold text-muted-foreground text-xs uppercase tracking-eyebrow">
                      If this is breached
                    </th>
                    <th className="py-3 font-sans font-semibold text-muted-foreground text-xs uppercase tracking-eyebrow">
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
                    <td className={`py-4 text-muted-foreground ${codeClass}`}>
                      A role ARN and an external ID. Neither works without the
                      ability to call <code>sts:AssumeRole</code> as AWS account{" "}
                      <code>905130073023</code>, and you can end that by
                      deleting the role.
                    </td>
                  </tr>
                  <tr className="align-top">
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
          </FlowBox>
          <p className="mt-8 max-w-3xl text-muted-foreground">
            The limit worth stating: this covers access to your AWS account and
            nothing else. Your contacts, templates and workflows live in the
            Wraps database. So does a record of every message sent through the
            platform: the recipient address, the subject line, the sender, the
            template variables merged into it, and the delivery, open, click,
            bounce and complaint timestamps that follow. A breach of our
            database is a breach of all of that. Zero stored credentials is a
            statement about your AWS account, not a claim that we hold nothing
            of yours.
          </p>
        </Band>

        <Band id="data" sunken>
          <SectionHead
            body={
              <>
                "Your data stays in your account" is true of the sending path
                and the raw event stream. It is not true of everything. The
                platform features need a database, and that database is ours.
                Here is the line.
              </>
            }
            kicker="Data"
            title="Where every category of data lives"
          />
          <FlowBox label="Data locations">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <thead>
                  <tr className="border-border border-b">
                    <th className="p-3 text-left font-medium">Data</th>
                    <th className="p-3 text-left font-medium">
                      Where it lives
                    </th>
                    <th className="p-3 text-left font-medium">Retention</th>
                  </tr>
                </thead>
                <tbody>
                  {dataRows.map((row) => (
                    <tr
                      className="border-border/60 border-b last:border-0"
                      key={row.data}
                    >
                      <td className="p-3 font-medium text-foreground">
                        {row.data}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {row.where}
                        {row.ours ? (
                          <span className="ml-2 inline-block bg-brand/10 px-1.5 py-0.5 font-medium text-2xs text-brand-text">
                            Wraps holds this
                          </span>
                        ) : null}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {row.retention}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </FlowBox>
          <p className="mt-4 max-w-3xl text-muted-foreground text-sm">
            Data in transit is encrypted with HTTPS/TLS on every external
            connection. Platform data is scoped to your organization and is
            never combined with another customer's. Full detail, including your
            deletion and export rights, is in the{" "}
            <Link
              className="text-foreground underline underline-offset-4"
              href="/privacy"
            >
              privacy policy
            </Link>
            .
          </p>
        </Band>

        <Band id="certifications">
          <SectionHead
            body="Wraps is a small company. Claiming an audit we haven't completed would be the fastest way to lose the trust this page is trying to earn, so the list is blunt."
            kicker="Certifications"
            title="What we have and what we don't"
          />
          <div className="grid gap-x-6 gap-y-8 md:grid-cols-2">
            {posture.map((row) => (
              <FlowBox
                dashed={row.status === "yes"}
                key={row.claim}
                label={row.claim}
              >
                <div className="flex items-start gap-3">
                  {row.status === "yes" ? (
                    <Check
                      aria-hidden="true"
                      className="mt-0.5 size-5 shrink-0 text-success"
                    />
                  ) : (
                    <X
                      aria-hidden="true"
                      className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                    />
                  )}
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    <span className="sr-only">
                      {row.status === "yes" ? "Yes. " : "No. "}
                    </span>
                    {row.detail}
                  </p>
                </div>
              </FlowBox>
            ))}
          </div>
        </Band>

        <Band id="practices" sunken>
          <SectionHead kicker="Practices" title="Operational practices" />
          <div className="grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {operations.map((item) => (
              <FlowBox key={item.title} label={item.title}>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {item.body}
                </p>
              </FlowBox>
            ))}
          </div>
        </Band>

        <ClosingPanel
          body={
            <>
              The subprocessor list and the data processing agreement are
              published, not behind a sales call. If your review needs something
              that isn't here, ask and we'll answer it or tell you we can't.
              Last updated {LAST_UPDATED}. Wraps is a product of FlatironKids
              LLC, registered in Colorado, United States.
            </>
          }
          kicker="For reviewers"
          primary={{ label: "Subprocessors", href: "/subprocessors" }}
          secondary={{ label: "Data processing agreement", href: "/dpa" }}
          title="Reviewing Wraps for your team?"
        />
      </main>
      <LandingFooter />
    </div>
  );
}
