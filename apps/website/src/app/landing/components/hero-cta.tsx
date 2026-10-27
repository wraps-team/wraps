"use client";

import { Button } from "@wraps/ui/components/ui/button";
import { trackEvent } from "@/utils/analytics";

export function HeroAnimatedCTA() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 lg:justify-start">
      <Button
        asChild
        className="w-full cursor-pointer sm:w-auto"
        size="lg"
        variant="brand"
      >
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
      <Button
        asChild
        className="hidden cursor-pointer sm:inline-flex"
        size="lg"
        variant="outline"
      >
        <a
          href="/docs/quickstart"
          onClick={() =>
            trackEvent("cta_click", {
              location: "hero",
              cta_text: "Read the docs",
            })
          }
        >
          Read the docs
        </a>
      </Button>
    </div>
  );
}

/** Mobile stand-in for the outline button: a quiet link under the signup button. */
export function HeroDocsLink() {
  return (
    <a
      className="mt-4 text-muted-foreground text-sm underline underline-offset-4 hover:text-foreground sm:hidden"
      href="/docs/quickstart"
      onClick={() =>
        trackEvent("cta_click", {
          location: "hero",
          cta_text: "Read the docs",
        })
      }
    >
      Read the docs
    </a>
  );
}
