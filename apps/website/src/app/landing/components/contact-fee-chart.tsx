import {
  CONTACT_PRICE_ROWS,
  CONTACT_PRICES_CHECKED,
} from "@/config/competitor-contact-pricing";
import { formatCurrency, formatNumber, getTier } from "@/config/pricing";
import { FlowBox } from "./flow-primitives";

const SERIES = [
  { key: "customerIo", label: "Customer.io", bar: "bg-muted-foreground" },
  { key: "klaviyo", label: "Klaviyo", bar: "bg-info" },
  { key: "wraps", label: "Wraps Pro", bar: "bg-brand" },
] as const;

/**
 * Platform fee by list size: Customer.io and Klaviyo against Wraps Pro, as
 * grouped bars in a labelled box. Every plan and competitor figure comes from
 * config; pages import this chart and never draw their own.
 *
 * `contacts` limits the groups (the homepage shows three of the four).
 * `note` is a sentence added after "Platform fee only.".
 */
export function ContactFeeChart({
  contacts,
  note,
  className = "",
}: {
  contacts?: number[];
  note?: string;
  className?: string;
}) {
  const proPrice = getTier("pro").price;
  const rows = contacts
    ? CONTACT_PRICE_ROWS.filter((row) => contacts.includes(row.contacts))
    : CONTACT_PRICE_ROWS;
  const max = Math.max(
    proPrice,
    ...rows.flatMap((row) => [row.customerIo, row.klaviyo])
  );
  const pct = (value: number) => `${((value / max) * 100).toFixed(1)}%`;

  return (
    <FlowBox className={className} label="Platform fee by list size">
      <ul
        aria-hidden="true"
        className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-xs"
      >
        {SERIES.map((series) => (
          <li className="inline-flex items-center gap-1.5" key={series.key}>
            <span className={`size-2.5 ${series.bar}`} />
            {series.label}
          </li>
        ))}
      </ul>

      <div className="grid gap-4">
        {rows.map((row, index) => {
          const values = {
            customerIo: row.customerIo,
            klaviyo: row.klaviyo,
            wraps: proPrice,
          };
          return (
            <div className="grid gap-1" key={row.contacts}>
              <span className="font-semibold text-foreground text-xs">
                {formatNumber(row.contacts)}
                {index === 0 ? " contacts" : ""}
              </span>
              {SERIES.map((series) => (
                <div
                  className="grid grid-cols-[minmax(0,1fr)_3.6rem] items-center gap-2.5"
                  key={series.key}
                >
                  <span aria-hidden="true" className="block">
                    <span
                      className={`block h-2 w-(--w) min-w-1 ${series.bar}`}
                      style={
                        {
                          "--w": pct(values[series.key]),
                        } as React.CSSProperties
                      }
                    />
                  </span>
                  <span className="text-right text-muted-foreground text-xs tabular-nums">
                    <span className="sr-only">{series.label}: </span>
                    {formatCurrency(values[series.key])}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-muted-foreground text-xs leading-relaxed">
        Platform fee only. {note ? `${note} ` : ""}Competitor prices checked{" "}
        {CONTACT_PRICES_CHECKED}.
      </p>
    </FlowBox>
  );
}
