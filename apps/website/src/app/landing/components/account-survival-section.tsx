import { SectionKicker } from "./section-kicker";
import { Meter, QuotaMeter } from "./survival-meters";

/*
 * A faithful still of the dashboard's account survival card.
 *
 * The numbers below are AWS's, not ours: SES starts a manual review at a 5%
 * bounce rate and pauses sending at 10%; the complaint lines are 0.1% and
 * 0.5%. They mirror SES_THRESHOLDS in apps/api/src/lib/ses-health.ts, which is
 * the source of truth and what the hourly sweep classifies with. If AWS moves
 * a line, it moves there first.
 *
 * The rates themselves are an example, and the caption says so. The point of
 * the figure is the two tick marks, not the reading — a 4.1% bounce rate means
 * nothing on its own and everything next to "AWS reviews at 5%".
 */

export function AccountSurvivalSection() {
  return (
    <section className="border-border border-b py-20 md:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.15fr] lg:gap-16">
          <div>
            <SectionKicker>The control plane</SectionKicker>
            <h2 className="max-w-[20ch] font-heading font-semibold text-3xl text-foreground leading-none tracking-tight md:text-4xl">
              Staying on top of it, without opening the AWS console.
            </h2>
            <p className="mt-5 max-w-[48ch] text-base text-muted-foreground leading-relaxed">
              Most teams pick a hosted API because they do not want to deal with
              any of this. Fair. So we made dealing with it the easy part:
              Amazon can put an account under review once its bounce rate passes
              5% and pause sending at 10%, and the console will not draw your
              rates against those lines — the control plane does, swept hourly,
              with owners and admins notified when one is crossed.
            </p>
            <p className="mt-4 max-w-[48ch] text-base text-muted-foreground leading-relaxed">
              Same surface for the rest of the daily job: suppression you can
              browse and clear, deliverability and blacklist audits, and a
              per-message event log. Bounces and complaints are suppressed on
              the way in, so the rates have a floor under them and not only a
              gauge over them.
            </p>
          </div>

          {/* The card */}
          <figure className="m-0 lg:justify-self-end lg:pt-10">
            <div className="rounded-lg border border-border bg-background p-6 md:p-7">
              <div className="mb-6 flex flex-wrap items-center gap-2">
                <h3 className="mr-auto font-semibold text-base text-foreground">
                  Account survival
                </h3>
                <span className="rounded border border-warning/40 bg-warning/10 px-2 py-0.5 font-mono text-2xs text-warning uppercase tracking-widest">
                  Under review
                </span>
              </div>

              <div className="grid gap-7 sm:grid-cols-3">
                <Meter
                  display="4.1%"
                  label="Bounce rate"
                  note="AWS reviews at 5%, pauses at 10%."
                  pause={10}
                  review={5}
                  value={4.1}
                />
                <Meter
                  display="0.12%"
                  label="Complaint rate"
                  note="Over AWS's 0.1% review line."
                  pause={0.5}
                  review={0.1}
                  value={0.12}
                />
                <QuotaMeter />
              </div>
            </div>
            <figcaption className="mt-3 text-xs text-muted-foreground leading-normal">
              The dashboard's account survival card. Rates shown are an example;
              the thresholds are AWS's own.
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
