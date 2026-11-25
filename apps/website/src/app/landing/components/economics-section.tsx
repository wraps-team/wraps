import { AWS_PRICING, formatCurrency } from "@/config/pricing";
import { estimateCost, SES_PLANS, type SesPlanId } from "@/lib/ses-cost";
import { AmazonCostCard, type AmazonCostRow } from "./amazon-cost-card";
import { ContactFeeChart } from "./contact-fee-chart";
import { SectionHead } from "./section-head";

// The same four volumes and the same inputs as the worked examples in
// pricing.md (`exampleEstimate` in lib/pricing-markdown.ts): no custom events,
// Free plan, each SES plan in turn. The figures are all-in, pipeline included.
const VOLUMES = [
  { label: "10K", emails: 10_000 },
  { label: "100K", emails: 100_000 },
  { label: "500K", emails: 500_000 },
  { label: "1M", emails: 1_000_000 },
];

const money = (amount: number) => `$${amount.toFixed(2)}`;

function allIn(emails: number, sesPlan: SesPlanId): string {
  return money(
    estimateCost({
      emailsPerMonth: emails,
      eventsPerMonth: 0,
      tier: "free",
      sesPlan,
    }).total
  );
}

const perThousand = (plan: SesPlanId) =>
  `$${SES_PLANS[plan].perThousandEmails.toFixed(2)} per 1,000`;

export function EconomicsSection() {
  const rows: AmazonCostRow[] = VOLUMES.map((v) => ({
    ...v,
    alacarte: allIn(v.emails, "alacarte"),
    essentials: allIn(v.emails, "essentials"),
  }));
  const free = estimateCost({
    emailsPerMonth: 0,
    eventsPerMonth: 0,
    tier: "free",
    sesPlan: "alacarte",
  }).wraps.total;

  return (
    <section className="border-border border-b py-16 md:py-20" id="cost">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionHead
          kicker="The economics"
          title="Your list grows. Your platform bill doesn't."
        >
          Most email platforms charge for every contact you store. Wraps charges
          a flat plan fee with unlimited contacts. Amazon bills each email you
          send, at its own rates, with nothing added by us.
        </SectionHead>
        <div className="grid items-start gap-8 lg:grid-cols-[1.4fr_1fr]">
          <ContactFeeChart contacts={[5000, 50_000, 100_000]} />
          <div>
            <AmazonCostCard
              labels={{
                alacarte: `Amazon, ${SES_PLANS.alacarte.name.toLowerCase()} (${perThousand("alacarte")})`,
                essentials: `Amazon, ${SES_PLANS.essentials.name} (${perThousand("essentials")}), the default`,
              }}
              rows={rows}
              wrapsFree={formatCurrency(free)}
            />
            <p className="mt-3 text-muted-foreground text-xs leading-relaxed">
              From the{" "}
              <a
                className="underline underline-offset-2 hover:text-foreground"
                href="/pricing.md"
              >
                worked examples in pricing
              </a>
              : no custom events, 90-day history, no dedicated IP (a dedicated
              IP is {money(AWS_PRICING.dedicatedIpMonthly)} a month more). The
              Amazon bill grows with what you send; the Wraps plan doesn&apos;t.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
