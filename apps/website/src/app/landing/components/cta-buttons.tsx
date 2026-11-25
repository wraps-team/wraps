"use client";

import { Button } from "@wraps/ui/components/ui/button";
import { ArrowRight } from "lucide-react";
import { CLOSING_CTA_LABELS, trackClosingCtaClick } from "@/lib/closing-cta";

/** The closing panel's two buttons, both tracked as `cta_click` with the closing variant. */
export function CTAButtons() {
  return (
    <div className="flex flex-wrap gap-3">
      <Button asChild size="lg" variant="brand">
        <a
          href="https://app.wraps.dev/auth?mode=signup"
          onClick={() => trackClosingCtaClick("primary")}
        >
          {CLOSING_CTA_LABELS.primary}
          <ArrowRight aria-hidden="true" className="ms-2 size-4" />
        </a>
      </Button>
      <Button asChild size="lg" variant="outline">
        <a href="#how" onClick={() => trackClosingCtaClick("how")}>
          {CLOSING_CTA_LABELS.how}
        </a>
      </Button>
    </div>
  );
}
