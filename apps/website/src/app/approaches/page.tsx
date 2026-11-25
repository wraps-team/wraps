import type { Metadata } from "next";
import Link from "next/link";
import { ClosingPanel } from "@/app/landing/components/closing-panel";
import { FlowBox } from "@/app/landing/components/flow-primitives";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { Band, SectionHead } from "@/app/landing/components/page-band";
import { SectionKicker } from "@/app/landing/components/section-kicker";
import { TrackedClosingActions } from "@/components/tracked-closing-actions";
import {
  APPROACHES,
  APPROACHES_RUBRIC,
  WRAPPER_CRITERIA,
  WRAPS_LIMITS,
} from "@/config/approaches";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata: Metadata = pageMetadata({
  title: "The four ways to send application email — a rubric",
  description:
    "Run SES yourself, rent a sending API, rent a marketing platform, or put a wrapper over your own SES. What each is good at, who it is for, and how to choose between the wrappers once you are there.",
  path: "/approaches",
  social: {
    title: "The four ways to send application email",
    description:
      "Run SES yourself, rent a sending API, rent a marketing platform, or put a wrapper over your own SES. What each is good at, and who it is for.",
  },
});

export default function ApproachesPage() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />
      <main>
        <section className="pt-24 pb-12">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <SectionKicker>Choosing an approach</SectionKicker>
              <h1 className="text-balance font-heading font-semibold text-4xl text-foreground leading-tight tracking-tight sm:text-5xl">
                There are four ways to send application email.
              </h1>
              <p className="mt-6 text-lg text-muted-foreground">
                {APPROACHES_RUBRIC}
              </p>
              <p className="mt-4 text-lg text-muted-foreground">
                Wraps is in the fourth box, so the other three are written the
                way their own users would write them. If you have no AWS account
                and no intention of getting one, the second box is your answer
                and the rest of this page is not for you.
              </p>
            </div>
          </div>
        </section>

        <Band sunken>
          <div className="grid gap-x-6 gap-y-10 md:grid-cols-2">
            {APPROACHES.map((approach, i) => (
              <FlowBox
                dashed={approach.isOurs}
                key={approach.id}
                label={`${i + 1}. ${approach.label}`}
              >
                <h2 className="font-heading font-semibold text-xl text-foreground leading-snug tracking-tight">
                  {approach.title}
                </h2>
                <p className="mt-2 text-foreground/90">{approach.plain}</p>
                <p className="mt-1 text-muted-foreground text-xs">
                  {approach.examples}
                </p>
                <dl className="mt-5 grid gap-4">
                  <div>
                    <dt className="mb-1 font-sans font-semibold text-muted-foreground text-xs uppercase tracking-eyebrow">
                      What it is good at
                    </dt>
                    <dd className="text-foreground/90 text-sm leading-relaxed">
                      {approach.pro}
                    </dd>
                  </div>
                  <div>
                    <dt className="mb-1 font-sans font-semibold text-muted-foreground text-xs uppercase tracking-eyebrow">
                      What it costs you
                    </dt>
                    <dd className="text-foreground/90 text-sm leading-relaxed">
                      {approach.con}
                    </dd>
                  </div>
                </dl>
                <p className="mt-5 border-border border-t pt-4 text-foreground text-sm leading-relaxed">
                  <span className="font-semibold">Pick this if: </span>
                  {approach.pickThisIf}
                </p>
              </FlowBox>
            ))}
          </div>
        </Band>

        {/* The within-category comparison, the actual decision */}
        <Band>
          <SectionHead
            kicker="Inside the fourth approach"
            title="Every wrapper ships a send API. The difference is what happens after it."
          />
          <div className="max-w-3xl space-y-4 text-lg text-muted-foreground leading-relaxed">
            <p>
              Since the middle of 2026 several open-source projects have put a
              Resend-shaped API over your own SES and given it away. Good: an
              API is table stakes, and it settles an argument. If that were the
              hard part, it would not keep being rebuilt for free.
            </p>
            <p>
              The hard part is the account underneath. Amazon can put an account
              under review once its bounce rate passes 5% and can pause sending
              at 10%. For complaints the lines are 0.1% and 0.5%. Once you have
              picked this approach, these are the questions to put to whichever
              wrapper you choose, ours included. The answers were read out of
              each project's own documentation in September 2026.
            </p>
          </div>

          <div className="mt-9 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr>
                  <th className="border-border border-b px-3 py-3 font-sans font-semibold text-muted-foreground text-xs uppercase tracking-eyebrow">
                    Ask any wrapper
                  </th>
                  <th className="border-border border-b px-3 py-3 font-sans font-semibold text-muted-foreground text-xs uppercase tracking-eyebrow">
                    OpenSend, useSend, MillionSend
                  </th>
                  <th className="border-brand border-b-2 border-l-2 px-3 py-3 font-sans font-semibold text-foreground text-xs uppercase tracking-eyebrow">
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
                    <td className="border-border border-brand border-b border-l-2 bg-brand/5 px-3 py-4 align-top text-foreground text-sm">
                      {row.wraps}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-6 max-w-3xl text-muted-foreground leading-relaxed">
            Read the last row twice. Nobody in this category can get you
            production access, and a wrapper that implies otherwise is selling
            something it does not have.
          </p>
        </Band>

        <Band sunken>
          <SectionHead
            body="The same list we would give you on a call, in the same order."
            kicker="Where we lose"
            title="What Wraps does not do."
          />
          <FlowBox label="Wraps limits">
            <ul className="space-y-3 text-muted-foreground leading-relaxed">
              {WRAPS_LIMITS.map((limit) => (
                <li key={limit}>{limit}</li>
              ))}
            </ul>
          </FlowBox>
          <p className="mt-8 max-w-3xl text-muted-foreground leading-relaxed">
            One more thing worth knowing rather than discovering: the CLI and
            the SDKs are free, and you can use them with no Wraps account. If
            what you want is the deploy and the tooling, take that and nothing
            else.{" "}
            <Link
              className="text-foreground underline underline-offset-4"
              href="/alternatives/resend"
            >
              Compare specific vendors
            </Link>
            .
          </p>
        </Band>

        <ClosingPanel
          actions={
            <TrackedClosingActions
              location="approaches_closing"
              primary={{
                label: "Deploy it and look at the card",
                href: "/docs/quickstart/email",
              }}
              secondary={{ label: "Why Wraps", href: "/why-wraps" }}
            />
          }
          body="If the fourth box fits, connect an AWS account and see what gets deployed. Nothing already in the account is modified."
          title="Pick the row that describes you."
        />
      </main>
      <LandingFooter />
    </div>
  );
}
