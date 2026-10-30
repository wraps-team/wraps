import { ArrowRight } from "lucide-react";
import Link from "next/link";

export function ProblemContrastSection() {
  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="font-bold text-3xl tracking-tight font-heading md:text-4xl text-balance">
            Every email API works the same way.
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            You sign up, get an API key, and send through their infrastructure.
            They mark up the sending cost, store your contacts on their servers,
            and build your domain reputation on shared IPs. When you leave, you
            start over.
          </p>
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-foreground">
            Wraps deploys email infrastructure to your AWS account. SES, event
            tracking, analytics, all of it. You pay AWS directly at{" "}
            <span className="text-brand-text">$0.10 per 1,000 emails</span> on à
            la carte (AWS defaults new accounts to $0.16 — Wraps tells you which
            plan applies). Cancel Wraps and everything keeps running.
          </p>

          <div className="mt-10">
            <Link
              className="inline-flex items-center gap-1.5 font-medium text-sm text-brand-text transition-colors hover:text-brand-text"
              href="/docs/quickstart/email"
            >
              See what gets deployed
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
