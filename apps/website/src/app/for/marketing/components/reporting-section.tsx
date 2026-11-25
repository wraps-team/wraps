import { FlowBox } from "@/app/landing/components/flow-primitives";
import { SectionKicker } from "@/app/landing/components/section-kicker";

// Example rates, tagged as example data on the page.
const FUNNEL = [
  { label: "Sent", value: 100, bar: "bg-foreground" },
  { label: "Delivered", value: 99, bar: "bg-success" },
  { label: "Opened", value: 32, bar: "bg-info" },
  { label: "Clicked", value: 3, bar: "bg-brand" },
] as const;

const SMALL = [
  { title: "Per link", body: "Which link did the work" },
  { title: "Per message", body: "Every event, in order" },
  { title: "Per broadcast", body: "Every step, sent to clicked" },
];

export function MarketingReportingSection() {
  return (
    <section className="border-border border-y bg-muted/30 py-16 sm:py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8">
        <div>
          <SectionKicker>Reporting</SectionKicker>
          <h2 className="mb-4 font-heading font-semibold text-3xl tracking-tight sm:text-4xl">
            An open rate you can defend in a meeting.
          </h2>
          {/* email-bot-detection.ts filters scanner and bot user agents */}
          <p className="max-w-md text-lg text-muted-foreground leading-relaxed">
            Known scanner and bot opens are filtered out, so the number in your
            deck is closer to real people opening your email.
          </p>
        </div>

        <FlowBox label="Broadcast · Results">
          <div className="grid gap-2.5">
            {FUNNEL.map((row) => (
              <div
                className="grid grid-cols-[4.5rem_minmax(0,1fr)_2.5rem] items-center gap-3 text-xs"
                key={row.label}
              >
                <span className="text-muted-foreground">{row.label}</span>
                <span aria-hidden="true" className="block h-2 bg-border">
                  <span
                    className={`block h-full w-(--w) ${row.bar}`}
                    style={{ "--w": `${row.value}%` } as React.CSSProperties}
                  />
                </span>
                <span className="text-right tabular-nums">{row.value}%</span>
              </div>
            ))}
          </div>
          <ul className="mt-5 grid gap-2 sm:grid-cols-3">
            {SMALL.map((item) => (
              <li className="border border-border p-3" key={item.title}>
                <b className="block font-semibold text-xs">{item.title}</b>
                <span className="text-muted-foreground text-xs">
                  {item.body}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 inline-block border border-border px-2 py-0.5 text-muted-foreground text-xs">
            Example data
          </p>
        </FlowBox>
      </div>
    </section>
  );
}
