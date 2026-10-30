import { Eye, LogOut, Wallet } from "lucide-react";
import { SectionKicker } from "@/app/landing/components/section-kicker";

const cards = [
  {
    icon: Wallet,
    title: "Economics",
    description:
      "You pay AWS directly for sending. SES à la carte is $0.10 per 1,000 emails; AWS now defaults new accounts to the Essentials plan at $0.16, and Wraps tells you which one applies. No markup from Wraps, and unlimited contacts on every plan.",
  },
  {
    icon: LogOut,
    title: "Ownership",
    description:
      "Your domain reputation and delivery history live in your AWS account, not ours. They stay there, and keep working, if you stop paying Wraps.",
  },
  {
    icon: Eye,
    title: "Auditability",
    description:
      "Every resource Wraps creates is namespaced wraps-email-*. Find it in your own AWS console, query it, and see every call to it in your own CloudTrail.",
  },
];

export function WhyByocSection() {
  return (
    <section className="py-16">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <SectionKicker>Why BYOC for email</SectionKicker>
        <h2 className="mb-10 font-heading font-semibold text-2xl tracking-tight sm:text-3xl">
          Sending infrastructure you own, not infrastructure you rent.
        </h2>

        <div className="grid gap-4 sm:grid-cols-3">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                className="rounded-lg border border-border bg-background/50 p-6"
                key={card.title}
              >
                <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-brand/10">
                  <Icon aria-hidden="true" className="size-5 text-brand-text" />
                </div>
                <h3 className="mb-2 font-medium">{card.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {card.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
