import { beforeEach, describe, expect, it, vi } from "vitest";

const { trackEvent } = vi.hoisted(() => ({ trackEvent: vi.fn() }));
vi.mock("@/utils/analytics", () => ({ trackEvent }));

import {
  CLOSING_CTA,
  CLOSING_CTA_LABELS,
  trackClosingCtaClick,
  trackClosingCtaView,
} from "@/lib/closing-cta";

describe("closing CTA analytics", () => {
  beforeEach(() => trackEvent.mockClear());

  it("tags every event with the location and the design variant", () => {
    trackClosingCtaView();
    trackClosingCtaClick("primary");

    for (const [, props] of trackEvent.mock.calls) {
      expect(props.location).toBe(CLOSING_CTA.location);
      expect(props.cta_variant).toBe(CLOSING_CTA.variant);
    }
  });

  it("reports an impression as cta_view", () => {
    trackClosingCtaView();

    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith("cta_view", {
      location: "footer_cta",
      cta_variant: CLOSING_CTA.variant,
    });
  });

  it("reports each click as cta_click with the text the visitor read", () => {
    trackClosingCtaClick("primary");
    trackClosingCtaClick("docs");
    trackClosingCtaClick("github");

    expect(
      trackEvent.mock.calls.map(([name, p]) => [name, p.cta_text])
    ).toEqual([
      ["cta_click", "Start free"],
      ["cta_click", "Read the docs"],
      ["cta_click", "View on GitHub"],
    ]);
  });

  it("keeps the tracked text in step with the visible labels", () => {
    for (const key of Object.keys(CLOSING_CTA_LABELS) as Array<
      keyof typeof CLOSING_CTA_LABELS
    >) {
      trackEvent.mockClear();
      trackClosingCtaClick(key);
      expect(trackEvent.mock.calls[0][1].cta_text).toBe(
        CLOSING_CTA_LABELS[key]
      );
    }
  });

  it("uses a variant name that tells the new design apart from the old one", () => {
    expect(CLOSING_CTA.variant).not.toBe("");
    expect(CLOSING_CTA.variant).not.toBe("closing_v1");
  });
});
