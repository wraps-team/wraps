import { Card } from "@wraps/ui/components/ui/card";
import {
  AlertTriangle,
  Bot,
  ChevronRight,
  KeyRound,
  Server,
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
  headline: "Agent Mailboxes: A Leash the Agent Can't Reach",
  description:
    "An email identity for an AI agent, constrained by a Lambda in your own AWS account. Identity comes from the alias qualifier, not the payload — so a leaked credential can only ever act as its own agent.",
  datePublished: "2026-07-10T00:00:00.000Z",
  dateModified: "2026-07-10T00:00:00.000Z",
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
    "@id": "https://wraps.dev/blog/agent-mailboxes",
  },
};

export const metadata: Metadata = {
  title: "Agent Mailboxes: A Leash the Agent Can't Reach",
  description:
    "An email identity for an AI agent, constrained by a Lambda in your own AWS account. Kill switch, sender pin, allowlist, and caps decided where the agent's credential can't reach them.",
  openGraph: {
    title: "Agent Mailboxes: A Leash the Agent Can't Reach | Wraps",
    description:
      "Agent identity from the Lambda alias qualifier, an IAM policy with one statement, and an approval queue. Enforced in your AWS account.",
    type: "article",
    url: "https://wraps.dev/blog/agent-mailboxes",
    publishedTime: "2026-07-10T00:00:00.000Z",
    authors: ["Wraps Team"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Agent Mailboxes: A Leash the Agent Can't Reach | Wraps",
    description:
      "Agent identity from the Lambda alias qualifier, an IAM policy with one statement, and an approval queue. Enforced in your AWS account.",
  },
  alternates: {
    canonical: "https://wraps.dev/blog/agent-mailboxes",
  },
};

function ChainStep({
  children,
  step,
  title,
  verdict,
}: {
  children: React.ReactNode;
  step: string;
  title: string;
  verdict: string;
}) {
  return (
    <li className="rounded-lg border p-5">
      <div className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-muted/50 font-mono font-semibold text-brand-text text-sm"
        >
          {step}
        </span>
        <div>
          <h3 className="mb-1 font-medium">{title}</h3>
          <p className="text-foreground/80 leading-relaxed">{children}</p>
          <p className="mt-2 font-mono text-muted-foreground text-sm">
            {verdict}
          </p>
        </div>
      </div>
    </li>
  );
}

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
            <div className="mb-4 flex items-center gap-2 font-medium text-brand-text text-sm">
              <Bot size={16} />
              <span>Product</span>
              <span className="text-muted-foreground">&bull;</span>
              <span className="text-muted-foreground">14 min read</span>
              <span className="text-muted-foreground">&bull;</span>
              <span className="text-muted-foreground">Wraps Team</span>
              <span className="text-muted-foreground">&bull;</span>
              <span className="text-muted-foreground">July 10, 2026</span>
            </div>

            <h1 className="mb-6 font-bold text-4xl leading-tight md:text-5xl lg:text-6xl">
              Agent Mailboxes
              <span className="block bg-gradient-to-r from-brand to-warning bg-clip-text text-transparent dark:to-warning">
                A leash the agent can't reach
              </span>
            </h1>

            <p className="max-w-2xl text-muted-foreground text-xl leading-relaxed">
              An email identity for an AI agent, and a set of constraints it
              cannot argue with, because they run in a Lambda in your AWS
              account. Shipped in{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-base">
                @wraps.dev/cli@2.26.0
              </code>{" "}
              and{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-base">
                @wraps.dev/mcp@0.3.0
              </code>
              .
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <div className="flex items-center gap-2 rounded-full border bg-muted/30 px-4 py-2">
                <KeyRound className="text-brand-text" size={16} />
                <span className="text-foreground/80 text-sm">
                  Identity from the alias qualifier
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-full border bg-muted/30 px-4 py-2">
                <Shield className="text-brand-text" size={16} />
                <span className="text-foreground/80 text-sm">
                  One IAM statement, one Lambda
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-full border bg-muted/30 px-4 py-2">
                <Server className="text-brand-text" size={16} />
                <span className="text-foreground/80 text-sm">
                  Enforced in your AWS account
                </span>
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-4xl space-y-16 px-6 py-16">
          {/* Problem */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">
              Sending email is not a reversible tool call
            </h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Most of what an agent does can be undone. A bad file write gets
              reverted. A bad query gets re-run. A bad call against a staging
              environment gets forgotten by Monday. Email is not on that list.
              Once SES accepts a message it is gone &mdash; delivered, sitting
              in somebody else's mail store, and counted against your domain's
              reputation whether or not you meant to send it.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              So the question for anyone wiring an email tool into an agent is
              not whether the model will usually get it right. It is what
              happens the one time it doesn't.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              The failure people picture is a hallucination. The more
              interesting one is prompt injection. Your agent reads a support
              ticket, a scraped page, a PDF someone attached &mdash; and the
              contents of that document become part of what it decides to do
              next. If the agent is holding a credential that can send mail to
              anyone, at any volume, as any verified identity in the account,
              then the authority of that document is the authority of the
              credential. One hallucination or one poisoned document away from
              forty thousand emails at 3am and a burned sending domain.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              The uncomfortable part is that you can't fix this by asking the
              model to restrain itself. A rule in a system prompt lives in the
              same context window the attacker is writing into. A rule in a tool
              description lives there too. A rule in the MCP server's config
              lives on a machine the agent is already driving. Any check that
              runs inside the blast radius is not a check &mdash; it's a
              suggestion with good intentions.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              The available options all fail in a specific way, and it's worth
              naming which. A raw SES key or IAM user is unbounded by
              construction: the ceiling is the account, and there is no
              per-agent anything. An ESP API key is worse for a different reason
              &mdash; you're sending on shared IPs, shared reputation is the
              provider's actual product, and autonomous traffic is a moderation
              problem they will eventually solve by clamping down on you.
              Agent-native mailbox providers give you the address but the same
              rented rails and the same exposure. And model-side guardrails, as
              above, are inside the thing you're trying to bound.
            </p>

            <p className="text-foreground/80 text-lg leading-relaxed">
              What's missing is boring and structural: an agent with its own
              email identity, a credential scoped to that identity, and a policy
              enforced somewhere the agent cannot reach.
            </p>
          </section>

          {/* Where enforcement lives */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">
              Where the constraint has to live
            </h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Wraps puts it in a Lambda in your account, called{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                wraps-agent-enforcer
              </code>
              . The agent does not get SES. It gets permission to invoke that
              one function and nothing else. Every send is a call into code the
              agent's credential cannot modify, running under a role the agent's
              credential cannot assume, reading policy the agent's credential
              cannot write.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              None of the agent infrastructure is deployed by default.{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                wraps email init
              </code>{" "}
              deploys none of it; the first{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                wraps email agent create
              </code>{" "}
              flips a flag in your email config and adds the enforcer, a
              DynamoDB policy table, a per-agent Lambda alias, and a per-agent
              IAM user to the same Pulumi stack you already own.
            </p>

            <Card className="p-6">
              <p className="mb-3 text-foreground/80 leading-relaxed">
                The honest version of that decision: a Wraps-hosted proxy would
                have been faster to build, and it would have been{" "}
                <em>hotfixable</em>. Customer-side enforcement Lambdas are
                upgraded by the customer, one customer at a time. A bug in the
                leash means every customer runs stale enforcement until they run
                the upgrade.
              </p>
              <p className="text-foreground/80 leading-relaxed">
                Our own design doc calls that the strongest argument against the
                architecture we picked. We picked it anyway, because "your
                infrastructure, your leash" is the entire product and a proxy
                would have quietly made Wraps a dependency in your send path.
                The tradeoff is real, and it is the one we chose.
              </p>
            </Card>
          </section>

          {/* Identity */}
          <section>
            <h2 className="mb-6 flex items-center gap-3 font-bold text-3xl">
              <Shield className="text-brand-text" />
              Identity is the alias qualifier
            </h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Once the enforcer is in the path, everything depends on one
              question: when a request arrives, who is asking?
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              The first implementation answered it the obvious way. The request
              body carried an{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">agentId</code>,
              and the handler trusted it. An adversarial review blocked the
              release over exactly that, and it was right to. Every agent
              credential could invoke the same function ARN, so the id in the
              payload was a field the caller chose. Pass a sibling's id and you
              read that agent's policy, consume that agent's caps, and inherit
              that agent's allowlist and pinned sender. Kill an agent and it
              keeps sending by naming a live one. The kill switch was
              decoration.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              The fix is to stop asking the caller. Every agent gets its own
              Lambda alias named{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                agent-&lt;agentId&gt;
              </code>
              , and its IAM policy is pinned to that qualified ARN. AWS then
              hands the enforcer an identity in a field the caller does not
              control:
            </p>

            <CodeBlock
              code={`/** Caller identity bound to the invoke principal, never the payload. */
type Caller = { kind: "agent"; agentId: string } | { kind: "platform" };

const AGENT_QUALIFIER_PREFIX = "agent-";

function resolveCaller(context?: { invokedFunctionArn?: string }): Caller {
  const arn = context?.invokedFunctionArn ?? "";
  const parts = arn.split(":");
  const qualifier = parts.length >= 8 ? parts[7] : undefined;
  if (qualifier?.startsWith(AGENT_QUALIFIER_PREFIX)) {
    return {
      kind: "agent",
      agentId: qualifier.slice(AGENT_QUALIFIER_PREFIX.length),
    };
  }
  return { kind: "platform" };
}`}
              lang="typescript"
              title="agent-enforcer/index.ts"
            />

            <p className="mt-4 mb-4 text-foreground/80 text-lg leading-relaxed">
              A Lambda ARN is{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                arn:aws:lambda:&lt;region&gt;:&lt;account&gt;:function:&lt;name&gt;[:&lt;qualifier&gt;]
              </code>{" "}
              &mdash; seven colon-separated parts unqualified, eight qualified.
              So{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">parts[7]</code>{" "}
              exists only on a qualified invoke, and the only qualifier a given
              credential can produce is the one its IAM policy permits. The
              agent can rewrite every byte of the payload. It cannot rewrite the
              ARN it was allowed to invoke.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              That distinction is the whole design, so it's worth being concrete
              about what hangs off it. Every agent-scoped lookup keys on the
              resolved identity and never on the body: the{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">CONFIG</code>{" "}
              read that carries the kill flag, the policy, and the pinned sender
              address; the hourly and daily counter keys; and the status lookup,
              which returns{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">unknown</code>{" "}
              rather than a real verdict when the stored outcome belongs to
              someone else. Payload-derived identity would have made all three
              of those attacker-chosen &mdash; a privilege-escalation hole
              reachable by anyone holding any agent credential, including a
              credential you had already killed.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              The unqualified function is a different principal entirely. No
              qualifier &mdash; or{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">$LATEST</code>{" "}
              &mdash; resolves to the platform: the Wraps control plane arriving
              by assume-role to execute an approved send. Authorization is a
              three-case switch. An agent may{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">send</code> and{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">status</code>.
              The platform may{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">execute</code>.
              Anything else comes back as{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                blocked: "unauthorized action for caller"
              </code>{" "}
              &mdash; a disposition, notably, not a thrown error. Both
              directions are covered by tests, including one that invokes with a
              forged payload id and asserts the alias identity wins.
            </p>

            <p className="text-foreground/80 text-lg leading-relaxed">
              One operational consequence, worth knowing before you debug it at
              2am: the{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                WRAPS_AGENT_ENFORCER_ARN
              </code>{" "}
              you give the agent must be the <em>alias</em> ARN. A bare function
              name or an unqualified ARN invokes{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">$LATEST</code>,
              gets read as the platform caller, and every send comes back
              blocked as unauthorized. The identity model makes that
              misconfiguration fail loudly, which is the correct direction for
              it to fail.
            </p>
          </section>

          {/* Bounding the claim */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">
              What this bounds, and what it doesn't
            </h2>

            <div className="rounded-lg border-destructive border-l-4 bg-destructive/10 p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium">
                    This does not prevent prompt injection.
                  </p>
                  <p className="mt-2 text-foreground/80 leading-relaxed">
                    Nothing here inspects a prompt, a model's output, or intent.
                    An injected agent still forms the malicious send request and
                    still calls the enforcer, and the enforcer will send
                    anything the policy permits. If you allowlist a domain, an
                    injected agent can mail that domain. If your cap is 100 a
                    day, an injected agent has 100 a day.
                  </p>
                  <p className="mt-2 text-foreground/80 leading-relaxed">
                    What changes is the ceiling: one sender address, one
                    recipient per send, an allowlist, an hourly and a daily cap,
                    and a kill switch held by someone who is not the agent. The
                    injected send lands in an approval queue instead of in forty
                    thousand inboxes. That is a blast-radius property, not a
                    safety guarantee, and treating it as the latter is how you
                    end up surprised.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Credential */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">The credential</h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Each agent gets its own IAM user,{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                wraps-agent-&lt;name&gt;
              </code>
              , and one inline policy. This is the entire policy:
            </p>

            <CodeBlock
              code={`{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "lambda:InvokeFunction",
      "Resource": "arn:aws:lambda:us-east-1:111122223333:function:wraps-agent-enforcer:agent-<agentId>"
    }
  ]
}`}
              lang="json"
              title="wraps-agent-sdr-invoke"
            />

            <p className="mt-4 mb-4 text-foreground/80 text-lg leading-relaxed">
              One statement, one action, one resource, and the resource is the
              alias &mdash; not the function. What the credential can do: invoke
              that one alias. What it cannot do: touch SES (there is no{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">ses:*</code>{" "}
              statement at all), invoke any other function, invoke any other
              alias or version of the <em>same</em> function, invoke the
              unqualified{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">$LATEST</code>{" "}
              (which would resolve as the platform caller and get rejected
              anyway), or read a byte of DynamoDB, S3, IAM, or STS. The field's
              own comment in the source puts it well: a leaked credential can
              only ever act as its own agent.
            </p>

            <Card className="p-6">
              <p className="text-foreground/80 leading-relaxed">
                Keep two ceilings straight, because they are very different. The{" "}
                <strong>agent's</strong> policy above is genuinely tight. The{" "}
                <strong>enforcer's</strong> execution role is not: it holds{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">
                  ses:SendEmail
                </code>{" "}
                on{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">
                  Resource: "*"
                </code>
                , matching the breadth of the existing send grant. That is
                deliberate, and it is precisely why the sender pin exists as
                code in the next section. The leash is the enforcer's logic, not
                the enforcer's IAM. A logic bug in the enforcer is the full 3am
                scenario, and our design docs name it as the confused-deputy
                risk of this architecture.
              </p>
            </Card>
          </section>

          {/* The chain */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">
              The enforcement chain, in order
            </h2>

            <p className="mb-6 text-foreground/80 text-lg leading-relaxed">
              Every send walks the same five checks, in the same order, before
              SES is called. The order matters: the cheapest and most terminal
              checks run first, and nothing consumes a rate-limit slot until
              it's clear the send is otherwise allowed.
            </p>

            <ol className="space-y-4">
              <ChainStep
                step="0"
                title="Recipient shape"
                verdict={'blocked — "invalid recipient"'}
              >
                Before any I/O at all, the enforcer checks that{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">to</code> is
                exactly one address. The regex bans whitespace and commas
                because either one would smuggle a second recipient past a check
                written for one. A malformed value is blocked outright &mdash;
                no DynamoDB read, no counter write, no webhook.
              </ChainStep>

              <ChainStep
                step="1"
                title="Kill switch and policy existence"
                verdict={'blocked — "killed" or "unknown agent"'}
              >
                The enforcer reads one DynamoDB item,{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">
                  CONFIG#&lt;agentId&gt;
                </code>
                , written by the Wraps API on every policy change and every
                kill. A missing item blocks. A{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">
                  killed: true
                </code>{" "}
                item blocks. A killed agent is stopped locally in the Lambda: no
                webhook, no queue row, nothing for an operator to approve by
                mistake.
              </ChainStep>

              <ChainStep
                step="2"
                title="Sender pin"
                verdict={'blocked — "from must be the agent’s own address"'}
              >
                The <code className="rounded bg-muted px-1.5 py-0.5">from</code>{" "}
                address must equal the agent's own address, compared
                case-insensitively. It fails closed: if the stored address is
                empty, every send blocks. A spoof attempt is a hard local stop
                and never reaches the approval queue &mdash; there is nothing to
                approve, because the answer is always no.
              </ChainStep>

              <ChainStep
                step="3"
                title="Recipient allowlist"
                verdict="pending_approval — queued for an operator"
              >
                The first check that does not hard-block. The address is matched
                against the policy's exact-address list and its domain list. A
                recipient that is off the list is not rejected &mdash; it is
                flagged, which POSTs the pending send to the Wraps API and
                returns an approval id to the agent. This runs before any cap is
                consumed.
              </ChainStep>

              <ChainStep
                step="4"
                title="Hourly cap, then daily cap"
                verdict={
                  'pending_approval — "hourly cap reached" / "daily cap reached"'
                }
              >
                Each window is a conditional{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">
                  UpdateItem
                </code>{" "}
                &mdash;{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">
                  attribute_not_exists(sends) OR sends &lt; :cap
                </code>{" "}
                &mdash; never a read-modify-write, so the counter cannot exceed
                the cap under concurrency. A cap of zero or less flags before
                any counter is touched, so there is never one free send. If the
                daily cap rejects after the hourly slot was already consumed,
                the hourly slot is handed back. A DynamoDB error that is not a
                conditional-check failure is rethrown rather than mislabeled as
                a cap.
              </ChainStep>
            </ol>

            <p className="mt-6 mb-4 text-foreground/80 text-lg leading-relaxed">
              Only after all five does the enforcer call SESv2, with simple
              content (never raw MIME, so header injection isn't reachable from
              the agent's credential) and an{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">EmailTags</code>{" "}
              entry carrying the{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">agentId</code>,
              so every agent send is attributable in your SES event data without
              any extra plumbing.
            </p>

            <p className="text-foreground/80 text-lg leading-relaxed">
              The default policy a new agent starts with is{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">20/hour</code>,{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">100/day</code>,
              and an <em>empty</em> allowlist. Which means that out of the box,
              every recipient is flagged into the approval queue. That surprises
              people in a demo, and it is intentional: the leash starts tight
              and you widen it on purpose. If you want an agent that can mail
              your own domain unattended, you say so.
            </p>
          </section>

          {/* MCP */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">What the agent sees</h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              On the agent side this is an MCP server.{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                @wraps.dev/mcp
              </code>{" "}
              switches into enforced mode when <em>both</em>{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                WRAPS_AGENT_ID
              </code>{" "}
              and{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                WRAPS_AGENT_ENFORCER_ARN
              </code>{" "}
              are set. Two things change, and both are more interesting than
              they look.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              First, the MCP server's own guardrails switch off. In normal mode
              it has a write flag, a max-recipients limit, a local recipient
              allowlist, and a from-override toggle. In enforced mode all of
              them are skipped deliberately. Enforced mode makes the client
              dumber on purpose, because a guard running on the machine the
              agent is driving is a guard inside the blast radius. There is
              exactly one authority, and it is in your AWS account.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Second &mdash; and this is the part that changes how an agent
              behaves &mdash;{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">sent</code>,{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                pending_approval
              </code>{" "}
              and{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">blocked</code>{" "}
              come back as successful, structured results. Not exceptions. Not{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">isError</code>.
            </p>

            <CodeBlock
              code={`{
  "status": "pending_approval",
  "approvalId": "3f7c1a9e-0b52-4a1d-9c8e-6d2f0b41a7c3"
}`}
              lang="json"
              title="structuredContent"
            />

            <p className="mt-4 mb-4 text-foreground/80 text-lg leading-relaxed">
              The full disposition union is{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">sent</code>,{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                pending_approval
              </code>
              , <code className="rounded bg-muted px-1.5 py-0.5">blocked</code>,{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">failed</code>,{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">unknown</code>.
              The only things that surface as errors are a missing{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">from</code>, a
              missing body, more than one recipient, and the enforcer being
              unreachable &mdash; transport and configuration faults. A policy
              verdict is never an error.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              That distinction is load-bearing for an agent's control flow. An
              error tells a model that something went wrong and implicitly
              invites it to find another way. A structured result tells it what
              happened. Handed{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                pending_approval
              </code>{" "}
              plus an approval id, an agent can report "the send is waiting on a
              human" and poll{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                check_send_status
              </code>
              , a tool that only gets registered in enforced mode. Handed a
              thrown exception, it would go looking for a workaround &mdash;
              which is the last behavior you want from a possibly-compromised
              agent standing at a send boundary.
            </p>

            <p className="text-foreground/80 text-lg leading-relaxed">
              Enforced mode is one recipient per send. That is enforced at the
              MCP schema (a one-element array or a bare string, nothing else),
              again by a defensive guard in the handler, and a third time by the
              enforcer, which re-validates the recipient shape across the repo
              boundary. The wire types are duplicated by hand into the MCP
              package with a source-of-truth header; the copy carries only the
              request and response shapes, not the server-side DynamoDB key
              builders. There is no CI check for drift between the two &mdash;
              today the protection is a comment, which is worth saying out loud.
            </p>
          </section>

          {/* Approval queue */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">When a send is flagged</h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              A flagged send POSTs to the Wraps API, authenticated with the
              account webhook secret that{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                platform connect
              </code>{" "}
              already registered. The organization is resolved from the AWS
              account that matched that secret, never from the request body, so
              a forged callback cannot inject a row into someone else's org.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              The queue has five states and they're all uppercase in Postgres:{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">PENDING</code>{" "}
              &rarr;{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">APPROVED</code>{" "}
              &rarr;{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">SENT</code> or{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">FAILED</code>,
              plus{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">REJECTED</code>.
              Note what isn't there: there is no{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">BLOCKED</code>{" "}
              row and no expiry state. A blocked verdict never becomes a queue
              row at all &mdash; it becomes a notification, because there is
              nothing for an operator to decide.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Every decision is one atomic SQL statement with the precondition
              in the{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">WHERE</code>{" "}
              clause:
            </p>

            <CodeBlock
              code={`await dbClient
  .update(agentApprovalQueue)
  .set({ status, decidedBy, decidedAt: new Date(), updatedAt: new Date() })
  .where(
    and(
      eq(agentApprovalQueue.id, approvalId),
      eq(agentApprovalQueue.organizationId, organizationId),
      eq(agentApprovalQueue.status, "PENDING")
    )
  )
  .returning();`}
              lang="typescript"
              title="decideApproval"
            />

            <p className="mt-4 mb-4 text-foreground/80 text-lg leading-relaxed">
              Concurrent deciders race in the database rather than in
              application code. Exactly one gets a row back; the loser gets zero
              rows, which the route turns into a 409 naming the state it
              actually observed. The terminal writes &mdash; marking a row{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">SENT</code> or{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">FAILED</code>{" "}
              &mdash; are guarded on{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">APPROVED</code>{" "}
              the same way. Double-clicking Approve does not double-send.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Kill is terminal, and it's enforced at four layers rather than
              trusted once. There is a single function that writes the{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">KILLED</code>{" "}
              status and it writes a literal; the general update path strips{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">status</code>{" "}
              from its input at both the type level and at runtime; no route or
              server action revives an agent; and kill beats approval twice
              &mdash; the API refuses to approve for a killed agent before it
              even attempts the transition, and the enforcer independently
              re-checks the kill flag inside{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">execute</code>,
              because an operator's approval must not outrun a kill. The one
              thing that is <em>not</em> true: terminality lives in application
              code. There is no database constraint stopping a raw{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">UPDATE</code>.
            </p>

            <h3 className="mt-8 mb-3 font-semibold text-xl">
              Approved sends are at-least-once
            </h3>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              We are not going to round this up to exactly-once. When an
              approval executes, the Lambda sends through SES and <em>then</em>{" "}
              writes the outcome record. SESv2 has no idempotency token, so
              writing the record first would trade duplicate sends for lost
              sends, and between those two we chose the failure we can tolerate
              and explain. A crash in the gap can resend once.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              The outcome record itself is an unconditional put with a 48-hour
              TTL, so it is a replay guard rather than a distributed lock
              &mdash; two genuinely simultaneous executes could both read it
              empty. What actually prevents that is on the API side: an{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">APPROVED</code>{" "}
              row decided less than fifteen seconds ago is assumed to have a
              live executor and gets a 409 with no second invoke. Older than
              that, it's assumed stranded by a crash and the retry is allowed
              through to heal it, which the outcome record makes safe.
            </p>

            <h3 className="mt-8 mb-3 font-semibold text-xl">
              What an operator sees
            </h3>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Two dashboard pages. The agents list shows address, status, and a
              policy summary that reads like{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                20/hr &middot; 100/day &middot; 3 allowlisted targets
              </code>
              , with a kill button for owners and admins. There is no "create
              agent" button &mdash; creation is CLI-only, and the empty state
              says so rather than hiding it.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              The kill dialog is written to be accurate rather than reassuring:
              it flips the switch and syncs it to the enforcer, and if that sync
              fails you'll be told to retry. That isn't hedging. The Postgres
              write and the DynamoDB write can succeed independently, so the API
              returns a tri-state sync result and the UI shows an error toast,
              not a success, when the sync didn't land. A kill that's durable in
              Wraps and missing in your account is an agent that is still
              sending, and the only responsible thing to do is say so.
            </p>

            <p className="text-foreground/80 text-lg leading-relaxed">
              The approval queue lists Send, Reason, Status and Actions, sorted
              by status priority rather than time so pending work is always on
              top. Only pending rows get buttons, and the buttons are Approve
              and Reject &mdash; there is no Block, because blocking already
              happened in your account before the row existed. The page loads
              once on mount, so an approval that arrives while the tab is open
              won't appear until you reload it.
            </p>
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
                  Kill is a soft revoke, not a credential deletion
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  Killing an agent flips a flag the enforcer reads. The IAM
                  user, its inline policy and its access key all stay live and
                  valid &mdash; the credential still successfully invokes the
                  Lambda, and the Lambda refuses every send. No CLI or API path
                  deletes the key. The only true IAM revocation today is{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    wraps email destroy
                  </code>{" "}
                  or manual work in the AWS console.
                </p>
              </div>

              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">
                  No rotation, and no way to widen the leash from the CLI
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  There is no{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">rotate</code>{" "}
                  subcommand; rotating an agent's access key means replacing the
                  Pulumi resource by hand. And caps and allowlists are set at
                  creation and changed only through the API or the dashboard
                  &mdash; the CLI has exactly three agent subcommands and
                  editing policy isn't one of them.
                </p>
              </div>

              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">
                  An interrupted create can leave two live access keys
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  The IAM <em>user</em> is idempotent across re-runs &mdash;
                  there's an existence probe that imports it instead of failing.
                  The access key has no such probe. So a create that dies after
                  provisioning IAM but before the deploy outputs are synced back
                  is resumable, and the resumed run mints a fresh key while the
                  previous one is still valid in AWS. Check the console after an
                  interrupted create.
                </p>
              </div>

              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">
                  Destroy is all-or-nothing, and it leaves the SES identity
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  Agent resources live in the same Pulumi email stack, so{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    wraps email destroy
                  </code>{" "}
                  does tear down the enforcer, the policy table, the aliases,
                  the IAM users and their keys &mdash; and the destroy summary
                  now says so before you confirm, naming the agent mailboxes,
                  the credentials being revoked, and the pending approvals that
                  become undeliverable. Destroy also best-effort marks the
                  stack's agents{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">KILLED</code>{" "}
                  in the dashboard, so you're not left staring at agents that
                  look active with no infrastructure behind them. Still true:
                  nothing suppresses or deletes the SES identity for the agent's
                  address, the enforcer's CloudWatch log group survives with no
                  retention set, and there is no "destroy one agent" &mdash;
                  removing a single agent means editing config and redeploying,
                  which no command does for you.
                </p>
              </div>

              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">
                  Stale enforcers are invisible
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  This is the flip side of customer-side enforcement. The plan
                  called for stamping an enforcer version into the config item
                  and nagging about it in{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    agent list
                  </code>{" "}
                  and the dashboard. That didn't get built. There is no version
                  stamp and no staleness warning, and agent resources don't
                  appear in{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    wraps email status
                  </code>{" "}
                  either. If we ship a fix to the leash, you find out from a
                  release note, not from the tool.
                </p>
              </div>

              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">
                  The audit trail is incomplete
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  Six agent audit action types are declared and labeled in the
                  UI. Three are actually written &mdash; killed, approved,
                  rejected &mdash; and all three come from the dashboard. The
                  API writes none, so a CLI-driven kill produces a notification
                  and no audit row. "Every send attributable to the agent" is
                  the goal; what shipped is SES-level attribution via the{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    agentId
                  </code>{" "}
                  email tag plus a partial application-level log.
                </p>
              </div>

              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">
                  One recipient per send, and agents don't receive mail yet
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  Enforced mode sends to exactly one address per call; there is
                  no batch and no bulk path. And while an agent record stores an
                  email address, nothing routes inbound mail to it in v1 &mdash;
                  per-agent inbound was explicitly deferred. Today the address
                  is an identity, not an inbox.
                </p>
              </div>

              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">
                  The agent CLI command shipped without tests
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  True at ship, closed three days later. The enforcer Lambda,
                  the repositories, the API routes and the MCP tools all had
                  real behavioral coverage from day one &mdash; concurrent
                  approves, forged payload ids, cap compensation, kill races.
                  The 759-line CLI command that provisions all of it went out
                  untested, which was a security-relevant gap in a
                  security-relevant file. A follow-up landed dedicated coverage
                  for it &mdash; registration decisions, fatal output guards,
                  save ordering, the webhook-secret hard stop, list and kill.
                </p>
              </div>

              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">
                  The SES sandbox is warned about, not handled
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    agent create
                  </code>{" "}
                  prints a warning if your account is in the SES sandbox and
                  then continues. A sandbox account still cannot send to
                  unverified recipients, so a sandboxed agent will be stopped by
                  SES regardless of how permissive its policy is. Get production
                  access first.
                </p>
              </div>
            </div>
          </section>

          {/* Try it */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">Try it</h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              There are three subcommands. That's the whole surface:
            </p>

            <CodeBlock
              code={`Agent Commands:
  email agent create   Create a leashed agent mailbox
  email agent list     List agents
  email agent kill     Kill an agent (revoke sending)`}
              title="terminal"
            />

            <p className="mt-4 mb-4 text-foreground/80 text-lg leading-relaxed">
              Approve and reject are deliberately not here &mdash; deciding a
              queued send is a dashboard and API action, not something an agent
              host should be able to shell out to.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Two prerequisites, both hard stops in the command rather than
              surprises later: email has to be initialized on the account, and
              the account has to be connected to the Wraps platform, because the
              approval-execute path needs the console access role to invoke the
              enforcer. Pass the agent name as a positional argument.
            </p>

            <CodeBlock
              code={`# upgrade the CLI
npm i -g @wraps.dev/cli@latest

# create an agent mailbox on a tracked domain
npx @wraps.dev/cli email agent create sdr --domain agents.foo.com

# see what exists
npx @wraps.dev/cli email agent list

# stop one
npx @wraps.dev/cli email agent kill sdr`}
              title="terminal"
            />

            <p className="mt-4 mb-4 text-foreground/80 text-lg leading-relaxed">
              Creation registers the agent with the platform, deploys the
              enforcer and the scoped credential, persists the stack outputs and
              syncs the policy &mdash; and only then prints the credential. That
              ordering is deliberate: if the process died after printing, the
              agent would be unrecoverable. What you get back is the block you
              paste into your MCP client config:
            </p>

            <CodeBlock
              code={`WRAPS_AGENT_ID=<agentId>
WRAPS_AGENT_ENFORCER_ARN=arn:aws:lambda:us-east-1:111122223333:function:wraps-agent-enforcer:agent-<agentId>
AWS_ACCESS_KEY_ID=<accessKeyId>
AWS_SECRET_ACCESS_KEY=<secretAccessKey>
AWS_REGION=us-east-1`}
              lang="bash"
              title="MCP env"
            />

            <p className="mt-4 text-foreground/80 text-lg leading-relaxed">
              The CLI tells you to save the secret because it is shown only
              once. To be precise about what that means: it is shown once in the
              terminal. The key does live in your Pulumi state, so anyone who
              can read that stack can recover it. Treat the state file
              accordingly.
            </p>
          </section>

          {/* Continue reading */}
          <section className="space-y-4">
            <h2 className="font-bold text-2xl">Continue reading</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <a
                className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
                href="/docs/mcp-reference"
              >
                <h3 className="font-semibold group-hover:text-primary">
                  MCP Server Reference
                </h3>
                <p className="text-muted-foreground text-sm">
                  Enforced mode, the three dispositions, and{" "}
                  <code>check_send_status</code>
                </p>
              </a>
              <a
                className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
                href="/agents"
              >
                <h3 className="font-semibold group-hover:text-primary">
                  Agents on Wraps
                </h3>
                <p className="text-muted-foreground text-sm">
                  The leash in product terms: kill switch, sender pin,
                  allowlist, caps
                </p>
              </a>
              <a
                className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
                href="/docs/quickstart/email"
              >
                <h3 className="font-semibold group-hover:text-primary">
                  Email Quickstart
                </h3>
                <p className="text-muted-foreground text-sm">
                  Prerequisite: deploy SES to your own AWS account first
                </p>
              </a>
              <a
                className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
                href="/blog/signed-reply-threading"
              >
                <h3 className="font-semibold group-hover:text-primary">
                  Signed Reply-To for Agents
                </h3>
                <p className="text-muted-foreground text-sm">
                  Verified conversation IDs on inbound replies, signed in your
                  AWS account
                </p>
              </a>
            </div>
          </section>

          {/* CTA */}
          <section className="relative">
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-brand/10 to-warning/10 blur-xl" />
            <Card className="relative p-8 text-center md:p-12">
              <h2 className="mb-4 font-bold text-3xl md:text-4xl">
                Give your agent an address, and a leash
              </h2>
              <p className="mx-auto mb-8 max-w-lg text-muted-foreground">
                The enforcer runs in your AWS account. The agent's credential
                can invoke one Lambda alias and nothing else.
              </p>
              <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                <div className="rounded-xl border bg-muted/30 px-6 py-3 font-mono text-brand-text">
                  npx @wraps.dev/cli email agent create sdr
                </div>
                <a
                  className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                  href="/docs/mcp-reference"
                >
                  Read the Reference
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
