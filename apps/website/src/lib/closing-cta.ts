import { trackEvent } from "@/utils/analytics";

/**
 * Analytics for the closing call to action on the homepage.
 *
 * `cta_view` is the impression, so a section nobody scrolls to reads differently
 * from one people see and skip. `cta_click` carries the text the visitor read.
 * Both carry `cta_variant`, so this design can be compared with the one it
 * replaced (`closing_v1`, whose primary button read "Start building" but
 * reported "Free CLI Quickstart"). Signup clicks are also captured globally as
 * `signup_click` by the analytics provider.
 */
export const CLOSING_CTA = {
  location: "footer_cta",
  variant: "closing_v2",
} as const;

export const CLOSING_CTA_LABELS = {
  primary: "Start free",
  docs: "Read the docs",
  github: "View on GitHub",
} as const;

export function trackClosingCtaView(): void {
  trackEvent("cta_view", {
    location: CLOSING_CTA.location,
    cta_variant: CLOSING_CTA.variant,
  });
}

export function trackClosingCtaClick(
  key: keyof typeof CLOSING_CTA_LABELS
): void {
  trackEvent("cta_click", {
    location: CLOSING_CTA.location,
    cta_text: CLOSING_CTA_LABELS[key],
    cta_variant: CLOSING_CTA.variant,
  });
}
