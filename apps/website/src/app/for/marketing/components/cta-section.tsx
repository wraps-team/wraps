"use client";

import { Button } from "@wraps/ui/components/ui/button";
import { ArrowRight, Calculator } from "lucide-react";
import Link from "next/link";
import { trackEvent } from "@/utils/analytics";

export function MarketingCtaSection() {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
        <p className="mb-6 font-medium text-2xl tracking-tight sm:text-3xl">
          Unlimited contacts on every plan.{" "}
          <span className="text-muted-foreground">Including the free one.</span>
        </p>

        <div className="flex flex-col justify-center gap-4 sm:flex-row">
          <Button
            asChild
            className="bg-orange-500 text-white hover:bg-orange-600"
            size="lg"
          >
            <a
              href="https://app.wraps.dev/auth?mode=signup"
              onClick={() =>
                trackEvent("cta_click", {
                  location: "for_marketing_cta",
                  cta_text: "Start free",
                })
              }
            >
              Start free
              <ArrowRight className="ml-2 size-4" />
            </a>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link
              href="/tools/ses-calculator"
              onClick={() =>
                trackEvent("cta_click", {
                  location: "for_marketing_cta",
                  cta_text: "Estimate your sending cost",
                })
              }
            >
              <Calculator className="size-4" />
              Estimate your sending cost
            </Link>
          </Button>
        </div>

        <p className="mt-6 text-muted-foreground text-sm">
          Broadcasts, segments, topics, and scheduling start at $29 a month.
          Sending is billed by AWS directly, at SES rates.
        </p>
      </div>
    </section>
  );
}
