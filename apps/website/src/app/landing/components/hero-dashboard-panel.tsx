import { FlowBox } from "./flow-primitives";

/**
 * Example numbers for the hero's dashboard panel. They are tagged "Example
 * data" on the page and are not a customer's results. Opened and clicked are
 * shares of delivered.
 */
const EXAMPLE = {
  title: "November product update",
  from: "news@yourcompany.com",
  audience: "All customers",
  sent: 12_480,
  delivered: 12_368,
  opened: 3958,
  clicked: 387,
} as const;

const pct = (part: number, whole: number) => (part / whole) * 100;
const fmt = new Intl.NumberFormat("en-US");

const STATS = [
  { label: "Sent", value: fmt.format(EXAMPLE.sent) },
  {
    label: "Delivered",
    value: `${pct(EXAMPLE.delivered, EXAMPLE.sent).toFixed(1)}%`,
  },
  {
    label: "Opened",
    value: `${Math.round(pct(EXAMPLE.opened, EXAMPLE.delivered))}%`,
  },
  {
    label: "Clicked",
    value: `${pct(EXAMPLE.clicked, EXAMPLE.delivered).toFixed(1)}%`,
  },
];

const FUNNEL = [
  { label: "Delivered", count: EXAMPLE.delivered, bar: "bg-success" },
  { label: "Opened", count: EXAMPLE.opened, bar: "bg-info" },
  { label: "Clicked", count: EXAMPLE.clicked, bar: "bg-brand" },
];

export function HeroDashboardPanel() {
  return (
    <figure className="relative m-0 w-full">
      <FlowBox label="Dashboard · Broadcasts">
        <span className="absolute -top-2.5 right-3 bg-background px-2 font-sans font-semibold text-2xs text-muted-foreground uppercase tracking-eyebrow">
          Example data
        </span>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold text-foreground">{EXAMPLE.title}</p>
            <p className="mt-0.5 text-muted-foreground text-xs">
              From {EXAMPLE.from} · to {EXAMPLE.audience}
            </p>
          </div>
          <span className="shrink-0 border border-border px-2 py-0.5 text-muted-foreground text-xs">
            Sent
          </span>
        </div>

        <dl className="mt-4 grid grid-cols-2 border-border border-y sm:grid-cols-4">
          {STATS.map((stat) => (
            <div
              className="flex flex-col-reverse border-border px-3 py-3 not-last:border-r nth-2:border-r-0 sm:nth-2:border-r"
              key={stat.label}
            >
              <dd className="font-heading font-semibold text-2xl text-foreground tabular-nums">
                {stat.value}
              </dd>
              <dt className="text-muted-foreground text-xs">{stat.label}</dt>
            </div>
          ))}
        </dl>

        <ul aria-hidden="true" className="mt-4 grid gap-2">
          {FUNNEL.map((row) => (
            <li
              className="grid grid-cols-[4.5rem_minmax(0,1fr)_3rem] items-center gap-3 text-muted-foreground text-xs"
              key={row.label}
            >
              <span>{row.label}</span>
              <span className="block h-2 bg-muted">
                <span
                  className={`block h-2 w-(--w) min-w-1 ${row.bar}`}
                  style={
                    {
                      "--w": `${pct(row.count, EXAMPLE.delivered).toFixed(1)}%`,
                    } as React.CSSProperties
                  }
                />
              </span>
              <span className="text-right tabular-nums">
                {fmt.format(row.count)}
              </span>
            </li>
          ))}
        </ul>

        <FlowBox className="mt-5" dashed label="Your AWS account">
          <p className="text-foreground text-sm leading-relaxed">
            <strong className="font-semibold">
              Sent from your own AWS account.
            </strong>{" "}
            <span className="text-muted-foreground">
              Amazon bills you directly. Wraps adds nothing per email.
            </span>
          </p>
        </FlowBox>
      </FlowBox>
      <figcaption className="sr-only">
        Example of the Wraps dashboard after a newsletter went out: sent,
        delivered, opened and clicked, with the note that the email was sent
        from your own AWS account.
      </figcaption>
    </figure>
  );
}
