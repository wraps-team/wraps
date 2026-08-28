// Contact-based pricing, drawn as the thing it actually is: a bill indexed to
// list size. Competitor figures verified July 2026 —
// Customer.io Essentials $100/mo per 5K profiles then $0.009/profile;
// Klaviyo $150 @10K, $720 @50K, $1,380 @100K profiles.

const rows = [
  { contacts: "5,000", customerIo: "$100", klaviyo: "$100", wraps: "$19" },
  { contacts: "10,000", customerIo: "$145", klaviyo: "$150", wraps: "$19" },
  { contacts: "50,000", customerIo: "$505", klaviyo: "$720", wraps: "$19" },
  { contacts: "100,000", customerIo: "$955", klaviyo: "$1,380", wraps: "$19" },
];

export function ContactPriceCurve() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card/80 shadow-sm backdrop-blur">
      <div className="border-border border-b px-4 py-3">
        <span className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.14em]">
          monthly platform fee by list size
        </span>
      </div>

      <table className="w-full text-left">
        <thead>
          <tr className="border-border/60 border-b font-mono text-[11px] text-muted-foreground uppercase tracking-[0.1em]">
            <th className="px-4 py-2.5 font-normal">Contacts</th>
            <th className="px-3 py-2.5 font-normal">Customer.io</th>
            <th className="px-3 py-2.5 font-normal">Klaviyo</th>
            <th className="px-4 py-2.5 text-right font-normal text-orange-500">
              Wraps
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60 font-mono text-[12.5px] tabular-nums">
          {rows.map((row) => (
            <tr key={row.contacts}>
              <td className="px-4 py-2.5 text-muted-foreground">
                {row.contacts}
              </td>
              <td className="px-3 py-2.5 text-muted-foreground">
                {row.customerIo}
              </td>
              <td className="px-3 py-2.5 text-muted-foreground">
                {row.klaviyo}
              </td>
              <td className="px-4 py-2.5 text-right font-medium text-foreground">
                {row.wraps}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="border-border border-t bg-muted/40 px-4 py-3">
        <p className="text-[12px] text-muted-foreground leading-relaxed">
          Wraps tiers move on tracked events, not list size, and sending is
          billed by AWS directly at SES rates. Competitor figures verified July
          2026.
        </p>
      </div>
    </div>
  );
}
