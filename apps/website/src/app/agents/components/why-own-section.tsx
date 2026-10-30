import { Card, CardContent } from "@wraps/ui/components/ui/card";
import { DoorOpen, KeyRound, ShieldCheck } from "lucide-react";

const reasons = [
  {
    icon: ShieldCheck,
    title: "Your reputation",
    description:
      "DKIM, SPF, and DMARC sign from your domain — not a shared pool. When inbox providers decide whether to trust a sender, they look at you.",
  },
  {
    icon: KeyRound,
    title: "Your credentials",
    description:
      "The CLI assumes a role in your AWS account. Nothing stored on our side. Rotate, revoke, or leave without touching a dashboard.",
  },
  {
    icon: DoorOpen,
    title: "Your exit path",
    description:
      "Every SES identity, Lambda, and EventBridge rule stays in your account when you leave. Uninstall Wraps; keep the infra.",
  },
];

export function AgentsWhyOwnSection() {
  return (
    <section className="py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 max-w-3xl">
          <h2 className="mb-3 font-bold text-3xl tracking-tight sm:text-4xl">
            Why ownership matters for agents.
          </h2>
          <p className="text-lg text-muted-foreground">
            Agents act on your behalf. The domain they send from, the IAM role
            they call, the analytics they emit — all of it should live where you
            can audit, rotate, and revoke.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {reasons.map((reason) => {
            const Icon = reason.icon;
            return (
              <Card
                className="transition-colors hover:border-brand/40"
                key={reason.title}
              >
                <CardContent className="p-6">
                  <div className="flex items-start gap-3">
                    <Icon className="h-6 w-6 shrink-0 text-brand-text" />
                    <div>
                      <h3 className="font-medium">{reason.title}</h3>
                      <p className="mt-1 text-muted-foreground text-sm">
                        {reason.description}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
