"use client";

import { Button } from "@wraps/ui/components/ui/button";
import { trackEvent } from "@/utils/analytics";

export function OperatorsHeroCTA() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        asChild
        className="cursor-pointer bg-orange-500 text-white hover:bg-orange-600"
        size="lg"
      >
        <a
          href="https://app.wraps.dev/auth?mode=signup"
          onClick={() =>
            trackEvent("cta_click", {
              location: "for_operators_hero",
              cta_text: "Start free",
            })
          }
        >
          Start free
        </a>
      </Button>
      <Button asChild className="cursor-pointer" size="lg" variant="outline">
        <a
          href="/tools"
          onClick={() =>
            trackEvent("cta_click", {
              location: "for_operators_hero",
              cta_text: "Check your sending setup",
            })
          }
        >
          Check your sending setup
        </a>
      </Button>
    </div>
  );
}
