import type { Metadata } from "next";
import Link from "next/link";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { SectionKicker } from "@/app/landing/components/section-kicker";
import {
  APPROACHES,
  APPROACHES_RUBRIC,
  WRAPPER_CRITERIA,
  WRAPS_LIMITS,
} from "@/config/approaches";

export const metadata: Metadata = {
  title: "The four ways to send application email — a rubric",
  description:
    "Run SES yourself, rent a sending API, rent a marketing platform, or put an open-source wrapper over your own SES. What each is good at, who it is for, and how to choose between the wrappers once you are there.",
  openGraph: {
    title: "The four ways to send application email | Wraps",
    description:
      "Run SES yourself, rent a sending API, rent a marketing platform, or put an open-source wrapper over your own SES. What each is good at, and who it is for.",
  },
  twitter: {
    title: "The four ways to send application email | Wraps",
    description:
      "Run SES yourself, rent a sending API, rent a marketing platform, or put an open-source wrapper over your own SES. What each is good at, and who it is for.",
  },
  alternates: {
    canonical: "https://wraps.dev/approaches",
  },
};

export default function ApproachesPage() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />
      <main>
        <section className="border-border border-b pt-20 pb-16 md:pt-24">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <SectionKicker>Choosing an approach</SectionKicker>
            <h1 className="max-w-[22ch] font-heading font-semibold text-[38px] text-foreground leading-[1.05] tracking-[-0.03em] md:text-[52px]">
              There are four ways to send application email.
            </h1>
            <p className="mt-6 max-w-[62ch] text-[17px] text-muted-foreground leading-[1.6]">
              {APPROACHES_RUBRIC}
            </p>
            <p className="mt-4 max-w-[62ch] text-[17px] text-muted-foreground leading-[1.6]">
              Wraps is one of the fourth kind, so the other three are written
              the way their own users would write them. If you have no AWS
              account and no intention of getting one, the second row is your
              answer and the rest of this page is not for you.
            </p>
          </div>
        </section>

        <section className="border-border border-b py-16 md:py-20">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <div className="space-y-14">
              {APPROACHES.map((approach, i) => (
                <article
                  className={
                    approach.isOurs
                      ? "-mx-5 rounded-lg border border-brand/40 bg-brand/[0.03] px-5 py-6 md:-mx-7 md:px-7"
                      : ""
                  }
                  key={approach.id}
                >
                  <div className="mb-4 flex items-baseline gap-3">
                    <span className="font-mono text-brand-text text-xs">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <h2 className="font-heading font-semibold text-2xl text-foreground leading-[1.15] tracking-[-0.02em] md:text-[28px]">
                        {approach.title}
                      </h2>
                      <p className="mt-1 text-muted-foreground text-xs">
                        {approach.examples}
                      </p>
                    </div>
                  </div>

                  <dl className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <dt className="mb-1.5 font-mono text-[11px] text-muted-foreground uppercase tracking-[0.08em]">
                        What it is good at
                      </dt>
                      <dd className="text-[14.5px] text-foreground/90 leading-[1.6]">
                        {approach.pro}
                      </dd>
                    </div>
                    <div>
                      <dt className="mb-1.5 font-mono text-[11px] text-muted-foreground uppercase tracking-[0.08em]">
                        What it costs you
                      </dt>
                      <dd className="text-[14.5px] text-foreground/90 leading-[1.6]">
                        {approach.con}
                      </dd>
                    </div>
                  </dl>

                  <p className="mt-5 border-foreground border-t pt-4 text-[14.5px] text-foreground leading-[1.6]">
                    <span className="font-semibold">Pick this if: </span>
                    {approach.pickThisIf}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* The within-category comparison — the actual decision */}
        <section className="border-border border-b py-16 md:py-20">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <SectionKicker>Inside the fourth approach</SectionKicker>
            <h2 className="max-w-[26ch] font-heading font-semibold text-[28px] text-foreground leading-[1.1] tracking-[-0.022em] md:text-4xl">
              Every wrapper ships a send API. The difference is what happens
              after it.
            </h2>
            <div className="mt-6 max-w-[62ch] space-y-4 text-base text-muted-foreground leading-[1.65]">
              <p>
                Since the middle of 2026 several open-source projects have put a
                Resend-shaped API over your own SES and given it away. Good — an
                API is table stakes, and it settles an argument: if that were
                the hard part, it would not keep being rebuilt for free.
              </p>
              <p>
                The hard part is the account underneath. Amazon can put an
                account under review once its bounce rate passes 5% and can
                pause sending at 10%; for complaints the lines are 0.1% and
                0.5%. Once you have picked this approach, these are the
                questions to put to whichever wrapper you choose, ours included.
                The answers were read out of each project's own documentation in
                September 2026.
              </p>
            </div>

            <div className="mt-9 overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left">
                <thead>
                  <tr>
                    <th className="border-border border-b px-3 py-3 font-mono font-medium text-muted-foreground text-xs uppercase tracking-[0.08em]">
                      Ask any wrapper
                    </th>
                    <th className="border-border border-b px-3 py-3 font-mono font-medium text-muted-foreground text-xs uppercase tracking-[0.08em]">
                      OpenSend, useSend, MillionSend
                    </th>
                    <th className="border-brand border-b-2 border-l-2 px-3 py-3 font-mono font-medium text-foreground text-xs uppercase tracking-[0.08em]">
                      Wraps
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {WRAPPER_CRITERIA.map((row) => (
                    <tr key={row.question}>
                      <td className="border-border border-b px-3 py-4 align-top font-medium text-foreground text-sm">
                        {row.question}
                      </td>
                      <td className="border-border border-b px-3 py-4 align-top text-muted-foreground text-sm">
                        {row.others}
                      </td>
                      <td className="border-border border-brand border-b border-l-2 bg-brand/[0.03] px-3 py-4 align-top text-foreground text-sm">
                        {row.wraps}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-6 max-w-[62ch] text-muted-foreground text-sm leading-[1.65]">
              Read the last row twice. Nobody in this category can get you
              production access, and a wrapper that implies otherwise is selling
              something it does not have.
            </p>
          </div>
        </section>

        <section className="border-border border-b py-16 md:py-20">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <SectionKicker>Where we lose</SectionKicker>
            <h2 className="max-w-[24ch] font-heading font-semibold text-[28px] text-foreground leading-[1.1] tracking-[-0.022em] md:text-4xl">
              What Wraps does not do.
            </h2>
            <p className="mt-6 max-w-[62ch] text-base text-muted-foreground leading-[1.65]">
              The same list we would give you on a call, in the same order.
            </p>
            <ul className="mt-7 space-y-4">
              {WRAPS_LIMITS.map((limit) => (
                <li
                  className="border-border border-t pt-4 text-[14.5px] text-muted-foreground leading-[1.65]"
                  key={limit}
                >
                  {limit}
                </li>
              ))}
            </ul>

            <p className="mt-8 max-w-[62ch] text-base text-muted-foreground leading-[1.65]">
              One more thing worth knowing rather than discovering: the CLI and
              the SDKs are free, open source, and usable with no account here at
              all. If what you want is the deploy and the tooling, take that and
              nothing else — plenty of people run Wraps exactly that way.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                className="inline-flex items-center rounded-md bg-foreground px-4 py-2.5 font-medium text-background text-sm transition-opacity hover:opacity-90"
                href="/docs/quickstart/email"
              >
                Deploy it and look at the card
              </Link>
              <Link
                className="inline-flex items-center rounded-md border border-border px-4 py-2.5 font-medium text-foreground text-sm transition-colors hover:border-foreground"
                href="/alternatives/resend"
              >
                Compare specific vendors
              </Link>
            </div>
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
