"use client";

import { Button } from "@wraps/ui/components/ui/button";
import { trackEvent } from "@/utils/analytics";

/**
 * The homepage hero's two buttons. Same `cta_click` events as the other hero
 * CTAs (`hero-cta.tsx`), which stay as they are for the pages that use them.
 */
export function HomeHeroCtas() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button asChild size="lg" variant="brand">
        <a
          href="https://app.wraps.dev/auth?mode=signup"
          onClick={() =>
            trackEvent("cta_click", {
              location: "hero",
              // Kept as "Start building" so existing funnels keep matching.
              cta_text: "Start building",
            })
          }
        >
          Start free
        </a>
      </Button>
      <Button asChild size="lg" variant="outline">
        <a
          href="#how"
          onClick={() =>
            trackEvent("cta_click", {
              location: "hero",
              cta_text: "See how it works",
            })
          }
        >
          See how it works
        </a>
      </Button>
    </div>
  );
}
