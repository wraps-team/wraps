import { beforeEach, describe, expect, it, vi } from "vitest";

const { trackEvent } = vi.hoisted(() => ({ trackEvent: vi.fn() }));
vi.mock("@/utils/analytics", () => ({ trackEvent }));

import {
  builderCta,
  checkerCta,
  DEMO_DOMAINS,
  detectSes,
  guideCta,
  headersCta,
  ratesCta,
  TOOL_CTA_VARIANT,
  TOOL_SIGNUP_URL,
  trackToolCtaClick,
  trackToolCtaView,
} from "@/lib/tool-cta";

const baseChecker = {
  domain: "acme.com",
  spf: "pass",
  dkim: "pass",
  dmarc: "pass",
  onSes: false,
  dkimUnverifiable: false,
} as const;

describe("detectSes", () => {
  const none = {
    spfRecord: null,
    spfIncludes: [],
    dkimWarnings: [],
    mxExchanges: [],
  };

  it("finds amazonses.com in the SPF record", () => {
    expect(
      detectSes({
        ...none,
        spfRecord: "v=spf1 include:_spf.google.com include:amazonses.com -all",
      })
    ).toBe(true);
  });

  it("finds the AWS SPF include", () => {
    expect(
      detectSes({ ...none, spfRecord: "v=spf1 include:_spf.aws ~all" })
    ).toBe(true);
  });

  it("finds SES in the parsed includes when the raw record is missing", () => {
    expect(detectSes({ ...none, spfIncludes: ["include:amazonses.com"] })).toBe(
      true
    );
  });

  it("uses the checker's AWS SES DKIM warning, in any case", () => {
    expect(
      detectSes({
        ...none,
        dkimWarnings: ["DKIM not verifiable (AWS SES uses random selectors)."],
      })
    ).toBe(true);
    expect(detectSes({ ...none, dkimWarnings: ["aws ses detected"] })).toBe(
      true
    );
  });

  it("finds an SES MX host", () => {
    expect(
      detectSes({
        ...none,
        mxExchanges: ["feedback-smtp.us-east-1.amazonses.com"],
      })
    ).toBe(true);
  });

  it("does not flag other providers", () => {
    expect(
      detectSes({
        ...none,
        spfRecord: "v=spf1 include:_spf.google.com include:sendgrid.net ~all",
        dkimWarnings: ["SendGrid uses custom DKIM selectors."],
        mxExchanges: ["aspmx.l.google.com"],
      })
    ).toBe(false);
  });
});

describe("checkerCta", () => {
  it("keeps the generic offer for the demo domains, whatever the result", () => {
    for (const domain of DEMO_DOMAINS) {
      const cta = checkerCta({ ...baseChecker, domain, spf: "fail" });
      expect(cta.state).toBe("demo");
    }
    expect(checkerCta({ ...baseChecker, domain: "WWW.Stripe.com" }).state).toBe(
      "demo"
    );
  });

  it("offers `email connect` to an SES domain with issues, and counts them", () => {
    const cta = checkerCta({
      ...baseChecker,
      onSes: true,
      dmarc: "warn",
    });
    expect(cta.state).toBe("ses-with-issues");
    expect(cta.headline).toContain("1 email authentication issue");
    expect(cta.headline).not.toContain("issues");
    expect(cta.command).toContain("email connect");

    const two = checkerCta({
      ...baseChecker,
      onSes: true,
      dmarc: "none",
      spf: "warn",
    });
    expect(two.headline).toContain("2 email authentication issues");
  });

  it("does not count SES's undiscoverable DKIM as an issue", () => {
    const cta = checkerCta({
      ...baseChecker,
      onSes: true,
      dkim: "none",
      dkimUnverifiable: true,
    });
    expect(cta.state).toBe("clean");
  });

  it("counts a missing DKIM when the domain is not on SES", () => {
    const cta = checkerCta({ ...baseChecker, dkim: "none" });
    expect(cta.state).toBe("issues");
    expect(cta.command).toContain("email init");
  });

  it("offers `email init` to a non-SES domain with weak records", () => {
    expect(checkerCta({ ...baseChecker, spf: "warn" }).state).toBe("issues");
    expect(checkerCta({ ...baseChecker, dmarc: "fail" }).state).toBe("issues");
  });

  it("is a soft prompt when everything passes", () => {
    const cta = checkerCta(baseChecker);
    expect(cta.state).toBe("clean");
    expect(cta.command).toBeNull();
  });
});

