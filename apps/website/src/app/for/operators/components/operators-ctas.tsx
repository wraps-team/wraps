"use client";

import { Button } from "@wraps/ui/components/ui/button";
import { ArrowRight } from "lucide-react";
import { trackEvent } from "@/utils/analytics";

const SIGNUP_URL = "https://app.wraps.dev/auth?mode=signup";

function track(location: string, ctaText: string) {
  trackEvent("cta_click", { location, cta_text: ctaText });
}

export function OperatorsHeroCTA() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button asChild className="cursor-pointer" size="lg" variant="brand">
        <a
          href={SIGNUP_URL}
          onClick={() => track("for_operators_hero", "Start free")}
        >
          Start free
        </a>
      </Button>
      <Button asChild className="cursor-pointer" size="lg" variant="outline">
        <a
          href="/tools"
          onClick={() =>
            track("for_operators_hero", "Check your sending setup")
          }
        >
          Check your sending setup
        </a>
      </Button>
    </div>
  );
}

export function OperatorsClosingActions() {
  return (
    <div className="flex flex-wrap gap-3">
      <Button asChild className="cursor-pointer" size="lg" variant="brand">
        <a
          href={SIGNUP_URL}
          onClick={() => track("for_operators_cta", "Start free")}
        >
          Start free
          <ArrowRight aria-hidden="true" className="ms-2 size-4" />
        </a>
      </Button>
      <Button asChild className="cursor-pointer" size="lg" variant="outline">
        <a
          href="/tools"
          onClick={() => track("for_operators_cta", "Audit a sending domain")}
        >
          Audit a sending domain
        </a>
      </Button>
    </div>
  );
}
