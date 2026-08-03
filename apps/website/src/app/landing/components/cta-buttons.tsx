"use client";

import { Button } from "@wraps/ui/components/ui/button";
import { ArrowRight } from "lucide-react";
import { Github } from "@/components/ui/svgs/brand-icons";
import { trackEvent } from "@/utils/analytics";

export function CTAButtons() {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:justify-start">
      <Button
        asChild
        className="cursor-pointer bg-orange-500 hover:bg-orange-600"
        size="lg"
      >
        <a
          href="https://app.wraps.dev/auth?mode=signup"
          onClick={() =>
            trackEvent("cta_click", {
              location: "footer_cta",
              cta_text: "Free CLI Quickstart",
            })
          }
        >
          Sign up
        </a>
      </Button>
      <Button
        asChild
        className="group cursor-pointer"
        size="lg"
        variant="outline"
      >
        <a
          href="https://github.com/wraps-team/wraps"
          onClick={() =>
            trackEvent("cta_click", {
              location: "footer_cta",
              cta_text: "View on GitHub",
            })
          }
          rel="noopener noreferrer"
          target="_blank"
        >
          <Github aria-hidden="true" className="me-2 size-4" />
          View on GitHub
          <ArrowRight
            aria-hidden="true"
            className="ms-2 size-4 transition-transform group-hover:translate-x-1"
          />
        </a>
      </Button>
    </div>
  );
}
