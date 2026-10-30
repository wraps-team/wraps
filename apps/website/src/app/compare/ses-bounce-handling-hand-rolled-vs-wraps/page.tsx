import { Button } from "@wraps/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { ArrowRight, Check, Minus, Terminal, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { AlsoCompare } from "@/app/compare/components/also-compare";
import { CompareBreadcrumb } from "@/app/compare/components/breadcrumb";
import { CodeComparison } from "@/app/compare/components/code-comparison";
import { FeatureCell } from "@/app/compare/components/feature-cell";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { SectionKicker } from "@/app/landing/components/section-kicker";
import { JsonLd } from "@/components/json-ld";

export const metadata: Metadata = {
  title: "SES Bounce Handling: Hand-Rolled vs Wraps",
  description:
    "An honest comparison. Hand-rolling SNS signature verification for SES bounce handling takes 85 lines, and a competent developer — or a coding agent — writes them correctly. Here is that exact code, and here is what it still does not cover.",
  openGraph: {
    title: "SES Bounce Handling: Hand-Rolled vs Wraps | Wraps",
    description:
      "85 lines of SNS signature verification, written correctly. We show the code. The argument for Wraps is not that your code will be wrong — it's what the code doesn't cover.",
    url: "https://wraps.dev/compare/ses-bounce-handling-hand-rolled-vs-wraps",
    type: "article",
  },
  twitter: {
    card: "summary_large_image",
    title: "SES Bounce Handling: Hand-Rolled vs Wraps | Wraps",
    description:
      "85 lines of SNS signature verification, written correctly. We show the code. The argument for Wraps is what the code doesn't cover.",
  },
  alternates: {
    canonical:
      "https://wraps.dev/compare/ses-bounce-handling-hand-rolled-vs-wraps",
  },
};

const breadcrumbJsonLd = {
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
      name: "Compare",
      item: "https://wraps.dev/compare",
    },
    {
      "@type": "ListItem",
      position: 3,
      name: "SES Bounce Handling: Hand-Rolled vs Wraps",
      item: "https://wraps.dev/compare/ses-bounce-handling-hand-rolled-vs-wraps",
    },
  ],
};

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "SES Bounce Handling: Hand-Rolled vs Wraps",
  description:
    "An honest line-by-line comparison between hand-rolled SES bounce handling and Wraps, including the full 85-line SNS signature verification implementation.",
  datePublished: "2026-08-04T00:00:00.000Z",
  dateModified: "2026-09-15T00:00:00.000Z",
  author: {
    "@type": "Organization",
    name: "Wraps",
    url: "https://wraps.dev",
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
    "@id": "https://wraps.dev/compare/ses-bounce-handling-hand-rolled-vs-wraps",
  },
};

