import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { WRAPPER_CRITERIA, WRAPS_LIMITS } from "@/config/approaches";
import { SectionKicker } from "./section-kicker";

/*
 * The proof for the claim the section above it makes: of the open-source SES
 * wrappers, the thing that still separates them is whether anything watches the
 * account once you are sending.
 *
 * Rows come from WRAPPER_CRITERIA, the same test-pinned source the /approaches
 * page renders, so this table and that page cannot drift. The cells are text,
 * not check marks, on purpose: "Emits a webhook" and "Domain verification" are
 * not the same claim as "No". The last row is the one nobody in this category
 * can win, and it stays.
 *
 * Hosted sending APIs are not in the table. Most of these questions do not
 * apply to them; they are compared on price on /compare and in the pricing
 * section.
 */

// The three limits that decide whether a reader should keep going.
const LIMITS_SHOWN = WRAPS_LIMITS.slice(0, 3);

export function OperationsCompareSection() {
  return (
    <section className="border-border border-b py-20 md:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionKicker>After the first send</SectionKicker>
        <h2 className="mb-10 max-w-[26ch] font-heading font-semibold text-3xl text-foreground leading-none tracking-tight md:text-4xl">
          Every SES wrapper deploys. Few of them operate.
        </h2>

        <div className="border-border border-t">
          <div
            aria-hidden="true"
            className="hidden border-border border-b py-3 font-mono text-muted-foreground text-xs uppercase tracking-widest md:grid md:grid-cols-[1.1fr_0.7fr_1.4fr] md:gap-x-8"
          >
            <span>The question</span>
            <span>Other SES wrappers</span>
            <span className="border-brand border-l-2 pl-4 text-foreground">
              Wraps
            </span>
          </div>

          {WRAPPER_CRITERIA.map((row) => (
            <div
              className="grid gap-y-3 border-border border-b py-5 md:grid-cols-[1.1fr_0.7fr_1.4fr] md:gap-x-8"
              key={row.question}
            >
              <h3 className="font-semibold text-base text-foreground">
                {row.question}
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                <span className="mb-0.5 block font-mono text-2xs uppercase tracking-widest md:hidden">
                  Other wrappers
                </span>
                {row.others}
              </p>
              <p className="border-brand border-l-2 pl-4 text-foreground text-sm leading-relaxed">
                <span className="mb-0.5 block font-mono text-2xs text-muted-foreground uppercase tracking-widest md:hidden">
                  Wraps
                </span>
                {row.wraps}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-[1.1fr_0.7fr_1.4fr] md:gap-x-8">
          <p className="font-mono text-muted-foreground text-xs uppercase tracking-widest">
            Where we lose
          </p>
          <ul className="grid gap-2 text-muted-foreground text-sm leading-relaxed md:col-span-2">
            {LIMITS_SHOWN.map((limit) => (
              <li key={limit}>{limit}</li>
            ))}
          </ul>
        </div>

        <Link
          className="mt-8 inline-flex items-center gap-1.5 font-medium text-foreground text-sm underline-offset-4 hover:underline"
          href="/approaches"
        >
          All four approaches, side by side
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </Link>
      </div>
    </section>
  );
}
