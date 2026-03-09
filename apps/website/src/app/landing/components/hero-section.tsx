import { Github } from "lucide-react";
import Image from "next/image";
import { DotPattern } from "@/components/dot-pattern";
import { HeroAnimatedCTA } from "./hero-cta";

// Static content - server rendered, visible immediately
export function HeroSection() {
  return (
    <section className="relative overflow-hidden pt-20 pb-16 md:pt-24 lg:pt-32">
      {/* Background Pattern */}
      <div className="absolute inset-0">
        <DotPattern className="opacity-100" fadeStyle="ellipse" size="md" />
      </div>

      <div className="relative mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-start">
          {/* Badge - static, visible immediately */}
          <div className="mb-6 animate-fade-in-down">
            <a
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm text-orange-500 transition-colors hover:border-orange-500/50"
              href="https://github.com/wraps-team/wraps"
            >
              <Github className="size-4" />
              <span>Open Source</span>
              <span className="text-muted-foreground">·</span>
              <span>AGPLv3 Licensed</span>
            </a>
          </div>

          {/* Main Headline - server rendered, CSS animation */}
          <h1 className="max-w-[864px] text-left text-[28px] font-medium leading-[32px] animate-fade-in-up md:text-[34px] md:leading-[40px] lg:text-[48px] lg:leading-[56px]">
            The email platform that sends through{" "}
            <span className="text-orange-500">your AWS.</span>
          </h1>

          {/* Subheadline - server rendered, CSS animation */}
          <p className="mt-4 max-w-[750px] text-left text-[16px] leading-[24px] text-muted-foreground animate-fade-in-up animation-delay-100 md:text-[18px] md:leading-[26px] lg:text-[20px] lg:leading-[28px]">
            Automate on user behavior. Design templates. Schedule broadcasts.
            Transparent pricing. Sending infrastructure you own.
          </p>

          {/* Founder credibility */}
          <div className="mt-4 flex items-center gap-2.5 animate-fade-in-up animation-delay-100">
            <Image
              alt="Jarod, founder of Wraps"
              className="shrink-0 rounded-full"
              height={36}
              src="/team/jarod-medium-smile.webp"
              width={36}
            />
            <a
              className="text-left text-[15px] leading-[22px] text-muted-foreground underline underline-offset-2 hover:text-foreground md:text-[16px]"
              href="https://x.com/stewartjarod"
              rel="noopener noreferrer"
              target="_blank"
            >
              Built by an ex-SendGrid engineer
            </a>
          </div>

          {/* CTA - client component for tracking */}
          <HeroAnimatedCTA />
        </div>
      </div>
    </section>
  );
}
