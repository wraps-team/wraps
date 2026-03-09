import { DollarSign, HardDrive, LogOut, Users } from "lucide-react";

const proofPoints = [
  {
    icon: DollarSign,
    text: "Pay AWS directly. $0.10 per 1,000 emails.",
  },
  {
    icon: Users,
    text: "Unlimited contacts on every plan. No database tax.",
  },
  {
    icon: HardDrive,
    text: "Full event history in your DynamoDB for compliance.",
  },
  {
    icon: LogOut,
    text: "Leave anytime. Your sending setup and data stay.",
  },
];

export function InfrastructureSection() {
  return (
    <section className="py-24" id="infrastructure">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="animate-fade-in-up">
          <h2 className="mb-4 font-bold text-3xl tracking-tight md:text-4xl">
            Sending infrastructure you actually own.
          </h2>
          <p className="mb-10 max-w-3xl text-lg text-muted-foreground">
            Wraps is the platform — templates, workflows, broadcasts, segments,
            contacts. Your emails send through YOUR SES. Your delivery events
            store in YOUR DynamoDB. You pay AWS directly for sending.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 animate-fade-in-up animation-delay-100">
          {proofPoints.map((point) => {
            const Icon = point.icon;
            return (
              <div
                className="flex items-start gap-4 rounded-lg border p-5 transition-colors hover:border-orange-500/50"
                key={point.text}
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-orange-500/10">
                  <Icon className="size-5 text-orange-500" />
                </div>
                <p className="text-foreground">{point.text}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
