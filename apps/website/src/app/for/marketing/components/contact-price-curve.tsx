// Contact-based pricing, drawn as the thing it actually is: a bill indexed to
// list size. Figures and their check date live in
// config/competitor-contact-pricing.ts; the Wraps fee is the Pro plan's.
import {
  CONTACT_PRICE_ROWS,
  CONTACT_PRICES_CHECKED,
} from "@/config/competitor-contact-pricing";
import { formatCurrency, formatNumber, getTier } from "@/config/pricing";

export function ContactPriceCurve() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card/80 shadow-sm backdrop-blur">
      <div className="border-border border-b px-4 py-3">
        <span className="font-mono text-2xs text-muted-foreground uppercase tracking-eyebrow">
          monthly platform fee by list size
        </span>
      </div>

      <table className="w-full text-left">
        <thead>
          <tr className="border-border/60 border-b font-mono text-2xs text-muted-foreground uppercase tracking-widest">
            <th className="px-4 py-2.5 font-normal">Contacts</th>
            <th className="px-3 py-2.5 font-normal">Customer.io</th>
            <th className="px-3 py-2.5 font-normal">Klaviyo</th>
            <th className="px-4 py-2.5 text-right font-normal text-brand-text">
              Wraps
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60 font-mono text-xs tabular-nums">
          {CONTACT_PRICE_ROWS.map((row) => (
            <tr key={row.contacts}>
              <td className="px-4 py-2.5 text-muted-foreground">
                {formatNumber(row.contacts)}
              </td>
              <td className="px-3 py-2.5 text-muted-foreground">
                {formatCurrency(row.customerIo)}
              </td>
              <td className="px-3 py-2.5 text-muted-foreground">
                {formatCurrency(row.klaviyo)}
              </td>
              <td className="px-4 py-2.5 text-right font-medium text-foreground">
                {formatCurrency(getTier("pro").price)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="border-border border-t bg-muted/40 px-4 py-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Wraps' fee is flat by plan, not by list size, and sending is billed by
          AWS directly at SES rates. Competitor figures verified {CONTACT_PRICES_CHECKED}.
        </p>
      </div>
    </div>
  );
}
