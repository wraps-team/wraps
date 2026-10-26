import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { APPROACHES } from "@/config/approaches";
import { SectionKicker } from "./section-kicker";

/*
 * Dunford's step 2: hand the reader the rubric for the whole market before
 * pitching into it. All four rows show, including ours — Wraps is an
 * open-source wrapper over your own SES, so it belongs in the fourth row
 * rather than standing outside the four as a separate thing.
 *
 * Content comes from src/config/approaches.ts so this strip and the full page
 * can never drift apart.
 */

export function ApproachesTeaserSection() {
  return (
    <section className="border-border border-b py-16 md:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionKicker>Before you pick anything</SectionKicker>
        <h2 className="max-w-[28ch] font-heading font-semibold text-[28px] text-foreground leading-[1.1] tracking-[-0.022em] md:text-4xl">
          There are four ways to send application email. Wraps is the fourth.
        </h2>

        <ul className="mt-9 grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-4">
          {APPROACHES.map((approach, i) => (
            <li
              className={
                approach.isOurs
                  ? "border-brand border-t-2 pt-4"
                  : "border-foreground border-t pt-4"
              }
              key={approach.id}
            >
              <span className="font-mono text-brand text-[11px]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-2 font-semibold text-[15px] text-foreground lg:min-h-[2.75rem]">
                {approach.label}
              </h3>
              <p className="mt-1 text-muted-foreground text-xs">
                {approach.examples}
              </p>
              <p className="mt-2.5 text-[13.5px] text-muted-foreground leading-[1.55]">
                {approach.pickThisIf}
              </p>
            </li>
          ))}
        </ul>

        <p className="mt-9 max-w-[62ch] text-[15px] text-muted-foreground leading-[1.6]">
          Open source, your own AWS account, your own reputation — that row is
          getting crowded, and it should. The thing that still separates the
          wrappers is whether anything watches the account once you are sending.
        </p>

        <Link
          className="mt-4 inline-flex items-center gap-1.5 font-medium text-foreground text-sm underline-offset-4 hover:underline"
          href="/approaches"
        >
          See how the wrappers compare
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </Link>
      </div>
    </section>
  );
}
