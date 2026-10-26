import { Card } from "@wraps/ui/components/ui/card";
import { ChevronRight, KeyRound, ShieldCheck, Timer } from "lucide-react";
import type { Metadata } from "next";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { JsonLd } from "@/components/json-ld";
import { CodeBlock } from "./page-content";

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "We Don't Hold Your AWS Keys",
  description:
    "How Wraps reaches your SES through OIDC and one-hour role sessions, the trust policy you can copy, and the places a static key still exists.",
  datePublished: "2026-10-23T00:00:00.000Z",
  dateModified: "2026-10-23T00:00:00.000Z",
  author: {
    "@type": "Organization",
    name: "Wraps",
    url: "https://wraps.dev",
    description:
      "Email infrastructure experts building tools to deploy production-ready email systems to AWS.",
    sameAs: ["https://github.com/wraps-team", "https://twitter.com/wrapsdev"],
  },
  publisher: {
    "@type": "Organization",
    name: "Wraps",
    logo: {
      "@type": "ImageObject",
      url: "https://wraps.dev/logo.png",
    },
  },
  mainEntityOfPage: {
    "@type": "WebPage",
    "@id": "https://wraps.dev/blog/no-stored-aws-keys",
  },
};

export const metadata: Metadata = {
  title: "We Don't Hold Your AWS Keys",
  description:
    "How Wraps reaches your SES through OIDC and one-hour role sessions, the trust policy you can copy, and the places a static key still exists.",
  openGraph: {
    title: "We Don't Hold Your AWS Keys | Wraps",
    description:
      "OIDC and one-hour role sessions instead of stored AWS access keys, and a trust policy you can copy today.",
    type: "article",
    url: "https://wraps.dev/blog/no-stored-aws-keys",
    publishedTime: "2026-10-23T00:00:00.000Z",
    authors: ["Wraps Team"],
  },
  twitter: {
    card: "summary_large_image",
    title: "We Don't Hold Your AWS Keys | Wraps",
    description:
      "OIDC and one-hour role sessions instead of stored AWS access keys, and a trust policy you can copy today.",
  },
  alternates: {
    canonical: "https://wraps.dev/blog/no-stored-aws-keys",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={articleSchema} />
      <div className="min-h-screen bg-background text-foreground">
        <LandingNavbar />

        {/* Hero */}
        <header className="relative overflow-hidden">
          <div className="absolute inset-0 bg-radial-top from-brand/20 via-transparent to-transparent" />

          <div className="relative mx-auto max-w-4xl px-6 pt-20 pb-16">
            <div className="mb-4 flex items-center gap-2 font-medium text-brand text-sm">
              <ShieldCheck size={16} />
              <span>Security</span>
              <span className="text-muted-foreground/50">&bull;</span>
              <span className="text-muted-foreground">6 min read</span>
              <span className="text-muted-foreground/50">&bull;</span>
              <span className="text-muted-foreground">Wraps Team</span>
              <span className="text-muted-foreground/50">&bull;</span>
              <span className="text-muted-foreground">October 23, 2026</span>
            </div>

            <h1 className="mb-6 font-bold text-4xl leading-tight md:text-5xl lg:text-6xl">
              We Don't Hold
              <span className="block bg-gradient-to-r from-brand to-warning bg-clip-text text-transparent dark:to-warning">
                Your AWS Keys
              </span>
            </h1>

            <p className="max-w-2xl text-muted-foreground text-xl leading-relaxed">
              Wraps reaches your SES through OIDC and one-hour role sessions.
              Here is the path, the trust policy you can copy, and the places a
              static key still exists.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <div className="flex items-center gap-2 rounded-full border bg-muted/30 px-4 py-2">
                <KeyRound className="text-brand" size={16} />
                <span className="text-foreground/80 text-sm">
                  OIDC on Vercel
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-full border bg-muted/30 px-4 py-2">
                <Timer className="text-brand" size={16} />
                <span className="text-foreground/80 text-sm">
                  One-hour role sessions
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-full border bg-muted/30 px-4 py-2">
                <ShieldCheck className="text-brand" size={16} />
                <span className="text-foreground/80 text-sm">
                  Revoke from your side
                </span>
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-4xl space-y-16 px-6 py-16">
          {/* This week */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">What happened this week</h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              On October 21, a malicious{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                litellm==1.107.0
              </code>{" "}
              sat on PyPI from 11:39 to 13:23 UTC.{" "}
              <a
                className="text-primary hover:underline"
                href="https://www.wiz.io/blog/litellm-compromised-steals-credentials"
                rel="noopener noreferrer"
                target="_blank"
              >
                Wiz's analysis
              </a>{" "}
              says its stealer read AWS credentials from{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">~/.aws</code>,
              from environment variables, and from instance metadata. Stolen
              credentials were being tested against AWS about four and a half
              hours after they left.{" "}
              <a
                className="text-primary hover:underline"
                href="https://docs.litellm.ai/blog/security-incident-oct-21-2026"
                rel="noopener noreferrer"
                target="_blank"
              >
                LiteLLM's incident report
              </a>{" "}
              tells anyone who ran it to rotate every secret on the host.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              The next day Vercel published{" "}
              <a
                className="text-primary hover:underline"
                href="https://vercel.com/blog/death-to-long-lived-static-credentials"
                rel="noopener noreferrer"
                target="_blank"
              >
                Death to long-lived static credentials
              </a>
              . They surveyed more than 1,000 SaaS vendors and found 8.4%
              supporting secure authentication. From November 30, Marketplace
              vendors that rely on long-lived secrets get a "Not secure" label.
            </p>

            <p className="text-foreground/80 text-lg leading-relaxed">
              Short-lived credentials would not have stopped that stealer. The
              credentials Wiz saw abused were instance-role credentials, which
              are already temporary. What changes is how long a stolen
              credential stays useful. A role session expires in hours. A static
              access key works until someone notices and rotates it.{" "}
              <a
                className="text-primary hover:underline"
                href="https://startupfortune.com/stolen-litellm-credentials-from-march-hack-surface-in-153gb-leak/"
                rel="noopener noreferrer"
                target="_blank"
              >
                Many credentials
              </a>{" "}
              taken in the March LiteLLM compromise were still valid five months
              later.
            </p>
          </section>

          {/* What we keep */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">
              What Wraps keeps for your AWS account
            </h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              The ARN of a role in your account, and an External ID. Neither is
              a credential. The External ID is the confused-deputy guard AWS
              recommends for cross-account roles. We also keep a webhook secret
              that your EventBridge uses when it sends us delivery events. None
              of them can call AWS.
            </p>

            <p className="mb-6 text-foreground/80 text-lg leading-relaxed">
              When the dashboard needs your SES, this is the whole chain:
            </p>

            <ol className="mb-6 space-y-4">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-muted font-mono text-muted-foreground text-xs">
                  1
                </span>
                <span className="text-foreground/80 text-lg leading-relaxed">
                  Our backend runs on Vercel. Vercel signs a short-lived OIDC
                  token for the deployment.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-muted font-mono text-muted-foreground text-xs">
                  2
                </span>
                <span className="text-foreground/80 text-lg leading-relaxed">
                  AWS exchanges that token for a session on a role in our
                  account. That role has one permission:{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    sts:AssumeRole
                  </code>
                  .
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-muted font-mono text-muted-foreground text-xs">
                  3
                </span>
                <span className="text-foreground/80 text-lg leading-relaxed">
                  We assume{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    wraps-console-access-role
                  </code>{" "}
                  in your account with your External ID. AWS returns credentials
                  that expire in one hour.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-muted font-mono text-muted-foreground text-xs">
                  4
                </span>
                <span className="text-foreground/80 text-lg leading-relaxed">
                  We keep them in memory for up to 50 minutes, then ask again.
                  They are never written to a database.
                </span>
              </li>
            </ol>

            <p className="mb-6 text-foreground/80 text-lg leading-relaxed">
              The dashboard's production environment has no AWS access key in
              it. There is nothing there to leak and nothing for us to rotate.
            </p>

            <Card className="p-6">
              <p className="text-foreground/80 leading-relaxed">
                Revoking is on your side. Delete the role, or the CloudFormation
                stack that created it, and our next AssumeRole call fails. You
                don't have to ask us or wait for a rotation.
              </p>
            </Card>
          </section>

          {/* Your app's path */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">
              Your app's path has no Wraps credential in it
            </h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              The CLI has written this trust policy since November 2025. Run{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                npx @wraps.dev/cli email init
              </code>
              , pick Vercel, and it creates an OIDC provider for your Vercel
              team in your AWS account, plus a role that trusts one project:
            </p>

            <CodeBlock
              code={`{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Federated": "arn:aws:iam::123456789012:oidc-provider/oidc.vercel.com/acme"
    },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "oidc.vercel.com/acme:aud": "https://vercel.com/acme"
      },
      "StringLike": {
        "oidc.vercel.com/acme:sub": "owner:acme:project:my-app:environment:*"
      }
    }
  }]
}`}
              lang="json"
              title="wraps-email-role trust policy"
            />

            <p className="mt-4 mb-4 text-foreground/80 text-lg leading-relaxed">
              The <code className="rounded bg-muted px-1.5 py-0.5">aud</code>{" "}
              condition pins the token to your team. The{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">sub</code>{" "}
              condition pins it to one project, across its environments. A token
              from another team, or from another of your projects, is refused by
              AWS. If you don't want preview deploys sending real mail, change{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                environment:*
              </code>{" "}
              to{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                environment:production
              </code>
              .
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              The SDK needs one environment variable. Set{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                AWS_ROLE_ARN
              </code>{" "}
              on Vercel and it trades the deployment's OIDC token for temporary
              credentials when it sends:
            </p>

            <CodeBlock
              code="npm install @wraps.dev/email @vercel/oidc-aws-credentials-provider"
              title="terminal"
            />

            <CodeBlock
              code={`import { WrapsEmail } from "@wraps.dev/email";

// AWS_ROLE_ARN=arn:aws:iam::123456789012:role/wraps-email-role
const email = new WrapsEmail();

await email.send({
  from: "hello@acme.com",
  to: "user@example.com",
  subject: "Welcome",
  html: "<p>Glad you're here.</p>",
});`}
              lang="typescript"
              title="send.ts"
            />

            <p className="mt-4 mb-4 text-foreground/80 text-lg leading-relaxed">
              That send goes from your function to SES in your account. Wraps
              isn't in the request, so there's no Wraps credential involved.
            </p>

            <p className="text-foreground/80 text-lg leading-relaxed">
              Off Vercel, the SDK reads{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                AWS_WEB_IDENTITY_TOKEN_FILE
              </code>
              , so EKS and GitHub Actions work the same way with a role you
              trust yourself. On Lambda, ECS, and EC2, the CLI's role trusts the
              AWS service and the runtime hands out temporary credentials.
            </p>
          </section>

          {/* Static keys */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">
              Where a static key still exists
            </h2>

            <p className="mb-6 text-foreground/80 text-lg leading-relaxed">
              Four places. The first three come from a protocol or a host that
              can't do token exchange, and in each one the key is minted in your
              account and shown to you once. The fourth is ours.
            </p>

            <div className="space-y-4">
              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">SMTP</h3>
                <p className="text-foreground/80 leading-relaxed">
                  An SES SMTP password is derived from an IAM access key. SMTP
                  has no token exchange, so if you turn it on, the CLI creates
                  an IAM user that can only call{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    ses:SendRawEmail
                  </code>{" "}
                  and prints the password once.
                </p>
              </div>

              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">Hosts without OIDC</h3>
                <p className="text-foreground/80 leading-relaxed">
                  On hosts the CLI has no OIDC path for, such as Railway, the
                  role trusts your own AWS account. You give an IAM user
                  permission to assume it, and that user's key goes in your
                  host's environment. The key lives in your account and your
                  host, not with us.
                </p>
              </div>

              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">Agent credentials</h3>
                <p className="text-foreground/80 leading-relaxed">
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    wraps email agent create
                  </code>{" "}
                  mints an IAM user and key per agent. The key can only invoke
                  that agent's own enforcer, so a leaked one acts as that one
                  agent and nothing else. Wraps receives the user ARN, not the
                  key.
                </p>
              </div>

              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">Your Wraps API key</h3>
                <p className="text-foreground/80 leading-relaxed">
                  The Wraps API takes a{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">wraps_</code>{" "}
                  API key, which is a long-lived bearer token. A leaked one can
                  do whatever the Wraps API does through your role, sending
                  included, so treat it like any production secret. We store a
                  SHA-256 hash of it, not the key, and you can delete it from
                  the dashboard at any time.
                </p>
              </div>
            </div>
          </section>

          {/* What to do */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">
              If you send through SES today
            </h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Search your environment for{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                AWS_ACCESS_KEY_ID
              </code>
              . If the app runs on Vercel, the trust policy above replaces it,
              with or without Wraps. Create the OIDC provider and the role, then
              hand the plain AWS SDK Vercel's credentials provider. The default
              credential chain won't find the token on its own.{" "}
              <a
                className="text-primary hover:underline"
                href="https://vercel.com/docs/oidc/aws"
                rel="noopener noreferrer"
                target="_blank"
              >
                Vercel's OIDC guide
              </a>{" "}
              covers the IAM side by hand.
            </p>

            <CodeBlock
              code={`import { SESv2Client } from "@aws-sdk/client-sesv2";
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";

const ses = new SESv2Client({
  region: "us-east-1",
  credentials: awsCredentialsProvider({
    roleArn: process.env.AWS_ROLE_ARN!,
  }),
});`}
              lang="typescript"
              title="ses.ts"
            />

            <p className="mt-4 mb-4 text-foreground/80 text-lg leading-relaxed">
              Deploy, and confirm a send works on the role before you touch the
              old key.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              If you'd rather not write the IAM yourself,{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                npx @wraps.dev/cli email init
              </code>{" "}
              does it in your account. The CLI is free and open source.
            </p>

            <p className="text-foreground/80 text-lg leading-relaxed">
              Then delete the key.
            </p>
          </section>

          {/* Continue learning */}
          <section className="space-y-4">
            <h2 className="font-bold text-2xl">Continue reading</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <a
                className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
                href="/docs/guides/vercel-setup"
              >
                <h3 className="font-semibold group-hover:text-primary">
                  Vercel Setup Guide
                </h3>
                <p className="text-muted-foreground text-sm">
                  OIDC from your Vercel project to SES, step by step
                </p>
              </a>
              <a
                className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
                href="/blog/nextjs-vercel-ses-guide"
              >
                <h3 className="font-semibold group-hover:text-primary">
                  Next.js on Vercel with SES
                </h3>
                <p className="text-muted-foreground text-sm">
                  Sending from API routes and Server Actions
                </p>
              </a>
              <a
                className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
                href="/blog/agent-mailboxes"
              >
                <h3 className="font-semibold group-hover:text-primary">
                  Agent Mailboxes
                </h3>
                <p className="text-muted-foreground text-sm">
                  How per-agent credentials are scoped
                </p>
              </a>
              <a
                className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
                href="https://vercel.com/blog/death-to-long-lived-static-credentials"
                rel="noopener noreferrer"
                target="_blank"
              >
                <h3 className="font-semibold group-hover:text-primary">
                  Death to Long-Lived Static Credentials
                </h3>
                <p className="text-muted-foreground text-sm">
                  Vercel's case for OIDC across the industry
                </p>
              </a>
            </div>
          </section>

          {/* CTA */}
          <section className="relative">
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-brand/10 to-warning/10 blur-xl" />
            <Card className="relative p-8 text-center md:p-12">
              <h2 className="mb-4 font-bold text-3xl md:text-4xl">
                Nothing stored
              </h2>
              <p className="mx-auto mb-8 max-w-lg text-muted-foreground">
                An IAM role you can revoke from your side. The CLI creates it in
                your AWS account, with OIDC if you're on Vercel.
              </p>
              <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                <div className="rounded-xl border bg-muted/30 px-6 py-3 font-mono text-brand">
                  npx @wraps.dev/cli email init
                </div>
                <a
                  className="flex items-center gap-2 rounded-xl bg-brand px-6 py-3 font-semibold text-white transition-colors hover:bg-brand"
                  href="/docs/guides/vercel-setup"
                >
                  Read the Guide
                  <ChevronRight size={18} />
                </a>
              </div>
            </Card>
          </section>
        </main>

        <LandingFooter />
      </div>
    </>
  );
}
