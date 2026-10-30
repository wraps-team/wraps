import { Card, CardContent } from "@wraps/ui/components/ui/card";
import { Fingerprint, Gauge, Inbox, ListChecks, PowerOff } from "lucide-react";

// Order matters and is load-bearing: the enforcer Lambda runs these checks in
// exactly this sequence (packages/core/lambda/agent-enforcer/index.ts).
const checks = [
  {
    icon: PowerOff,
    step: "01",
    title: "Kill switch",
    outcome: "blocked",
    tone: "text-destructive",
    description:
      "A killed agent stops sending as soon as the kill syncs to your enforcer, and killing is permanent. No IAM console, no key rotation, one click.",
  },
  {
    icon: Fingerprint,
    step: "02",
    title: "Sender pin",
    outcome: "blocked",
    tone: "text-destructive",
    description:
      "An agent can only send as its own address. It cannot borrow billing@ or ceo@, even though the enforcer itself holds broader SES permission.",
  },
  {
    icon: ListChecks,
    step: "03",
    title: "Recipient allowlist",
    outcome: "pending_approval",
    tone: "text-warning",
    description:
      "A send to someone off the list isn't rejected, it's queued. The agent keeps working; the decision moves to you.",
  },
  {
    icon: Gauge,
    step: "04",
    title: "Hourly and daily caps",
    outcome: "pending_approval",
    tone: "text-warning",
    description:
      "New agents start at 20 sends an hour and 100 a day. Past the cap, sends queue instead of going out. A runaway loop becomes a full inbox, not an incident.",
  },
];

export function AgentsLeashSection() {
  return (
    <section className="py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 max-w-3xl">
          <h2 className="mb-3 font-bold text-3xl tracking-tight sm:text-4xl">
            The leash runs in your AWS account.
          </h2>
          <p className="text-lg text-muted-foreground">
            Enforcement isn't a proxy in front of Wraps. It's a Lambda in your
            account that every agent send has to pass through. If we go down,
            the leash still holds. If you stop paying us, the leash still holds.
          </p>
        </div>

        <div className="mb-10 grid gap-4 md:grid-cols-2">
          {checks.map((check) => {
            const Icon = check.icon;
            return (
              <Card key={check.step}>
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <Icon className="mt-0.5 size-5 shrink-0 text-brand-text" />
                    <div>
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-mono text-muted-foreground text-xs">
                          {check.step}
                        </span>
                        <h3 className="font-medium">{check.title}</h3>
                        <code
                          className={`rounded bg-muted px-1.5 py-0.5 font-mono text-xs ${check.tone}`}
                        >
                          {check.outcome}
                        </code>
                      </div>
                      <p className="mt-2 text-muted-foreground text-sm">
                        {check.description}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-start gap-3">
              <Inbox className="mt-0.5 size-4 shrink-0 text-brand-text" />
              <div>
                <p className="font-medium">
                  Flagged sends wait in an approval queue.
                </p>
                <p className="mt-1 text-muted-foreground text-sm">
                  Approve or reject from the dashboard. The agent doesn't block
                  waiting for you: it gets an approval ID back and can check the
                  outcome later. A fresh agent starts with an empty allowlist,
                  so every send is queued until you deliberately widen it.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-start gap-3">
              <Fingerprint className="mt-0.5 size-4 shrink-0 text-brand-text" />
              <div>
                <p className="font-medium">
                  An agent can't lie about which agent it is.
                </p>
                <p className="mt-1 text-muted-foreground text-sm">
                  Identity comes from the Lambda alias the credential is pinned
                  to, never from the request body. An agent that claims someone
                  else's ID still gets its own policy applied, because the claim
                  is never what we read.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