describe("builderCta", () => {
  it("points a record builder at `email init`", () => {
    for (const kind of ["spf", "dmarc"] as const) {
      const cta = builderCta(kind);
      expect(cta.state).toBe("builder");
      expect(cta.command).toContain("email init");
    }
  });
});

describe("ratesCta", () => {
  it("is calm when both rates are inside best practice", () => {
    expect(
      ratesCta(["within-best-practice", "within-best-practice"]).state
    ).toBe("rates-ok");
  });

  it("warns once either rate is past best practice, review or pause", () => {
    for (const status of ["above-best-practice", "review", "pause"] as const) {
      expect(ratesCta(["within-best-practice", status]).state).toBe(
        "rates-risk"
      );
    }
  });
});

describe("headersCta", () => {
  it("treats a failing check as a problem", () => {
    for (const result of ["fail", "softfail", "permerror", "none"]) {
      expect(
        headersCta({ results: ["pass", result], aligned: true }).state
      ).toBe("headers-fail");
    }
  });

  it("treats a misaligned Return-Path as a problem", () => {
    expect(headersCta({ results: ["pass"], aligned: false }).state).toBe(
      "headers-fail"
    );
  });

  it("is calm when everything passes or alignment is unknown", () => {
    expect(headersCta({ results: ["pass", "pass"], aligned: null }).state).toBe(
      "headers-ok"
    );
    expect(headersCta({ results: [], aligned: null }).state).toBe("headers-ok");
  });
});

describe("guideCta", () => {
  it("offers `email connect` to someone who finished the guide without an account", () => {
    const cta = guideCta();
    expect(cta.state).toBe("guide");
    expect(cta.command).toContain("email connect");
    expect(cta.body).toMatch(/no Wraps account/i);
  });
});

describe("every call to action", () => {
  const all = [
    checkerCta({ ...baseChecker, domain: "stripe.com" }),
    checkerCta({ ...baseChecker, onSes: true, dmarc: "warn" }),
    checkerCta({ ...baseChecker, spf: "fail" }),
    checkerCta(baseChecker),
    builderCta("spf"),
    ratesCta(["review"]),
    ratesCta(["within-best-practice"]),
    headersCta({ results: ["fail"], aligned: null }),
    headersCta({ results: ["pass"], aligned: null }),
    guideCta(),
  ];

  it("asks for signup, never an email address", () => {
    for (const cta of all) {
      expect(cta.primary.href).toBe(TOOL_SIGNUP_URL);
      expect(cta.primary.label.length).toBeGreaterThan(0);
      expect(cta.headline.length).toBeGreaterThan(0);
      expect(cta.body.length).toBeGreaterThan(0);
    }
  });

  it("keeps price claims out of the box", () => {
    for (const cta of all) {
      expect(`${cta.headline} ${cta.body}`).not.toMatch(/\$|per month|\/mo\b/i);
    }
  });

  it("keeps the secondary link on this site, not the dashboard", () => {
    for (const cta of all) {
      expect(cta.secondary.href.startsWith("/")).toBe(true);
    }
  });
});

describe("tool CTA analytics", () => {
  beforeEach(() => trackEvent.mockClear());

  it("reports an impression as tool_cta_view with tool, state and page", () => {
    trackToolCtaView({
      tool: "checker",
      state: "issues",
      pagePath: "/tools/dmarc-checker",
    });

    expect(trackEvent).toHaveBeenCalledWith("tool_cta_view", {
      tool: "checker",
      state: "issues",
      page_path: "/tools/dmarc-checker",
      cta_variant: TOOL_CTA_VARIANT,
    });
  });

  it("reports which control was used on a click", () => {
    for (const control of ["primary", "secondary", "copy"] as const) {
      trackEvent.mockClear();
      trackToolCtaClick(
        {
          tool: "spf-builder",
          state: "builder",
          pagePath: "/tools/spf-builder",
        },
        control
      );
      expect(trackEvent).toHaveBeenCalledWith("tool_cta_click", {
        tool: "spf-builder",
        state: "builder",
        page_path: "/tools/spf-builder",
        cta_variant: TOOL_CTA_VARIANT,
        control,
      });
    }
  });
});
