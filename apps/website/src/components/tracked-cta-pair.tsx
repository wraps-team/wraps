"use client";

import { Button } from "@wraps/ui/components/ui/button";
import { trackEvent } from "@/utils/analytics";

const SIGNUP_URL = "https://app.wraps.dev/auth?mode=signup";

/**
 * A page's primary "Start free" button and one secondary link, both reporting
 * `cta_click` with the visible text and the section they sit in.
 */
export function TrackedCtaPair({
  location,
  secondary,
  size = "lg",
}: {
  location: string;
  secondary: { label: string; href: string };
  size?: "default" | "lg";
}) {
  const track = (ctaText: string) =>
    trackEvent("cta_click", { location, cta_text: ctaText });

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button asChild className="cursor-pointer" size={size} variant="brand">
        <a href={SIGNUP_URL} onClick={() => track("Start free")}>
          Start free
        </a>
      </Button>
      <Button asChild className="cursor-pointer" size={size} variant="outline">
        <a href={secondary.href} onClick={() => track(secondary.label)}>
          {secondary.label}
        </a>
      </Button>
    </div>
  );
}
