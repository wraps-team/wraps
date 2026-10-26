import { Card } from "@wraps/ui/components/ui/card";
import {
  AlertTriangle,
  ChevronRight,
  Code2,
  KeyRound,
  Shield,
} from "lucide-react";
import type { Metadata } from "next";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { JsonLd } from "@/components/json-ld";
import { CodeBlock } from "./page-content";

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Signed Reply-To for Agents",
  description:
    "Cryptographic conversation correlation for email agents. HMAC-signed reply-to addresses verified in a Lambda running in your AWS account.",
  datePublished: "2026-04-17T00:00:00.000Z",
  dateModified: "2026-04-17T00:00:00.000Z",
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
    "@id": "https://wraps.dev/blog/signed-reply-threading",
  },
};

export const metadata: Metadata = {
  title: "Signed Reply-To for Agents",
  description:
    "Cryptographic conversation correlation for email agents. HMAC-signed reply-to addresses verified in a Lambda running in your AWS account.",
  openGraph: {
    title: "Signed Reply-To for Agents | Wraps",
    description:
      "Cryptographic conversation correlation for email agents built on Wraps.",
    type: "article",
    url: "https://wraps.dev/blog/signed-reply-threading",
    publishedTime: "2026-04-17T00:00:00.000Z",
    authors: ["Wraps Team"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Signed Reply-To for Agents | Wraps",
    description:
      "Cryptographic conversation correlation for email agents built on Wraps.",
  },
  alternates: {
    canonical: "https://wraps.dev/blog/signed-reply-threading",
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
              <KeyRound size={16} />
              <span>Engineering</span>
              <span className="text-muted-foreground/50">&bull;</span>
              <span className="text-muted-foreground">6 min read</span>
              <span className="text-muted-foreground/50">&bull;</span>
              <span className="text-muted-foreground">Wraps Team</span>
              <span className="text-muted-foreground/50">&bull;</span>
              <span className="text-muted-foreground">April 17, 2026</span>
            </div>

            <h1 className="mb-6 font-bold text-4xl leading-tight md:text-5xl lg:text-6xl">
              Signed Reply-To
              <span className="block bg-gradient-to-r from-brand to-warning bg-clip-text text-transparent dark:to-warning">
                for Agents
              </span>
            </h1>

            <p className="max-w-2xl text-muted-foreground text-xl leading-relaxed">
              Cryptographic conversation correlation for email agents. Ship in{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-base">
                @wraps.dev/cli@2.19.0
              </code>
              .
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <div className="flex items-center gap-2 rounded-full border bg-muted/30 px-4 py-2">
                <Shield className="text-brand" size={16} />
                <span className="text-foreground/80 text-sm">
                  HMAC-signed reply-to
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-full border bg-muted/30 px-4 py-2">
                <KeyRound className="text-brand" size={16} />
                <span className="text-foreground/80 text-sm">
                  Per-domain secret in SSM
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-full border bg-muted/30 px-4 py-2">
                <Code2 className="text-brand" size={16} />
                <span className="text-foreground/80 text-sm">
                  Wraps never sees the key
                </span>
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-4xl space-y-16 px-6 py-16">
          {/* Problem */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">
              The threading problem for agents
            </h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              If you're building an email agent, you need to answer one question
              on every inbound message: which conversation does this reply
              belong to?
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              The standard answers are all fragile. Threading headers like{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">Message-ID</code>{" "}
              and{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                In-Reply-To
              </code>{" "}
              get rewritten, stripped, or lost by downstream mail servers and
              clients. Subject-line tokens (
              <code className="rounded bg-muted px-1.5 py-0.5">[#12345]</code>)
              are readable to humans and therefore readable to attackers &mdash;
              anyone who sees one can forge a reply that looks like it belongs
              to that conversation. Plus-addressing (
              <code className="rounded bg-muted px-1.5 py-0.5">
                agent+12345@example.com
              </code>
              ) has the same problem with none of the cryptography.
            </p>

            <p className="text-foreground/80 text-lg leading-relaxed">
              For a human support inbox this is annoying. For an agent that
              takes actions based on reply content, it's a poisoning vector.
            </p>
          </section>

          {/* Mechanism */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">The mechanism</h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Wraps now ships signed reply-to addresses. When you send from a
              domain with reply threading enabled, each message can opt in to a
              Reply-To of the form:
            </p>

            <CodeBlock
              code="<base64url-token>@r.mail.support.foo.com"
              title="reply-to format"
            />

            <p className="mt-4 mb-4 text-foreground/80 text-lg leading-relaxed">
              The token encodes a version byte, key ID,{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                conversationId
              </code>
              , <code className="rounded bg-muted px-1.5 py-0.5">sendId</code>,
              expiration, and an HMAC computed with a per-domain 32-byte secret.
              The secret is stored as a SecureString in SSM at{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                /wraps/email/reply-secret/{"{domain}"}
              </code>{" "}
              in your AWS account, KMS-encrypted at rest.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              When a recipient replies, the message hits your inbound SES
              receipt rule for{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                r.mail.{"{domain}"}
              </code>
              . The inbound Lambda verifies the HMAC, checks expiration, and
              attaches a{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">replyToken</code>{" "}
              object to the existing{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                email.received
              </code>{" "}
              EventBridge event. Your handler reads the verified{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                conversationId
              </code>{" "}
              directly from the event and threads the reply without a database
              round-trip.
            </p>

            <Card className="p-6">
              <p className="text-foreground/80 leading-relaxed">
                The signing secret lives in your AWS. Wraps doesn't have it and
                can't sign or verify tokens for you. The SDK reads the secret
                from SSM at send-time; the inbound Lambda reads it at
                verify-time. Both run under your IAM policies.
              </p>
            </Card>
          </section>

          {/* Using it */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">Using it</h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Enable it for one domain, or for every inbound-enabled domain at
              once:
            </p>

            <CodeBlock
              code={`# one domain
npx @wraps.dev/cli email reply init --domain support.foo.com

# every currently-enabled inbound domain
npx @wraps.dev/cli email reply init --all`}
              title="terminal"
            />

            <p className="mt-4 mb-4 text-foreground/80 text-lg leading-relaxed">
              On the send side, pass{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                conversationId
              </code>{" "}
              to opt in. The SDK derives the sending domain from{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                params.from
              </code>
              , fetches the secret, and sets{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                ReplyToAddresses
              </code>{" "}
              for you:
            </p>

            <CodeBlock
              code={`import { WrapsEmail } from "@wraps.dev/email";

const email = new WrapsEmail({
  region: "us-east-1",
  replyThreading: {}, // auto-reads /wraps/email/reply-secret/{domain}
});

const conversationId = email.replyThreading.newConversation();

await email.send({
  from: "agent@support.foo.com",
  to: "user@example.com",
  subject: "Your ticket",
  html: "<p>...</p>",
  conversationId, // opt-in: turns on signing
});`}
              lang="typescript"
              title="send.ts"
            />

            <p className="mt-4 mb-4 text-foreground/80 text-lg leading-relaxed">
              When the reply arrives, your EventBridge handler gets a verified
              token on the event detail:
            </p>

            <CodeBlock
              code={`{
  "emailId": "inb_abc123",
  "replyToken": {
    "conversationId": "aGVsbG8gd29y",
    "sendId": "MDEyMzQ1Njc",
    "status": "valid"
  },
  "autoReply": false
}`}
              lang="json"
              title="event.detail.json"
            />

            <p className="mt-4 mb-4 text-foreground/80 text-lg leading-relaxed">
              The filter you almost always want:
            </p>

            <CodeBlock
              code={`if (event.detail.replyToken?.status === "valid") {
  // safe to thread on conversationId
  await threadIntoConversation(event.detail.replyToken.conversationId);
}

if (event.detail.autoReply) {
  // vacation responder or bulk mailer — don't respond
  return;
}`}
              lang="typescript"
              title="handler.ts"
            />

            <p className="mt-4 text-foreground/80 text-lg leading-relaxed">
              <code className="rounded bg-muted px-1.5 py-0.5">
                replyToken.status
              </code>{" "}
              is a discriminated union &mdash; treat anything other than{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">"valid"</code>{" "}
              (including{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">"expired"</code>,{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                "invalid-signature"
              </code>
              , and{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                "malformed"
              </code>
              ) as unverified. The full status table is in the guide.
            </p>
          </section>

          {/* Trust model */}
          <section>
            <h2 className="mb-6 flex items-center gap-3 font-bold text-3xl">
              <Shield className="text-brand" />
              What a valid token actually proves
            </h2>

            <div className="rounded-lg border-destructive border-l-4 bg-destructive/10 p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium">
                    Verified token &ne; verified sender.
                  </p>
                  <p className="mt-2 text-foreground/80 leading-relaxed">
                    A{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      status: "valid"
                    </code>{" "}
                    token means someone replied to an address your domain
                    previously generated. It does not prove who the sender is or
                    that the reply came from the original recipient. Anyone with
                    a copy of that Reply-To address can send mail to it.
                  </p>
                  <p className="mt-2 text-foreground/80 leading-relaxed">
                    If your agent takes consequential actions on reply content,
                    combine{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      replyToken
                    </code>{" "}
                    with DKIM and SPF checks on the sender before trusting
                    anything in the body.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Not in v1 */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">What's not in v1</h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Being explicit about the surface area:
            </p>

            <div className="space-y-4">
              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">
                  Replay defense is application-layer
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  A captured valid token can be resent until it expires or the
                  secret rotates. Wraps gives you a stable{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">sendId</code>{" "}
                  on every verified event. If you need at-most-once semantics,
                  dedupe on{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">sendId</code>{" "}
                  in a DynamoDB table with a TTL. The guide has a drop-in
                  pattern.
                </p>
              </div>

              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">No recipient binding</h3>
                <p className="text-foreground/80 leading-relaxed">
                  The token doesn't bind to the original{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">To:</code>{" "}
                  address. If a recipient forwards your email, the forwarding
                  party can reply to the token and it will verify. This is
                  intentional (forwarded threads still work) but it's a tradeoff
                  worth knowing about.
                </p>
              </div>

              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">
                  90-day default TTL, configurable per send
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  Tokens expire 90 days after they're generated. Override per
                  send with{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    replyTtlSeconds
                  </code>
                  . You can set{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    replyTtlSeconds: 0
                  </code>{" "}
                  for no expiration &mdash; which verifies forever until the
                  secret rotates. That's a real forever. Use it carefully.
                </p>
              </div>

              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">
                  Rotation supports one previous key
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    wraps email reply rotate
                  </code>{" "}
                  stores both the new and previous key IDs. Both the inbound
                  Lambda and the SDK cache the secret for 5 minutes, and tokens
                  signed with the old secret keep verifying during the
                  cache-rollover window. Rotate as often as you want; there's no
                  thundering-herd and no deploy coordination. But there is only
                  one grace-window kid. A second rotation inside that window
                  will drop still-in-flight tokens signed with the oldest
                  secret.
                </p>
              </div>
            </div>
          </section>

          {/* Try it */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">Try it</h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Reply threading requires inbound email to be configured on the
              same domain first. If it isn't, the init command tells you to run{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                wraps email inbound add
              </code>{" "}
              first.
            </p>

            <CodeBlock
              code={`# upgrade the CLI
npm i -g @wraps.dev/cli@latest

# enable reply threading on an inbound-enabled domain
npx @wraps.dev/cli email reply init --domain support.foo.com

# verify what's deployed
npx @wraps.dev/cli email reply status`}
              title="terminal"
            />
          </section>

          {/* Continue learning */}
          <section className="space-y-4">
            <h2 className="font-bold text-2xl">Continue reading</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <a
                className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
                href="/docs/guides/reply-threading"
              >
                <h3 className="font-semibold group-hover:text-primary">
                  Reply Threading Guide
                </h3>
                <p className="text-muted-foreground text-sm">
                  Full reference: status values, rotation, replay defense
                </p>
              </a>
              <a
                className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
                href="/docs/infrastructure/events"
              >
                <h3 className="font-semibold group-hover:text-primary">
                  Event Reference
                </h3>
                <p className="text-muted-foreground text-sm">
                  The <code>email.received</code> payload with{" "}
                  <code>replyToken</code> and <code>autoReply</code>
                </p>
              </a>
              <a
                className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
                href="/docs/quickstart/email/inbound"
              >
                <h3 className="font-semibold group-hover:text-primary">
                  Inbound Quickstart
                </h3>
                <p className="text-muted-foreground text-sm">
                  Prerequisite: set up inbound email on your domain
                </p>
              </a>
              <a
                className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
                href="/blog/inbound-email-guide"
              >
                <h3 className="font-semibold group-hover:text-primary">
                  Receive Emails in Your AWS Account
                </h3>
                <p className="text-muted-foreground text-sm">
                  How inbound email works end-to-end on Wraps
                </p>
              </a>
            </div>
          </section>

          {/* CTA */}
          <section className="relative">
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-brand/10 to-warning/10 blur-xl" />
            <Card className="relative p-8 text-center md:p-12">
              <h2 className="mb-4 font-bold text-3xl md:text-4xl">
                Signed threading, one command
              </h2>
              <p className="mx-auto mb-8 max-w-lg text-muted-foreground">
                The signing secret lives in your AWS account. Wraps never sees
                it. Your agent gets a verified <code>conversationId</code> on
                every reply.
              </p>
              <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                <div className="rounded-xl border bg-muted/30 px-6 py-3 font-mono text-brand">
                  npx @wraps.dev/cli email reply init --all
                </div>
                <a
                  className="flex items-center gap-2 rounded-xl bg-brand px-6 py-3 font-semibold text-white transition-colors hover:bg-brand"
                  href="/docs/guides/reply-threading"
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
