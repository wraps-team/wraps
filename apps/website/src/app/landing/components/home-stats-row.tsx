import { getTier } from "@/config/pricing";

/** The four facts under the hero. The price is the Pro plan's, from config. */
export function HomeStatsRow() {
  const stats = [
    { n: "Unlimited", k: "contacts on every plan" },
    { n: `$${getTier("pro").price}`, k: "flat, at 5K or 100K contacts" },
    { n: "$0", k: "added to what Amazon bills" },
    { n: "No Wraps lock-in", k: "sending keeps running without us" },
  ];
  return (
    <section
      aria-label="Wraps in four facts"
      className="border-border border-b"
    >
      <dl className="mx-auto grid max-w-6xl grid-cols-2 px-4 sm:px-6 md:grid-cols-4 lg:px-8">
        {stats.map((stat) => (
          <div
            className="border-border px-3 py-6 text-center not-last:border-r nth-2:border-r-0 md:nth-2:border-r [&:nth-child(-n+2)]:border-b md:[&:nth-child(-n+2)]:border-b-0"
            key={stat.n}
          >
            <dt className="font-heading font-semibold text-foreground text-xl tracking-tight sm:text-2xl">
              {stat.n}
            </dt>
            <dd className="mt-1 text-muted-foreground text-sm">{stat.k}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
