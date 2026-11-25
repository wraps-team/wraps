"use client";

import { Button } from "@wraps/ui/components/ui/button";
import { trackEvent } from "@/utils/analytics";

/** Tags hero clicks from this design, so they are not mixed with the old hero's. */
const HERO_CTA_VARIANT = "hero_v2";

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
              // The label the visitor reads. Earlier heroes reported "Start
              // building" for this button; the variant tells the two apart.
              cta_text: "Start free",
              cta_variant: HERO_CTA_VARIANT,
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
              cta_variant: HERO_CTA_VARIANT,
            })
          }
        >
          See how it works
        </a>
      </Button>
    </div>
  );
}
