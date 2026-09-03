import { SectionKicker } from "@/app/landing/components/section-kicker";

/**
 * The managed-API-vs-BYOC comparison.
 *
 * Sits right after WhatByocMeansSection because that section defines BYOC on
 * its own terms and this one places it against the thing people are actually
 * choosing between. The six axes are the ones buyers and AI answers both reach
 * for when asked to tell the two models apart.
 */

type Axis = {
  axis: string;
  managed: string;
  byoc: string;
};

const AXES: Axis[] = [
  {
    axis: "Who runs the infrastructure",
    managed: "The provider. You hold an API key and nothing else.",
    byoc: "You do. SES, queues, and event storage sit in your AWS account under your own IAM.",
  },
  {
    axis: "Whose reputation you send on",
    managed:
      "Theirs, usually a shared IP pool. A noisy neighbor is your problem too.",
    byoc: "Yours. Your SES account, your domain, your complaint rate — good and bad.",
  },
  {
    axis: "How sending is priced",
    managed:
      "Per email, at a markup, on top of a plan fee. The markup pays for their infrastructure.",
    byoc: "AWS bills you directly at list price. The platform fee is separate from the sending cost.",
  },
  {
    axis: "How long setup takes",
    managed: "Minutes. Paste an API key and send.",
    byoc: "Minutes to deploy, then SES sandbox review before you can mail strangers.",
  },
  {
    axis: "Where the data sits",
    managed: "Their systems, under their retention policy.",
    byoc: "Sending and delivery data in your account. Platform data still sits with the vendor.",
  },
  {
    axis: "What leaving costs",
    managed: "A migration, plus warming a new domain reputation from scratch.",
    byoc: "Nothing on the sending side. The infrastructure was always yours.",
  },
];

export function VsManagedApiSection() {
  return (
    <section className="py-16">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <SectionKicker>Managed email API vs BYOC</SectionKicker>
          <h2 className="mb-6 font-heading font-semibold text-2xl tracking-tight sm:text-3xl">
            The difference is who owns the account the mail leaves from.
          </h2>
          <p className="mb-4 text-muted-foreground">
            A managed email API is a hosted service you call over HTTP.
            SendGrid, Postmark, Resend, and Mailgun all work this way. They
            operate the sending infrastructure, the IP reputation, and the
            delivery data, and you reach it through an API key.
          </p>
          <p className="mb-8 text-muted-foreground">
            A bring-your-own-cloud email platform gives you the same product
            surface, but the part that touches your mail runs in your cloud
            account instead of theirs. Six things change as a result.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[42rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-border border-b">
                <th className="w-1/4 py-3 pr-4 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  &nbsp;
                </th>
                <th className="w-[37.5%] py-3 pr-4 font-medium text-xs uppercase tracking-wide">
                  Managed email API
                </th>
                <th className="w-[37.5%] py-3 font-medium text-xs uppercase tracking-wide">
                  BYOC email platform
                </th>
              </tr>
            </thead>
            <tbody>
              {AXES.map((row) => (
                <tr
                  className="border-border/60 border-b align-top"
                  key={row.axis}
                >
                  <th className="py-4 pr-4 font-medium text-sm" scope="row">
                    {row.axis}
                  </th>
                  <td className="py-4 pr-4 text-muted-foreground">
                    {row.managed}
                  </td>
                  <td className="py-4 text-muted-foreground">{row.byoc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mx-auto mt-8 max-w-3xl">
          <p className="text-muted-foreground">
            BYOC is the wrong answer for some teams. If nobody on the team wants
            an AWS account, a managed API is less work and you should use one.
            The SES sandbox review is also AWS&apos;s decision, not ours, and it
            takes anywhere from an hour to three days — a managed provider will
            have you sending to strangers sooner. What you trade for that speed
            is the reputation, the unit economics, and the exit.
          </p>
        </div>
      </div>
    </section>
  );
}