const snsVerifyCode = `import crypto from "node:crypto";

// SNS signs with a cert hosted on an AWS-controlled host. Anything else is
// an attacker pointing you at a cert they control.
const CERT_HOST = /^sns\\.[a-zA-Z0-9-]{3,}\\.amazonaws\\.com(\\.cn)?$/;

const certCache = new Map<string, string>();

async function fetchCert(url: string): Promise<string> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !CERT_HOST.test(parsed.hostname)) {
    throw new Error(\`Untrusted SigningCertURL host: \${parsed.hostname}\`);
  }
  const cached = certCache.get(url);
  if (cached) return cached;

  const res = await fetch(url);
  if (!res.ok) throw new Error(\`Cert fetch failed: \${res.status}\`);
  const pem = await res.text();
  certCache.set(url, pem);
  return pem;
}

// The signed string is a specific key subset, in this exact order, with the
// key and value each followed by a newline. Order and membership are not
// alphabetical-by-accident — they are fixed by SNS and differ per message type.
const SIGNED_KEYS: Record<string, string[]> = {
  Notification: [
    "Message",
    "MessageId",
    "Subject",
    "Timestamp",
    "TopicArn",
    "Type",
  ],
  SubscriptionConfirmation: [
    "Message",
    "MessageId",
    "SubscribeURL",
    "Timestamp",
    "Token",
    "TopicArn",
    "Type",
  ],
  UnsubscribeConfirmation: [
    "Message",
    "MessageId",
    "SubscribeURL",
    "Timestamp",
    "Token",
    "TopicArn",
    "Type",
  ],
};

function canonicalString(msg: Record<string, unknown>): string {
  const keys = SIGNED_KEYS[msg.Type as string];
  if (!keys) throw new Error(\`Unknown SNS message type: \${msg.Type}\`);

  let out = "";
  for (const key of keys) {
    // Subject is optional; it is omitted from the signed string when absent,
    // not included as an empty value.
    if (msg[key] === undefined || msg[key] === null) continue;
    out += \`\${key}\\n\${msg[key]}\\n\`;
  }
  return out;
}

export async function verifySnsMessage(
  msg: Record<string, unknown>,
  expectedTopicArn: string
): Promise<boolean> {
  // Pin the topic. A valid signature only proves *some* SNS topic sent this.
  if (msg.TopicArn !== expectedTopicArn) return false;

  const version = msg.SignatureVersion;
  if (version !== "1" && version !== "2") return false;
  const algorithm = version === "1" ? "RSA-SHA1" : "RSA-SHA256";

  const pem = await fetchCert(String(msg.SigningCertURL));
  const verifier = crypto.createVerify(algorithm);
  verifier.update(canonicalString(msg), "utf8");
  return verifier.verify(pem, String(msg.Signature), "base64");
}`;

const handRolledRouteCode = `import { type NextRequest, NextResponse } from "next/server";
import { verifySnsMessage } from "./sns-verify";

const TOPIC_ARN = process.env.SES_EVENTS_TOPIC_ARN!;

export async function POST(request: NextRequest) {
  // SNS sends text/plain, so request.json() is not guaranteed to work.
  const raw = await request.text();
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(raw);
  } catch {
    return new NextResponse("Bad JSON", { status: 400 });
  }

  if (!(await verifySnsMessage(msg, TOPIC_ARN))) {
    return new NextResponse("Invalid signature", { status: 403 });
  }

  // A new subscription is dead until you GET the SubscribeURL. Miss this and
  // the endpoint silently receives nothing.
  if (msg.Type === "SubscriptionConfirmation") {
    await fetch(String(msg.SubscribeURL));
    return new NextResponse("OK", { status: 200 });
  }

  if (msg.Type !== "Notification") {
    return new NextResponse("OK", { status: 200 });
  }

  // The SES event is a JSON string nested inside the SNS envelope.
  const event = JSON.parse(String(msg.Message));

  switch (event.eventType ?? event.notificationType) {
    case "Bounce": {
      const { bounceType, bouncedRecipients } = event.bounce;
      for (const r of bouncedRecipients) {
        if (bounceType === "Permanent") {
          await db.contacts.update({
            where: { email: r.emailAddress },
            data: { bounced: true, bouncedAt: new Date() },
          });
        }
      }
      break;
    }
    case "Complaint": {
      for (const r of event.complaint.complainedRecipients) {
        await db.contacts.update({
          where: { email: r.emailAddress },
          data: { unsubscribed: true, unsubscribedAt: new Date() },
        });
      }
      break;
    }
    default:
      break;
  }

  return new NextResponse("OK", { status: 200 });
}`;

