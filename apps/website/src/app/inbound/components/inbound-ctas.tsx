"use client";

import { Button } from "@wraps/ui/components/ui/button";
import { ArrowRight } from "lucide-react";
import { trackEvent } from "@/utils/analytics";

function track(location: string, ctaText: string) {
  trackEvent("cta_click", { location, cta_text: ctaText });
}

export function InboundHeroCTA() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button asChild className="cursor-pointer" size="lg" variant="brand">
        <a
          href="/docs/quickstart/email/inbound"
          onClick={() => track("inbound_hero", "Get started")}
        >
          Get started
        </a>
      </Button>
      <Button asChild className="cursor-pointer" size="lg" variant="outline">
        <a
          href="#developers"
          onClick={() => track("inbound_hero", "See how it works")}
        >
          See how it works
        </a>
      </Button>
    </div>
  );
}

export function InboundClosingActions() {
  return (
    <div className="flex flex-wrap gap-3">
      <Button asChild className="cursor-pointer" size="lg" variant="brand">
        <a
          href="/docs/quickstart/email/inbound"
          onClick={() => track("inbound_closing", "Get started")}
        >
          Get started
          <ArrowRight aria-hidden="true" className="ms-2 size-4" />
        </a>
      </Button>
      <Button asChild className="cursor-pointer" size="lg" variant="outline">
        <a
          href="/docs/cli-reference/email"
          onClick={() => track("inbound_closing", "CLI reference")}
        >
          CLI reference
        </a>
      </Button>
    </div>
  );
}
