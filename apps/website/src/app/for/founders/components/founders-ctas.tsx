"use client";

import { Button } from "@wraps/ui/components/ui/button";
import { ArrowRight } from "lucide-react";
import { trackEvent } from "@/utils/analytics";

const SIGNUP_URL = "https://app.wraps.dev/auth?mode=signup";

function track(location: string, ctaText: string) {
  trackEvent("cta_click", { location, cta_text: ctaText });
}

export function FoundersHeroCTA() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button asChild className="cursor-pointer" size="lg" variant="brand">
        <a
          href={SIGNUP_URL}
          onClick={() => track("for_founders_hero", "Start free")}
        >
          Start free
        </a>
      </Button>
      <Button asChild className="cursor-pointer" size="lg" variant="outline">
        <a
          href="#how"
          onClick={() => track("for_founders_hero", "See how it works")}
        >
          See how it works
        </a>
      </Button>
    </div>
  );
}

export function FoundersClosingActions() {
  return (
    <div className="flex flex-wrap gap-3">
      <Button asChild className="cursor-pointer" size="lg" variant="brand">
        <a
          href={SIGNUP_URL}
          onClick={() => track("for_founders_closing", "Start free")}
        >
          Start free
          <ArrowRight aria-hidden="true" className="ms-2 size-4" />
        </a>
      </Button>
      <Button asChild className="cursor-pointer" size="lg" variant="outline">
        <a
          href="/tools/ses-calculator"
          onClick={() =>
            track("for_founders_closing", "Estimate your sending cost")
          }
        >
          Estimate your sending cost
        </a>
      </Button>
    </div>
  );
}
