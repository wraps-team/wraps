import { SectionKicker } from "@/app/landing/components/section-kicker";

export function OperatorsOwnershipSection() {
  return (
    <section className="py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-start gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <SectionKicker>Ownership</SectionKicker>
            <h2 className="mb-3 font-bold text-3xl tracking-tight sm:text-4xl">
              The reputation you build belongs to you.
            </h2>
            <p className="mb-5 text-lg text-muted-foreground">
              Wraps sends through your Amazon SES, in your AWS account, on your
              verified domain. You are not one tenant on a shared pool whose
              reputation moves when a stranger sends something careless.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              That cuts the other way too, honestly: the complaint rate is yours
              to manage, and nobody else&rsquo;s good behavior will carry you.
              That is the trade an operator usually wants to make, because it is
              the only version where the work you do on your list actually
              compounds.
            </p>
          </div>

          <div className="space-y-4">
            {[
              {
                title: "If you stop paying us, sending keeps working",
                body: "The SES configuration, the domain identity, and the event pipeline live in your account. Cancelling Wraps costs you the dashboard, not the ability to send.",
              },
              {
                title: "Audit the sending setup from your terminal",
                body: "wraps email check reads DKIM, SPF, and DMARC on a domain and checks it against public blocklists — no signup, no dashboard, before or after you're a customer.",
              },
              {
                title: "Know which SES pricing plan you're on",
                body: "New AWS accounts are defaulted onto the Essentials plan at $0.16 per 1,000 rather than à la carte at $0.10. wraps email plan reads the plan per region and can move you back.",
              },
            ].map(({ title, body }) => (
              <div
                className="rounded-xl border border-border bg-card/60 p-5"
                key={title}
              >
                <h3 className="mb-2 font-medium text-base tracking-tight">
                  {title}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