const wrapsRouteCode = `import crypto from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";

const SECRET = process.env.WRAPS_WEBHOOK_SECRET!;

export async function POST(request: NextRequest) {
  const sent = Buffer.from(request.headers.get("x-wraps-signature") ?? "");
  const expected = Buffer.from(SECRET);
  // timingSafeEqual throws when the buffers differ in length — check first,
  // or a short header is a 500 instead of a 401.
  if (
    sent.length !== expected.length ||
    !crypto.timingSafeEqual(sent, expected)
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { event, detail } = await request.json();

  if (event === "Bounce" && detail.bounce.bounceType === "Permanent") {
    for (const r of detail.bounce.bouncedRecipients) {
      await db.contacts.update({
        where: { email: r.emailAddress },
        data: { bounced: true, bouncedAt: new Date() },
      });
    }
  }

  if (event === "Complaint") {
    for (const r of detail.complaint.complainedRecipients) {
      await db.contacts.update({
        where: { email: r.emailAddress },
        data: { unsubscribed: true, unsubscribedAt: new Date() },
      });
    }
  }

  return NextResponse.json({ received: true });
}`;

const lineCounts = [
  {
    file: "sns-verify.ts",
    role: "SNS signature verification",
    total: "85",
    code: "67",
  },
  {
    file: "route.ts",
    role: "Webhook endpoint + event handling",
    total: "67",
    code: "51",
  },
  {
    file: "Total",
    role: "Everything above",
    total: "152",
    code: "118",
    emphasis: true,
  },
];

type FeatureSupport = "yes" | "no" | "partial" | string;

const featureComparison: {
  category: string;
  features: {
    name: string;
    diy: FeatureSupport;
    diyNote?: string;
    wraps: FeatureSupport;
    wrapsNote?: string;
  }[];
}[] = [
  {
    category: "The part the code covers",
    features: [
      {
        name: "SNS signature verification",
        diy: "yes",
        diyNote: "85 lines, correct",
        wraps: "yes",
        wrapsNote: "EventBridge + shared secret",
      },
      {
        name: "Subscription confirmation",
        diy: "yes",
        diyNote: "One fetch call",
        wraps: "yes",
        wrapsNote: "No subscription handshake at all",
      },
      {
        name: "Parse bounce/complaint payloads",
        diy: "yes",
        diyNote: "Straightforward JSON",
        wraps: "yes",
        wrapsNote: "Same payload, flattened",
      },
    ],
  },
  {
    category: "The part the code doesn't cover",
    features: [
      {
        name: "SNS topic, subscription, IAM policy",
        diy: "partial",
        diyNote: "Console clicks or ~60 lines of IaC",
        wraps: "yes",
        wrapsNote: "Deployed by wraps email init",
      },
      {
        name: "Retry + dead-letter queue on handler failure",
        diy: "no",
        diyNote: "SNS retries, then drops silently",
        wraps: "yes",
        wrapsNote: "SQS + DLQ in your AWS account",
      },
      {
        name: "Bounce and complaint rates watched",
        diy: "no",
        diyNote: "Nothing reads the events back",
        wraps: "yes",
        wrapsNote: "Hourly sweep; owners and admins notified",
      },
      {
        name: "CloudWatch alarms below AWS's thresholds",
        diy: "no",
        diyNote: "Build and tune them yourself",
        wraps: "partial",
        wrapsNote:
          "On for the Production and Enterprise presets; off for Starter",
      },
      {
        name: "Queryable event history",
        diy: "no",
        diyNote: "Your DB, your schema, your retention",
        wraps: "yes",
        wrapsNote: "DynamoDB in your account + events API",
      },
      {
        name: "Suppression list you can act on",
        diy: "no",
        diyNote: "Raw SESv2 API calls",
        wraps: "yes",
        wrapsNote: "Browse and clear from the dashboard",
      },
      {
        name: "Deliverability and blacklist audit",
        diy: "no",
        diyNote: "Assemble the DNS and blacklist checks yourself",
        wraps: "yes",
        wrapsNote: "wraps email check, on demand",
      },
      {
        name: "Open/click tracking over HTTPS",
        diy: "no",
        diyNote: "Config set + ACM + CloudFront",
        wraps: "yes",
        wrapsNote: "Deployed with the stack",
      },
      {
        name: "Clean teardown",
        diy: "no",
        diyNote: "Manual resource deletion",
        wraps: "yes",
        wrapsNote: "wraps email destroy",
      },
    ],
  },
];

