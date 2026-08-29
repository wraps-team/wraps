import { Card, CardContent } from "@wraps/ui/components/ui/card";
import {
  AlertTriangle,
  ArrowRight,
  Mail,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";

const differentiators = [
  {
    name: "Resend",
    tradeoff:
      "Hosted, not owned — your domain reputation lives in their shared pool.",
  },
  {
    name: "Cloudflare Email for Agents",
    tradeoff:
      "Runs in their network — you don't see the AWS bill or keep the infra after you churn.",
  },
  {
    name: "AgentMail",
    tradeoff:
      "Agent-specific, third-party sender — still their infra, still their reputation.",
  },
  {
    name: "Bavimail",
    tradeoff:
      "Per-agent inboxes on your domain, but the sending account and its reputation stay theirs.",
  },
];

export function AgentsTrustSection() {
  return (
    <section className="py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 max-w-3xl">
          <h2 className="mb-3 font-bold text-3xl tracking-tight sm:text-4xl">
            Transactional, not outreach.
          </h2>
          <p className="text-lg text-muted-foreground">
            Wraps is built for agents that send reports, replies, and
            notifications from your domain — the mail you'd send yourself if you
            were at the keyboard. It is not a tool for prospecting.
          </p>
        </div>

        <div className="mb-10 grid gap-3">
          <div className="flex items-start gap-3">
            <Mail className="mt-1 size-4 shrink-0 text-orange-500" />
            <p className="text-muted-foreground">
              Agents send to people who already expect mail from you —
              customers, teammates, subscribers.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-1 size-4 shrink-0 text-orange-500" />
            <p className="text-muted-foreground">
              DKIM, SPF, and DMARC sign every message from your domain. If an
              agent misbehaves, your DMARC report surfaces it before an ISP
              does.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-1 size-4 shrink-0 text-orange-500" />
            <p className="text-muted-foreground">
              Prospecting and unsolicited mail violate the AWS SES Acceptable
              Use Policy and will burn your sending domain. Don't ship that;
              neither will we.
            </p>
          </div>
        </div>

        <div className="mb-10 rounded-lg border border-border bg-card p-5">
          <div className="flex items-start gap-3">
            <MessageSquare className="mt-0.5 size-4 shrink-0 text-orange-500" />
            <div>
              <p className="font-medium">
                Signed reply-to threading, now in beta.
              </p>
              <p className="mt-1 text-muted-foreground text-sm">
                When a recipient replies, your inbound Lambda verifies the{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  Reply-To
                </code>{" "}
                header against an HMAC secret your AWS account owns. The event
                arrives with a{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  replyToken
                </code>{" "}
                carrying a verified{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  conversationId
                </code>{" "}
                — no database round-trip, no spoofable header chain. Wraps never
                sees the secret.
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <Link
                  className="inline-flex items-center gap-1 text-orange-500 text-sm underline decoration-orange-500/30 underline-offset-4 hover:decoration-orange-500/60"
                  href="/docs/guides/reply-threading"
                >
                  Guide
                  <ArrowRight className="size-3" />
                </Link>
                <Link
                  className="inline-flex items-center gap-1 text-sm text-muted-foreground underline decoration-muted-foreground/30 underline-offset-4 hover:text-foreground hover:decoration-muted-foreground/60"
                  href="/blog/signed-reply-threading"
                >
                  Read the writeup
                  <ArrowRight className="size-3" />
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-4">
          <h3 className="font-semibold text-xl">
            Where Wraps fits in the agent-email landscape.
          </h3>
          <p className="mt-1 text-muted-foreground">
            The differentiator isn't volume or features. It's that you own both
            the rails and the leash.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {differentiators.map((item) => (
            <Card key={item.name}>
              <CardContent className="p-5">
                <p className="font-medium">{item.name}</p>
                <p className="mt-1 text-muted-foreground text-sm">
                  {item.tradeoff}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
