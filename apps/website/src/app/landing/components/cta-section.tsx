import { Code, CreditCard, Server } from "lucide-react";
import { ClosingCtaView } from "./closing-cta-view";
import { CTAButtons } from "./cta-buttons";
import { SectionKicker } from "./section-kicker";

export function CTASection() {
  return (
    <section
      className="relative overflow-hidden py-16 md:py-24"
      id="get-started"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <ClosingCtaView>
          <div className="relative mx-auto max-w-3xl overflow-hidden rounded-2xl border border-border bg-card px-6 py-12 text-center shadow-sm sm:px-12 md:py-16">
            {/* Warm light behind the card, the same atmosphere the hero uses. */}
            <div
              aria-hidden="true"
              className="-top-10 absolute inset-x-12 h-32 rounded-full bg-brand/10 blur-3xl"
            />

            <div className="relative">
              <SectionKicker className="justify-center">
                Get started
              </SectionKicker>
              <h2 className="mx-auto max-w-xl text-balance font-heading font-semibold text-3xl text-foreground leading-tight tracking-tight md:text-4xl">
                Your email, on your own AWS,{" "}
                <span className="text-brand-text">in about two minutes.</span>
              </h2>
              <p className="mx-auto mt-4 max-w-md text-pretty text-base text-muted-foreground leading-relaxed">
                Start free. Nothing already in your account is touched, and the
                infrastructure is yours if you ever leave.
              </p>

              <div className="mt-8">
                <CTAButtons />
              </div>

              <ul className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-muted-foreground text-sm">
                <li className="inline-flex items-center gap-1.5">
                  <CreditCard aria-hidden="true" className="size-3.5" />
                  No credit card
                </li>
                <li className="inline-flex items-center gap-1.5">
                  <Server aria-hidden="true" className="size-3.5" />
                  Infrastructure stays if you cancel
                </li>
                <li className="inline-flex items-center gap-1.5">
                  <Code aria-hidden="true" className="size-3.5" />
                  Open source
                </li>
              </ul>
            </div>
          </div>
        </ClosingCtaView>
      </div>
    </section>
  );
}
