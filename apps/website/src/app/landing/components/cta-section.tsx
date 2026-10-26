import { Code, CreditCard, Server } from "lucide-react";
import { CopyCommand } from "./copy-command";
import { CTAButtons } from "./cta-buttons";
import { SectionKicker } from "./section-kicker";

export function CTASection() {
  return (
    <section className="py-20 md:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionKicker>Get started</SectionKicker>
        <p className="mb-6 max-w-[20ch] font-heading font-semibold text-3xl text-foreground leading-none tracking-tight md:text-4xl">
          One command to set it up.{" "}
          <span className="text-brand">One place to run it.</span>
        </p>

        <p className="mb-8 max-w-[52ch] text-muted-foreground">
          About two minutes, and nothing you already have in the account gets
          touched. Cancel whenever — the infrastructure is yours and keeps
          sending.
        </p>

        <div className="mb-6">
          <CopyCommand
            command="npx @wraps.dev/cli email init"
            location="footer_cta"
          />
        </div>

        <CTAButtons />

        {/* Trust signals */}
        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-muted-foreground text-sm">
          <span className="inline-flex items-center gap-1.5">
            <CreditCard className="size-3.5" />
            No credit card
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Server className="size-3.5" />
            Infrastructure stays if you cancel
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Code className="size-3.5" />
            Open source
          </span>
        </div>
      </div>
    </section>
  );
}