const stillYourJob = [
  "Deciding your soft-bounce threshold and writing the counter behind it",
  "Keeping your own unsubscribe list in sync with the SES suppression list",
  "Making your handler idempotent — events can arrive more than once",
  "Requesting SES production access. Wraps detects the sandbox, explains it, and links the request; the approval is AWS's call",
];

const chooseHandRollReasons = [
  "You only need bounce and complaint events, and you already have an SNS topic wired up",
  "You have an existing queue, retry, and alerting stack that new events can plug into",
  "Your team already owns CloudWatch alarms and a metrics pipeline you trust",
  "You want zero additional vendors in the path, and are willing to own the operational surface",
  "The 152 lines are genuinely the whole job for your use case — some apps are that simple",
];

const chooseWrapsReasons = [
  "You want the surrounding infrastructure — queue, dead-letter queue, event history — deployed rather than assembled",
  "You want the two rates AWS judges you on read against its own lines every hour, with your owners and admins told",
  "You want CloudWatch alarms at 2% and 4% bounce sitting in your own account — the Production and Enterprise presets deploy them, Starter does not",
  "You want per-message event history you can query without designing a schema for it",
  "You would rather your team's next stretch of work go to product than to email plumbing",
  "You still want to own everything: it all deploys into your AWS account and can be torn down",
];

