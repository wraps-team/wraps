import { Clock, DollarSign, Server } from "lucide-react";
import { SectionKicker } from "@/app/landing/components/section-kicker";

const valueProps = [
  {
    icon: Clock,
    title: "Toll-Free First",
    description:
      "Provision a number ($2/mo) and register it in 1-15 business days. Skip the months-long 10DLC nightmare and start sending in days, not weeks.",
    highlight: "Days, not months",
  },
  {
    icon: Server,
    title: "Self-Hosted Infrastructure",
    description:
      "Deploy to your AWS account. You own your phone numbers, your data, and your infrastructure. No vendor lock-in, full data residency control.",
    highlight: "Your AWS account",
  },
  {
    icon: DollarSign,
    title: "AWS Pricing",
    description:
      "Pay AWS directly — roughly $0.0075/segment plus carrier fees, which AWS passes through at cost. No platform markups, no surprise fees. Just transparent cloud pricing you can actually understand.",
    highlight: "~$0.01/segment all-in",
  },
];

export function SmsValuePropsSection() {
  return (
    <section className="border-border border-t py-16 sm:py-24" id="why-wraps">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 max-w-2xl">
          <SectionKicker>Why Wraps SMS?</SectionKicker>
          <h2 className="font-heading font-semibold text-3xl tracking-tight sm:text-4xl">
            SMS without the headaches
          </h2>
          <p className="mt-3 text-muted-foreground">
            The same BYOC model that makes our email product compelling, now for
            SMS.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {valueProps.map((prop) => (
            <div
              className="flex flex-col rounded-xl border border-border bg-card p-6 transition-colors hover:border-brand/40"
              key={prop.title}
            >
              <prop.icon
                aria-hidden="true"
                className="mb-4 size-5 text-brand-text"
              />
              <h3 className="mb-2 font-medium">{prop.title}</h3>
              <p className="flex-1 text-muted-foreground text-sm">
                {prop.description}
              </p>
              <div className="mt-5 border-border border-t pt-4 font-mono text-sm text-foreground">
                {prop.highlight}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
