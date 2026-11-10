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
  AlertTriangle,
  ArrowRight,
  Info,
  RefreshCw,
  Shield,
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

// ── CLI Commands ──────────────────────────────────────────────────────

const initSingleDomainCommand =
  "npx @wraps.dev/cli email reply init --domain support.foo.com";
const initAllCommand = "npx @wraps.dev/cli email reply init --all";
const rotateCommand =
  "npx @wraps.dev/cli email reply rotate --domain support.foo.com";
const statusCommand = "npx @wraps.dev/cli email reply status";
const decodeCommand =
  "npx @wraps.dev/cli email reply decode <token>@r.mail.support.foo.com";
const inboundAddCommand =
  "npx @wraps.dev/cli email inbound add support.foo.com";

// ── Code Snippets ─────────────────────────────────────────────────────

const sdkSigningCode = `import { WrapsEmail } from "@wraps.dev/email";

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
  conversationId, // opt-in: this turns on signing
});

// Later, any reply to that message arrives with
//   replyToken: { conversationId, sendId, status: "valid" }`;

const eventShapeCode = `{
  "emailId": "inb_abc123",
  "replyToken": {
    "conversationId": "aGVsbG8gd29y",
    "sendId": "MDEyMzQ1Njc",
    "status": "valid"
  },
  "autoReply": false
}`;

const filterPatternCode = `if (event.detail.replyToken?.status === "valid") {
  // safe to trust conversationId for threading
  await threadIntoConversation(event.detail.replyToken.conversationId);
}`;

const autoReplyCode = `if (event.detail.autoReply) {
  // vacation responder, bulk mailer, or other auto-reply
  // skip triggering any response to avoid loops
  return;
}`;

const longerTtlCode = `// Default: 90-day TTL on every signed reply-to address
await email.send({ from, to, subject, html, conversationId });

// Opt-in: custom TTL (in seconds)
await email.send({
  from,
  to,
  subject,
  html,
  conversationId,
  replyTtlSeconds: 60 * 60 * 24 * 365, // 1 year
});

// Opt-in: never expires (use with caution)
await email.send({
  from,
  to,
  subject,
  html,
  conversationId,
  replyTtlSeconds: 0,
});`;

const replayDefenseCode = `// Application-layer replay defense (optional, not provided by Wraps)
import {
  DynamoDBClient,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";

const ddb = new DynamoDBClient({});

async function handleReply(event) {
  const { replyToken } = event.detail;
  if (replyToken?.status !== "valid") return;

  // Reject if we've already processed this sendId
  try {
    await ddb.send(
      new PutItemCommand({
        TableName: "reply-sendids",
        Item: {
          sendId: { S: replyToken.sendId },
          ttl: { N: String(Math.floor(Date.now() / 1000) + 90 * 86_400) },
        },
        ConditionExpression: "attribute_not_exists(sendId)",
      })
    );
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      // replayed sendId — drop
      return;
    }
    throw err;
  }

  await threadIntoConversation(replyToken.conversationId);
}`;

// ── Reusable Code Block ───────────────────────────────────────────────