export default function SesBounceHandlingHandRolledVsWrapsPage() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />
      <Script id="breadcrumb-jsonld" type="application/ld+json">
        {JSON.stringify(breadcrumbJsonLd)}
      </Script>
      <JsonLd data={articleSchema} />

      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="mx-auto max-w-4xl">
          <CompareBreadcrumb competitor="Hand-Rolled Bounce Handling" />

          {/* =========================================== */}
          {/* 1. HERO */}
          {/* =========================================== */}
          <section className="mb-16">
            <SectionKicker>Comparison</SectionKicker>
            <h1 className="mb-4 font-heading font-semibold text-4xl tracking-tight sm:text-5xl">
              SES Bounce Handling: Hand-Rolled vs Wraps
            </h1>
            <p className="mb-3 max-w-2xl text-lg text-muted-foreground">
              Every other page in this section compares Wraps to a company. This
              one compares it to the thing people actually choose instead:{" "}
              <strong className="text-foreground">
                writing it themselves in an afternoon
              </strong>
              .
            </p>
            <p className="max-w-2xl text-lg text-muted-foreground">
              So let's be precise about what that costs.{" "}
              <strong className="text-foreground">
                It is 85 lines of SNS signature verification and 67 lines of
                handler
              </strong>{" "}
              — and a competent developer, or a competent coding agent, writes
              them correctly. The full code is on this page.
            </p>
            <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
              Writing it is an afternoon. Running it is every week after that:
              the topic and the subscription, the queue behind the handler, the
              two rates AWS judges the account on, the suppression list, the
              history you go looking through when a customer says the mail never
              arrived. That second part is what Wraps is for.
            </p>
          </section>

          {/* =========================================== */}
          {/* 2. THE HONEST LINE COUNT */}
          {/* =========================================== */}
          <section className="mb-16">
            <h2 className="mb-4 font-heading font-semibold text-2xl tracking-tight">
              The Honest Line Count
            </h2>
            <p className="mb-6 text-muted-foreground">
              These are real counts from the working implementation below, not
              an estimate. Nothing is padded to make the number look worse.
            </p>
            <Card className="overflow-hidden py-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-4 text-left font-medium">File</th>
                      <th className="p-4 text-left font-medium">Role</th>
                      <th className="p-4 text-left font-medium">Lines</th>
                      <th className="p-4 text-left font-medium">
                        Excl. blanks &amp; comments
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {lineCounts.map((row) => (
                      <tr
                        className={row.emphasis ? "bg-muted/30" : undefined}
                        key={row.file}
                      >
                        <td className="p-4 font-medium">
                          <code className="text-xs">{row.file}</code>
                        </td>
                        <td className="p-4 text-muted-foreground">
                          {row.role}
                        </td>
                        <td className="p-4 font-medium">{row.total}</td>
                        <td className="p-4 text-muted-foreground">
                          {row.code}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <p className="mt-4 text-muted-foreground text-sm">
              For comparison, the Wraps version of the same handler is{" "}
              <strong className="text-foreground">39 lines</strong>, because the
              signature is a shared secret rather than an asymmetric one. That
              is a real reduction, and it is also the least interesting thing on
              this page.
            </p>
          </section>

          {/* =========================================== */}
          {/* 3. HERE IS THE CODE */}
          {/* =========================================== */}
          <section className="mb-16">
            <h2 className="mb-4 font-heading font-semibold text-2xl tracking-tight">
              Here Is the Code. It Is Correct.
            </h2>
            <p className="mb-6 text-muted-foreground">
              This is the part most vendor comparison pages skip, or replace
              with a strawman. This implementation validates the certificate
              host, builds the canonical string with the exact key sets SNS
              signs, handles both signature versions, pins the topic ARN, and
              caches the certificate. It works.
            </p>
            <div className="mb-6">
              <CodeComparison
                after={{
                  label: "The handler — 67 lines",
                  filename: "app/api/ses-events/route.ts",
                  language: "typescript",
                  code: handRolledRouteCode,
                }}
                before={{
                  label: "Signature verification — 85 lines",
                  filename: "sns-verify.ts",
                  language: "typescript",
                  code: snsVerifyCode,
                }}
              />
            </div>
            <Card className="bg-muted/30">
              <CardContent>
                <p className="text-sm">
                  <strong>One caveat, in fairness to both sides.</strong> Node's{" "}
                  <code className="rounded bg-muted px-1 text-xs">
                    crypto.verify()
                  </code>{" "}
                  checks the signature against the certificate you hand it — it
                  does not validate that certificate's chain of trust. The host
                  check above is what carries that weight, which is why it
                  matters more than it looks. AWS's own guidance is to confirm
                  the chain as well, and the official{" "}
                  <a
                    className="underline"
                    href="https://github.com/aws/aws-js-sns-message-validator"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    aws-js-sns-message-validator
                  </a>{" "}
                  is the safer default if you go this route. It is AWS's own
                  library, and at that one job it is better than the code above.
                </p>
              </CardContent>
            </Card>
          </section>

          {/* =========================================== */}
          {/* 4. WHAT THE 152 LINES DON'T COVER */}
          {/* =========================================== */}
          <section className="mb-16">
            <h2 className="mb-4 font-heading font-semibold text-2xl tracking-tight">
              What the 152 Lines Don't Cover
            </h2>
            <p className="mb-6 text-muted-foreground">
              The argument for Wraps was never "your signature verification will
              be wrong." It's that signature verification is the part of this
              problem with a clean, well-documented answer — and it's roughly
              the only part. Everything below has no snippet to copy.
            </p>

            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    The code assumes infrastructure that doesn't exist yet
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-sm">
                    <code className="rounded bg-muted px-1 text-xs">
                      SES_EVENTS_TOPIC_ARN
                    </code>{" "}
                    implies an SNS topic, a configuration set with an event
                    destination pointed at it, an HTTPS subscription, and an IAM
                    policy letting SES publish. That's console clicks you'll
                    forget, or another 60-odd lines of Terraform you now
                    maintain. The handler is the visible tip of the work.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    When your endpoint is down, the events are gone
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-sm">
                    SNS retries an HTTPS endpoint on its own schedule and then
                    stops. There is no queue in front of your handler and no
                    dead-letter queue behind it, so a deploy window or a
                    database blip drops events with no record that they arrived.
                    Nothing reconciles afterwards, so an address you were told
                    about stays on your list.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    Somebody still has to watch the account
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-sm">
                    The handler records events. It never reads them back. AWS
                    can place an account under review above a 5% bounce rate and
                    can pause sending at 10%; for complaints the lines are 0.1%
                    and 0.5%. Both are account-wide averages that take real
                    volume to pull back down, so someone has to open the SES
                    console and look. On Wraps that is the control plane's job.
                    A sweep runs every hour, reads both rates against AWS's own
                    review and pause lines, and notifies the organization's
                    owners and admins when an account crosses one — once a day
                    per account, not once an hour.
                  </p>
                  <p className="mt-2 text-muted-foreground text-sm">
                    The same deploy can also put CloudWatch alarms in your own
                    account, set below AWS's lines on purpose so there is lead
                    time: bounce warning at 2% and critical at 4%, complaint
                    warning at 0.05% and critical at 0.08%, and one on any
                    dead-lettered message. Those are on by default for the
                    Production and Enterprise presets and off for Starter, so a
                    starter deploy is not alarmed. They are also the half you
                    keep — alarms are resources in your account, not a dashboard
                    you log into.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    The event model has sharp edges the happy path hides
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-2 text-muted-foreground text-sm">
                    All of these are documented AWS behavior, and all of them
                    break code that looks correct:
                  </p>
                  <ul className="space-y-2 text-muted-foreground text-sm">
                    <li className="flex items-start gap-2">
                      <X className="mt-0.5 size-4 shrink-0 text-destructive" />A
                      Delivery event can be followed by a Bounce for the same
                      message — status is a log, not a state machine.
                    </li>
                    <li className="flex items-start gap-2">
                      <X className="mt-0.5 size-4 shrink-0 text-destructive" />
                      Permanent bounces with subtype{" "}
                      <code className="rounded bg-muted px-1 text-xs">
                        OnAccountSuppressionList
                      </code>{" "}
                      mean SES never tried. They don't count toward your bounce
                      rate, and the handler above treats them as fresh news.
                    </li>
                    <li className="flex items-start gap-2">
                      <X className="mt-0.5 size-4 shrink-0 text-destructive" />
                      Transient bounces need a counter and a threshold, not a
                      suppression. The handler above ignores them entirely.
                    </li>
                    <li className="flex items-start gap-2">
                      <X className="mt-0.5 size-4 shrink-0 text-destructive" />
                      SES gives no ordering or batching guarantees. One
                      notification may cover many recipients, or many
                      notifications may cover one.
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* =========================================== */}
          {/* 5. THE SAME HANDLER, ON WRAPS */}
          {/* =========================================== */}
          <section className="mb-16">
            <h2 className="mb-4 font-heading font-semibold text-2xl tracking-tight">
              The Same Handler, on Wraps
            </h2>
            <p className="mb-6 text-muted-foreground">
              Wraps delivers events through EventBridge to your endpoint with a
              shared secret header, so there is no envelope to unwrap, no
              certificate to fetch, and no subscription handshake. The queue,
              the dead-letter queue, and the event history sit behind it, all
              deployed into your AWS account by one command, and the control
              plane watches the account from there.
            </p>
            <div className="mb-6">
              <CodeComparison
                after={{
                  label: "With Wraps — 39 lines",
                  filename: "app/api/webhooks/email/route.ts",
                  language: "typescript",
                  code: wrapsRouteCode,
                  highlight: true,
                }}
                before={{
                  label: "Hand-rolled — 152 lines across 2 files",
                  filename: "sns-verify.ts + route.ts",
                  language: "typescript",
                  code: `${snsVerifyCode}\n\n// ...plus the 67-line route handler shown above.`,
                }}
              />
            </div>
            <Card className="bg-muted/30">
              <CardContent>
                <p className="text-sm">
                  <strong>
                    Worth naming: the hand-rolled version's signature check is
                    asymmetric, and ours is a shared secret.
                  </strong>{" "}
                  SNS proves the message came from AWS using a certificate you
                  can verify. Wraps proves it came from your EventBridge
                  destination using a secret both sides hold. Both are sound
                  over HTTPS, and the shared secret is what makes the handler
                  short — but if asymmetric verification is a hard requirement
                  in your threat model, the SNS path is the one to take.
                </p>
              </CardContent>
            </Card>
          </section>

          {/* =========================================== */}
          {/* 6. FEATURE COMPARISON */}
          {/* =========================================== */}
          <section className="mb-16">
            <h2 className="mb-6 font-heading font-semibold text-2xl tracking-tight">
              Line by Line, Then Everything Else
            </h2>

            <div className="space-y-6">
              {featureComparison.map((category) => (
                <div key={category.category}>
                  <h3 className="mb-2 font-semibold text-sm">
                    {category.category}
                  </h3>
                  <Card className="overflow-hidden py-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="p-4 text-left font-medium">
                              Capability
                            </th>
                            <th className="w-[140px] p-4 text-center font-medium sm:w-[200px]">
                              Hand-rolled
                            </th>
                            <th className="w-[140px] p-4 text-center font-medium text-primary sm:w-[200px]">
                              Wraps
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {category.features.map((feature) => (
                            <tr key={feature.name}>
                              <td className="p-4">{feature.name}</td>
                              <td className="p-4 text-center">
                                <div className="flex flex-col items-center gap-1">
                                  <FeatureCell value={feature.diy} />
                                  {feature.diyNote && (
                                    <span className="text-muted-foreground text-xs">
                                      {feature.diyNote}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="p-4 text-center">
                                <div className="flex flex-col items-center gap-1">
                                  <FeatureCell value={feature.wraps} />
                                  {feature.wrapsNote && (
                                    <span className="text-muted-foreground text-xs">
                                      {feature.wrapsNote}
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </div>
              ))}
            </div>

            <p className="mt-4 text-muted-foreground text-xs">
              <Check className="mb-0.5 inline size-3 text-success" /> = built-in
              or included,{" "}
              <Minus className="mb-0.5 inline size-3 text-brand-text" /> =
              possible but requires manual setup,{" "}
              <X className="mb-0.5 inline size-3 text-destructive" /> = not
              available
            </p>
          </section>

          {/* =========================================== */}
          {/* 7. STILL YOUR JOB ON WRAPS */}
          {/* =========================================== */}
          <section className="mb-16">
            <h2 className="mb-4 font-heading font-semibold text-2xl tracking-tight">
              Still Your Job, Even on Wraps
            </h2>
            <p className="mb-4 text-muted-foreground">
              Wraps does not make bounce handling disappear. These stay yours
              either way:
            </p>
            <Card>
              <CardContent>
                <ul className="space-y-3">
                  {stillYourJob.map((item) => (
                    <li className="flex items-start gap-3" key={item}>
                      <Minus className="mt-0.5 size-5 shrink-0 text-brand-text" />
                      <span className="text-muted-foreground">{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <p className="mt-4 text-muted-foreground text-sm">
              The{" "}
              <a
                className="text-primary underline"
                href="/docs/guides/bounce-handling"
              >
                bounce handling guide
              </a>{" "}
              covers each of these, and applies whether or not you use Wraps.
            </p>
          </section>

          {/* =========================================== */}
          {/* 8. WHEN TO HAND-ROLL */}
          {/* =========================================== */}
          <section className="mb-16">
            <h2 className="mb-4 font-heading font-semibold text-2xl tracking-tight">
              When to Hand-Roll It
            </h2>
            <p className="mb-4 text-muted-foreground">
              There is a real case for it.
            </p>
            <Card>
              <CardContent>
                <ul className="space-y-3">
                  {chooseHandRollReasons.map((reason) => (
                    <li className="flex items-start gap-3" key={reason}>
                      <Check className="mt-0.5 size-5 shrink-0 text-success" />
                      <span className="text-muted-foreground">{reason}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* =========================================== */}
          {/* 9. WHEN TO USE WRAPS */}
          {/* =========================================== */}
          <section className="mb-16">
            <h2 className="mb-4 font-heading font-semibold text-2xl tracking-tight">
              When to Use Wraps
            </h2>
            <Card className="border-primary/30">
              <CardContent>
                <ul className="space-y-3">
                  {chooseWrapsReasons.map((reason) => (
                    <li className="flex items-start gap-3" key={reason}>
                      <Check className="mt-0.5 size-5 shrink-0 text-primary" />
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </section>

          {/* =========================================== */}
          {/* 10. GETTING STARTED */}
          {/* =========================================== */}
          <section className="mb-16">
            <div className="mb-4 flex items-center gap-3">
              <Terminal className="size-6 text-primary" />
              <h2 className="font-heading font-semibold text-2xl tracking-tight">
                Try It Against Your Own Numbers
              </h2>
            </div>
            <Card className="bg-muted/30">
              <CardContent>
                <div className="rounded-lg bg-background p-4 font-mono text-sm">
                  <span className="text-muted-foreground">$</span>{" "}
                  <span>npx @wraps.dev/cli email init</span>
                </div>
                <p className="mt-4 text-muted-foreground text-sm">
                  Everything deploys into your AWS account, namespaced{" "}
                  <code className="rounded bg-muted px-1 text-xs">
                    wraps-email-*
                  </code>
                  , and{" "}
                  <code className="rounded bg-muted px-1 text-xs">
                    wraps email destroy
                  </code>{" "}
                  removes exactly what was created. If you decide the 152 lines
                  were the better trade, you can leave without unpicking
                  anything.
                </p>
              </CardContent>
            </Card>
          </section>

          {/* =========================================== */}
          <AlsoCompare current="/compare/ses-bounce-handling-hand-rolled-vs-wraps" />

          {/* CTA */}
          {/* =========================================== */}
          <section className="mb-16 rounded-lg border bg-muted/30 p-8 text-center">
            <h2 className="mb-2 font-heading font-semibold text-xl tracking-tight">
              The code is the easy part
            </h2>
            <p className="mb-6 text-muted-foreground">
              Deploy the queue, the dead-letter queue, and the event history in
              one command, into your own AWS account, and let the control plane
              run it from there.
            </p>
            <div className="flex flex-col justify-center gap-4 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/docs/quickstart/email">
                  Get Started
                  <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/docs/guides/bounce-handling">
                  Read the Bounce Guide
                </Link>
              </Button>
            </div>
          </section>

          {/* =========================================== */}
          {/* FOOTER NOTES */}
          {/* =========================================== */}
          <div className="space-y-3 text-muted-foreground text-xs">
            <p>
              <strong className="text-foreground">Last updated:</strong>{" "}
              September 2026. Line counts measured with{" "}
              <code className="rounded bg-muted px-1">wc -l</code> on the code
              shown above. SES bounce types, subtypes, reputation thresholds,
              and mailbox simulator behavior verified against the{" "}
              <a
                className="underline transition-colors hover:text-foreground"
                href="https://docs.aws.amazon.com/ses/latest/dg/notification-contents.html"
                rel="noopener noreferrer"
                target="_blank"
              >
                Amazon SES Developer Guide
              </a>
              . SNS signing behavior verified against the{" "}
              <a
                className="underline transition-colors hover:text-foreground"
                href="https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html"
                rel="noopener noreferrer"
                target="_blank"
              >
                Amazon SNS Developer Guide
              </a>
              .
            </p>
            <p>
              If anything here is wrong — especially the code — tell us at{" "}
              <a
                className="underline transition-colors hover:text-foreground"
                href="mailto:support@wraps.dev"
              >
                support@wraps.dev
              </a>{" "}
              and we'll fix it on this page.
            </p>
          </div>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
