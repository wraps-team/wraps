import { Check, X } from "lucide-react";
import { SectionKicker } from "@/app/landing/components/section-kicker";

const costBreakdown = [
  {
    volume: "10K/mo",
    messages: "$75.00",
    carrier: "$30.00",
    number: "$2.00",
    total: "$107.00",
  },
  {
    volume: "50K/mo",
    messages: "$375.00",
    carrier: "$150.00",
    number: "$2.00",
    total: "$527.00",
  },
  {
    volume: "100K/mo",
    messages: "$750.00",
    carrier: "$300.00",
    number: "$2.00",
    total: "$1,052.00",
  },
];

const featureComparison = [
  { feature: "Own your infrastructure", wraps: true, twilio: false },
  { feature: "Transparent AWS pricing", wraps: true, twilio: false },
  { feature: "No platform markup", wraps: true, twilio: false },
  { feature: "Data residency control", wraps: true, twilio: false },
  { feature: "TypeScript SDK", wraps: true, twilio: true },
  { feature: "Batch sending", wraps: true, twilio: true },
];

const headerCellClass =
  "border-border border-b pb-3 font-mono font-medium text-muted-foreground text-xs uppercase tracking-widest";

export function SmsPricingSection() {
  return (
    <section className="border-border border-t py-16 sm:py-24" id="pricing">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 max-w-2xl">
          <SectionKicker>Pricing</SectionKicker>
          <h2 className="font-heading font-semibold text-3xl tracking-tight sm:text-4xl">
            Transparent pricing
          </h2>
          <p className="mt-3 text-muted-foreground">
            Estimates below: roughly $0.0075/segment plus carrier fees and $2/mo
            for a toll-free number. AWS passes carrier fees through at cost and
            they vary by carrier, so your exact rate comes from AWS. No monthly
            platform subscription, no per-seat fees, and no markup from us.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Cost Breakdown */}
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="border-border border-b px-6 py-4">
              <h3 className="font-mono font-medium text-muted-foreground text-xs uppercase tracking-widest">
                Monthly AWS Cost
              </h3>
            </div>
            <div className="overflow-x-auto p-6">
              <table className="w-full">
                <thead>
                  <tr className="text-left">
                    <th className={headerCellClass}>Segments</th>
                    <th className={headerCellClass}>Messages</th>
                    <th className={headerCellClass}>Carrier</th>
                    <th className={headerCellClass}>Number</th>
                    <th className={headerCellClass}>Total</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {costBreakdown.map((row) => (
                    <tr className="border-border border-t" key={row.volume}>
                      <td className="py-3 font-medium">{row.volume}</td>
                      <td className="py-3 font-mono text-muted-foreground">
                        {row.messages}
                      </td>
                      <td className="py-3 font-mono text-muted-foreground">
                        {row.carrier}
                      </td>
                      <td className="py-3 font-mono text-muted-foreground">
                        {row.number}
                      </td>
                      <td className="py-3 font-mono text-brand-text">
                        {row.total}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-4 text-muted-foreground text-xs">
                * Estimated at $0.0075/segment plus an average $0.003 carrier
                fee and $2/mo for one toll-free number — the same figures{" "}
                <code className="font-mono">wraps sms init</code> quotes. AWS
                does not publish a single US rate: carrier fees are passed
                through at cost and vary by carrier and message type, so your
                exact per-message price shows up in your AWS usage report. You
                pay AWS directly. Wraps Platform sold separately.
              </p>
            </div>
          </div>

          {/* Feature Comparison */}
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="border-border border-b px-6 py-4">
              <h3 className="font-mono font-medium text-muted-foreground text-xs uppercase tracking-widest">
                Feature Comparison
              </h3>
            </div>
            <div className="overflow-x-auto p-6">
              <table className="w-full">
                <thead>
                  <tr className="text-left">
                    <th className={headerCellClass}>Feature</th>
                    <th className={`${headerCellClass} text-center`}>
                      <span className="text-brand-text">Wraps</span>
                    </th>
                    <th className={`${headerCellClass} text-center`}>Twilio</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {featureComparison.map((row) => (
                    <tr className="border-border border-t" key={row.feature}>
                      <td className="py-3">{row.feature}</td>
                      <td className="py-3 text-center">
                        {row.wraps ? (
                          <Check
                            aria-label="Yes"
                            className="mx-auto size-4 text-brand-text"
                          />
                        ) : (
                          <X
                            aria-label="No"
                            className="mx-auto size-4 text-muted-foreground"
                          />
                        )}
                      </td>
                      <td className="py-3 text-center">
                        {row.twilio ? (
                          <Check
                            aria-label="Yes"
                            className="mx-auto size-4 text-foreground"
                          />
                        ) : (
                          <X
                            aria-label="No"
                            className="mx-auto size-4 text-muted-foreground"
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
