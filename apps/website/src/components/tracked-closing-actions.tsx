"use client";

import { Button } from "@wraps/ui/components/ui/button";
import { ArrowRight } from "lucide-react";
import { trackEvent } from "@/utils/analytics";

type Action = { label: string; href: string };

/** The two buttons for a ClosingPanel, each firing `cta_click` with the page's location. */
export function TrackedClosingActions({
  location,
  primary,
  secondary,
}: {
  location: string;
  primary: Action;
  secondary?: Action;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <Button asChild className="cursor-pointer" size="lg" variant="brand">
        <a
          href={primary.href}
          onClick={() =>
            trackEvent("cta_click", { location, cta_text: primary.label })
          }
        >
          {primary.label}
          <ArrowRight aria-hidden="true" className="ms-2 size-4" />
        </a>
      </Button>
      {secondary && (
        <Button asChild className="cursor-pointer" size="lg" variant="outline">
          <a
            href={secondary.href}
            onClick={() =>
              trackEvent("cta_click", {
                location,
                cta_text: secondary.label,
              })
            }
          >
            {secondary.label}
          </a>
        </Button>
      )}
    </div>
  );
}
