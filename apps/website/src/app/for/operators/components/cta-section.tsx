"use client";

import { Button } from "@wraps/ui/components/ui/button";
import { ArrowRight, Stethoscope } from "lucide-react";
import Link from "next/link";
import { trackEvent } from "@/utils/analytics";

export function OperatorsCtaSection() {
  return (
    <section className="border-border/60 border-t py-20">
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
        <p className="mb-6 font-medium text-2xl tracking-tight sm:text-3xl">
          Your SES. Your list.{" "}
          <span className="text-muted-foreground">Your record of both.</span>
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
                  location: "for_operators_cta",
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
              href="/tools"
              onClick={() =>
                trackEvent("cta_click", {
                  location: "for_operators_cta",
                  cta_text: "Audit a sending domain",
                })
              }
            >
              <Stethoscope className="size-4" />
              Audit a sending domain
            </Link>
          </Button>
        </div>

        <p className="mt-6 text-muted-foreground text-sm">
          Topics, segments, and scheduled campaigns are on Pro, $29 a month,
          with unlimited contacts.
        </p>
      </div>
    </section>
  );
}
