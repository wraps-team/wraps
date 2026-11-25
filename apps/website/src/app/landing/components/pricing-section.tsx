import { Button } from "@wraps/ui/components/ui/button";
import { Check } from "lucide-react";
import { getTier, TIER_LIMITS, type TierId } from "@/config/pricing";
import { FlowBox } from "./flow-primitives";
import { SectionHead } from "./section-head";

const history = (tier: TierId) => {
  const days = TIER_LIMITS[tier].historyDays;
  return days >= 365 ? `${days / 365}-year history` : `${days}-day history`;
};

// The mock's wording for each plan, with every figure read from config/pricing.ts.
// PRICING_TIERS.features stays as it is: pricing.md and other pages render it.
const PLANS: {
  id: TierId;
  label: string;
  desc: string;
  cta: string;
  bullets: string[];
}[] = [
  {
    id: "free",
    label: "Start here",
    desc: "Try it with your AWS account.",
    cta: "Start free",
    bullets: [
      "Unlimited sends, domains and contacts",
      "Newsletters to all contacts",
      `${TIER_LIMITS.free.workflows} automations`,
      history("free"),
    ],
  },
  {
    id: "pro",
    label: "Recommended",
    desc: "For small teams sending every week.",
    cta: "Start with Pro",
    bullets: [
      "Everything in Free",
      "Unlimited automations",
      "Send to segments, schedule sends",
      `${TIER_LIMITS.pro.aiGenerations} AI-written templates a month`,
      history("pro"),
    ],
  },
  {
    id: "business",
    label: "For larger teams",
    desc: "For companies with several AWS accounts.",
    cta: "Start with Business",
    bullets: [
      "Everything in Pro",
      "Unlimited AWS accounts",
      "Single sign-on and audit log",
      `${history("business")}, priority support`,
    ],
  },
];

export function PricingSection() {
  return (
    <section className="border-border border-b py-16 md:py-20" id="pricing">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionHead
          kicker="Plans"
          title="Start free. Keep control as you grow."
        >
          Every plan includes unlimited sends, contacts, domains and team
          members.
        </SectionHead>
        <div className="grid gap-8 md:grid-cols-3">
          {PLANS.map((plan) => {
            const tier = getTier(plan.id);
            return (
              <FlowBox
                className="flex h-full flex-col"
                dashed={plan.id === "pro"}
                key={plan.id}
                label={plan.label}
              >
                <h3 className="font-semibold text-foreground text-lg">
                  {tier.name}
                </h3>
                <p className="mt-3 font-heading font-semibold text-4xl text-foreground tracking-tight">
                  ${tier.price}{" "}
                  <small className="font-sans tracking-normal font-normal text-muted-foreground text-sm">
                    {tier.price === 0 ? "you pay AWS directly" : "per month"}
                  </small>
                </p>
                <p className="mt-2 text-muted-foreground text-sm">
                  {plan.desc}
                </p>
                <ul className="my-5 grid flex-1 content-start gap-2.5">
                  {plan.bullets.map((bullet) => (
                    <li
                      className="flex gap-2.5 text-muted-foreground text-sm leading-normal"
                      key={bullet}
                    >
                      <Check
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-brand-text"
                      />
                      {bullet}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto grid">
                  <Button
                    asChild
                    variant={plan.id === "pro" ? "brand" : "outline"}
                  >
                    <a href={tier.ctaLink}>{plan.cta}</a>
                  </Button>
                </div>
              </FlowBox>
            );
          })}
        </div>
        <p className="mt-6 text-muted-foreground text-sm">
          No sales call on any plan. Amazon&apos;s sending charges are billed to
          you by AWS.{" "}
          <a
            className="text-foreground underline underline-offset-4 hover:text-brand-text"
            href="/tools/ses-calculator"
          >
            Estimate your sending costs
          </a>
          .
        </p>
      </div>
    </section>
  );
}