function CodeExample({
  language,
  filename,
  code,
}: {
  language: string;
  filename: string;
  code: string;
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

export default function ReplyThreadingPageContent() {
  return (
    <DocsLayout>
      {/* Page Header */}
      <div className="mb-12">
        <Badge className="mb-4" variant="outline">
          Guide
        </Badge>
        <h1 className="mb-4 font-bold text-4xl tracking-tight">
          Reply Threading
        </h1>
        <p className="text-lg text-muted-foreground">
          HMAC-signed reply-to addresses give you a verified{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">conversationId</code>{" "}
          on inbound email events when a recipient replies to a message you
          sent. The token is embedded in the reply-to address and signed with a
          per-domain secret that lives in your AWS account.
        </p>
      </div>

      {/* Overview */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Overview</h2>
        <p className="mb-4 text-muted-foreground">
          When you enable reply threading on a sending domain (e.g.{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            support.foo.com
          </code>
          ), every outbound message can opt in to a signed reply-to address of
          the form{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            {"<token>@r.mail.support.foo.com"}
          </code>
          . When the recipient hits reply, their client addresses that token.
          Wraps' inbound Lambda verifies the HMAC and surfaces a{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">replyToken</code>{" "}
          object on the{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">email.received</code>{" "}
          event so you can thread replies into the right conversation without a
          database lookup.
        </p>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <Zap className="h-8 w-8 shrink-0 text-primary" />
              <div>
                <h3 className="font-medium">Flow</h3>
                <p className="mt-2 font-mono text-muted-foreground text-sm">
                  send &rarr; signed reply-to &rarr; recipient replies &rarr;
                  inbound Lambda verifies &rarr; event with{" "}
                  <code className="rounded bg-muted px-1 py-0.5">
                    replyToken
                  </code>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Trust Model */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Shield className="h-6 w-6 text-primary" />
          Trust Model
        </h2>
        <div className="rounded-lg border-destructive border-l-4 bg-destructive/10 p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div>
              <p className="font-medium text-sm">
                Verified token &ne; verified sender
              </p>
              <p className="mt-2 text-muted-foreground text-sm">
                <code className="rounded bg-muted px-1.5 py-0.5">
                  replyToken.status === "valid"
                </code>{" "}
                means the token verified cryptographically &mdash; someone
                replied to a message you previously sent from this domain. It{" "}
                <strong>does not</strong> prove who the sender is. Anyone with a
                copy of the reply-to address can send a message to it. Combine
                with DKIM and SPF to authenticate the sender before trusting
                reply content.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Enable Per Domain */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Enable Per Domain</h2>
        <p className="mb-4 text-muted-foreground">
          Reply threading is enabled per sending domain. Inbound receiving must
          already be set up for the same domain first.
        </p>

        <h3 className="mb-2 font-medium text-lg">One domain</h3>
        <div className="mb-4">
          <CodeExample
            code={initSingleDomainCommand}
            filename="terminal.sh"
            language="bash"
          />
        </div>
        <p className="mb-4 text-muted-foreground text-sm">
          If inbound is not yet enabled for{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            support.foo.com
          </code>
          , run{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            wraps email inbound add support.foo.com
          </code>{" "}
          first.
        </p>
        <div className="mb-6">
          <CodeExample
            code={inboundAddCommand}
            filename="terminal.sh"
            language="bash"
          />
        </div>

        <h3 className="mb-2 font-medium text-lg">Every inbound domain</h3>
        <p className="mb-4 text-muted-foreground">
          Enable reply threading on every currently-enabled inbound domain in
          one command:
        </p>
        <div className="mb-4">
          <CodeExample
            code={initAllCommand}
            filename="terminal.sh"
            language="bash"
          />
        </div>
        <p className="mb-4 text-muted-foreground text-sm">
          If the catch-all receipt rule is missing,{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">reply init</code>{" "}
          recreates it and activates{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            wraps-inbound-rules
          </code>
          . SES allows one active receipt rule set per region, so when another
          set is active (or the active set can&apos;t be read) it asks first,
          before saving or deploying anything. With{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">--yes</code>,{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">--json</code> or no
          terminal it refuses unless you pass{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            --replace-active-rule-set
          </code>
          . Pass it only after the AWS account owner agrees: the other
          set&apos;s rules stop applying to incoming mail.
        </p>

        <div className="rounded-lg border-primary border-l-4 bg-primary/10 p-4">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="font-medium text-sm">What gets deployed</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground text-sm">
                <li>
                  A SecureString SSM parameter at{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    /wraps/email/reply-secret/{"{domain}"}
                  </code>{" "}
                  holding a 32-byte HMAC secret
                </li>
                <li>
                  An SES receipt-rule recipient for{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    r.mail.{"{domain}"}
                  </code>
                </li>
                <li>
                  MX and SPF records for{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    r.mail.{"{domain}"}
                  </code>
                </li>
                <li>
                  An IAM policy statement on the inbound Lambda scoping{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    ssm:GetParameter
                  </code>{" "}
                  to the prefix only
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Signing From the SDK */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Signing From the SDK</h2>
        <p className="mb-4 text-muted-foreground">
          Once reply threading is enabled for a domain, opt in per-send by
          passing a{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">conversationId</code>
          . The SDK pulls the signing secret from SSM, generates the signed
          reply-to address, and sets{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            ReplyToAddresses
          </code>{" "}
          for you.
        </p>
        <CodeExample
          code={sdkSigningCode}
          filename="send.ts"
          language="typescript"
        />
        <p className="mt-4 text-muted-foreground text-sm">
          Generate a new{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">conversationId</code>{" "}
          at the start of each conversation and reuse it on every outbound
          message in that thread. The SDK derives the sending domain from{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">params.from</code>,
          so one{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">WrapsEmail</code>{" "}
          instance handles any number of enabled domains.
        </p>
      </section>

      {/* Event Shape */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Event Shape</h2>
        <p className="mb-4 text-muted-foreground">
          Inbound replies arrive on the standard{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">email.received</code>{" "}
          EventBridge event with two new fields:
        </p>
        <CodeExample
          code={eventShapeCode}
          filename="event.detail.json"
          language="json"
        />
      </section>

      {/* Status Values */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Status Values</h2>
        <p className="mb-4 text-muted-foreground">
          <code className="rounded bg-muted px-1.5 py-0.5">
            replyToken.status
          </code>{" "}
          is a discriminated union. Pattern-match on it explicitly &mdash; do
          not treat "present" as "trusted".
        </p>
        <Card>
          <CardContent className="p-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-2 text-left">Status</th>
                  <th className="pb-2 text-left">Meaning</th>
                  <th className="pb-2 text-left">Recommended Action</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b">
                  <td className="py-2 font-medium text-foreground">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      "valid"
                    </code>
                  </td>
                  <td className="py-2">
                    HMAC verified, token within TTL, kid known.
                  </td>
                  <td className="py-2">
                    Use{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      replyToken.conversationId
                    </code>{" "}
                    to thread.
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 font-medium text-foreground">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      "invalid-signature"
                    </code>
                  </td>
                  <td className="py-2">
                    Token present but HMAC does not verify against current or
                    previous kid.
                  </td>
                  <td className="py-2">
                    Drop. Likely spoofed, corrupted in transit, or the SDK
                    cached a secret from before a rotation it hasn't seen yet.
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 font-medium text-foreground">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      "expired"
                    </code>
                  </td>
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">exp</code>{" "}
                    is in the past.
                  </td>
                  <td className="py-2">
                    Drop, or send a "conversation expired, please start a new
                    one" auto-reply.
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 font-medium text-foreground">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      "unsupported-version"
                    </code>
                  </td>
                  <td className="py-2">
                    Lambda saw a token version byte it does not recognize
                    (future-proofing).
                  </td>
                  <td className="py-2">
                    Drop. Consider upgrading the CLI + Lambda.
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 font-medium text-foreground">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      "malformed"
                    </code>
                  </td>
                  <td className="py-2">
                    Local-part looked like a reply address but was not
                    decodable.
                  </td>
                  <td className="py-2">Drop. Not a threading reply.</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 font-medium text-foreground">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      "unknown-domain"
                    </code>
                  </td>
                  <td className="py-2">
                    Recipient domain is not enabled for reply threading (likely
                    misrouted).
                  </td>
                  <td className="py-2">
                    Drop. Check{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      wraps email reply status
                    </code>
                    .
                  </td>
                </tr>
                <tr>
                  <td className="py-2 font-medium text-foreground">
                    <code className="rounded bg-muted px-1.5 py-0.5">null</code>{" "}
                    (the field)
                  </td>
                  <td className="py-2">
                    Recipient wasn't under{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      r.mail.*
                    </code>
                    . Not a threading reply at all.
                  </td>
                  <td className="py-2">Handle as a regular inbound email.</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      {/* Filter Pattern */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Filter Pattern</h2>
        <p className="mb-4 text-muted-foreground">
          The single check you almost always want:
        </p>
        <CodeExample
          code={filterPatternCode}
          filename="handler.ts"
          language="typescript"
        />
        <p className="mt-4 text-muted-foreground text-sm">
          Any other value &mdash; including a non-null{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">replyToken</code>{" "}
          with a non-valid status &mdash; should be treated as an unverified
          reply and fall back to whatever logic you use for plain inbound mail.
        </p>
      </section>

      {/* Auto-Reply Detection */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Auto-Reply Detection</h2>
        <p className="mb-4 text-muted-foreground">
          Every inbound event includes an{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">autoReply</code>{" "}
          boolean. Lambda flags it{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">true</code> when the
          message looks like a vacation responder or bulk mailer &mdash;
          specifically, if any of these headers are present:
        </p>
        <ul className="mb-4 list-disc space-y-1 pl-6 text-muted-foreground">
          <li>
            <code className="rounded bg-muted px-1.5 py-0.5">
              Auto-Submitted: auto-replied
            </code>
          </li>
          <li>
            <code className="rounded bg-muted px-1.5 py-0.5">
              Precedence: bulk
            </code>
          </li>
          <li>
            <code className="rounded bg-muted px-1.5 py-0.5">X-Autoreply</code>
          </li>
        </ul>
        <p className="mb-4 text-muted-foreground">
          Use this to avoid response loops:
        </p>
        <CodeExample
          code={autoReplyCode}
          filename="handler.ts"
          language="typescript"
        />
      </section>

      {/* Rotation */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <RefreshCw className="h-6 w-6 text-primary" />
          Rotation
        </h2>
        <p className="mb-4 text-muted-foreground">
          Rotate the signing secret for a domain at any time:
        </p>
        <CodeExample
          code={rotateCommand}
          filename="terminal.sh"
          language="bash"
        />
        <div className="mt-4 rounded-lg border-primary border-l-4 bg-primary/10 p-4">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="font-medium text-sm">5-minute grace window</p>
              <p className="mt-2 text-muted-foreground text-sm">
                Both the inbound Lambda and the SDK cache the SSM secret for 5
                minutes. After rotation, tokens signed with the old secret
                continue to verify against{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">
                  previousKid
                </code>{" "}
                until both caches roll over. This means rotation is safe to run
                at any time &mdash; there is no thundering-herd problem and no
                need to coordinate deploys.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Debugging */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Debugging</h2>
        <p className="mb-4 text-muted-foreground">
          Decode a reply-to address locally without touching AWS. Useful when
          support receives a screenshot and needs to identify the conversation:
        </p>
        <CodeExample
          code={decodeCommand}
          filename="terminal.sh"
          language="bash"
        />
        <p className="mt-4 text-muted-foreground text-sm">
          Prints the decoded{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">version</code>,{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">kid</code>,{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">conversationId</code>
          , <code className="rounded bg-muted px-1.5 py-0.5">sendId</code>,{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">exp</code>, HMAC
          (hex), and the sending domain. The HMAC is{" "}
          <strong>not verified</strong> &mdash; decode is a pure format-level
          operation.
        </p>
      </section>

      {/* Status Command */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Status</h2>
        <p className="mb-4 text-muted-foreground">
          Audit every enabled domain in one command. Verifies the SSM parameter
          exists, the{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            r.mail.{"{domain}"}
          </code>{" "}
          recipient is present in the catch-all receipt rule, and the MX record
          resolves.
        </p>
        <CodeExample
          code={statusCommand}
          filename="terminal.sh"
          language="bash"
        />
      </section>

      {/* Longer-Lived Tokens */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Longer-Lived Tokens</h2>
        <p className="mb-4 text-muted-foreground">
          Signed reply-to addresses expire 90 days after they are generated by
          default. Tokens that arrive after their{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">exp</code> return{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            status: "expired"
          </code>
          . Override per-send if your workflow needs a longer window:
        </p>
        <CodeExample
          code={longerTtlCode}
          filename="send.ts"
          language="typescript"
        />
        <div className="mt-4 rounded-lg border-warning border-l-4 bg-warning/10 p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div>
              <p className="font-medium text-sm">
                Infinite TTL is a real infinite
              </p>
              <p className="mt-2 text-muted-foreground text-sm">
                A token issued with{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">
                  replyTtlSeconds: 0
                </code>{" "}
                verifies forever until the signing secret is rotated. Treat
                captured infinite-TTL tokens as permanently-valid until
                rotation.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Security */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Shield className="h-6 w-6 text-primary" />
          Security
        </h2>
        <div className="space-y-4">
          <div className="rounded-lg border p-4">
            <h3 className="mb-1 font-medium">Per-domain secrets</h3>
            <p className="text-muted-foreground text-sm">
              Each sending domain has its own 32-byte HMAC secret. Leaking one
              domain's key does not compromise tokens signed for another domain
              in the same AWS account.
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <h3 className="mb-1 font-medium">Secrets stay in your account</h3>
            <p className="text-muted-foreground text-sm">
              Secrets are stored as{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                SecureString
              </code>{" "}
              parameters in SSM, KMS-encrypted at rest. Wraps never sees them;
              they are read only by the inbound Lambda and the SDK, both running
              in your AWS account under your IAM policies.
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <h3 className="mb-1 font-medium">Atomic, per-domain rotation</h3>
            <p className="text-muted-foreground text-sm">
              Rotation updates the single SSM parameter for that domain in one{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                PutParameter
              </code>{" "}
              call with{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                {"{ currentKid, previousKid }"}
              </code>{" "}
              so both the new and old keys verify during the cache rollover
              window.
            </p>
          </div>
        </div>
      </section>

      {/* Replay Defense */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Replay Defense (Optional)</h2>
        <p className="mb-4 text-muted-foreground">
          Wraps does not provide built-in replay protection. A captured valid
          token can be resent until its{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">exp</code> or the
          secret rotates. If your workflow needs at-most-once semantics, pair{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">sendId</code> with a
          DynamoDB TTL idempotency table in your own application:
        </p>
        <CodeExample
          code={replayDefenseCode}
          filename="handler.ts"
          language="typescript"
        />
        <p className="mt-4 text-muted-foreground text-sm">
          This is application-layer, not Wraps-provided. Dedupe on{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">sendId</code>, not{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">conversationId</code>{" "}
          &mdash; you want many replies per conversation but each specific
          outbound message replied to at most once.
        </p>
      </section>

      {/* Next Steps */}
      <section className="mb-12">
        <h2 className="mb-6 font-bold text-2xl">Next Steps</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">Inbound Email</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Set up inbound email receiving so replies flow into your AWS
                account and trigger{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">
                  email.received
                </code>{" "}
                events.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/quickstart/email/inbound">
                  Inbound Quickstart
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">EventBridge Events</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Full payload reference for{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">
                  email.received
                </code>{" "}
                and every outbound SES event type.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/infrastructure/events">
                  Event Reference
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
