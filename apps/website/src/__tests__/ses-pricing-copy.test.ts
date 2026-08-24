import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SES_PLANS, SES_PRICING_COPY } from "../lib/ses-cost";

const repoRoot = resolve(__dirname, "..", "..", "..", "..");
const readRepo = (relativePath: string) =>
  readFileSync(resolve(repoRoot, relativePath), "utf8");

// The 29 tier-1 marketing source files swept by plan 128 (step 0's 45-hit /
// 30-file inventory, minus this suite's own sibling agents-page.test.ts).
// Hardcoded on purpose: a glob would silently stop covering a renamed file
// and would sweep in the out-of-scope agent surfaces.
const FILES = [
  "apps/web/src/app/(onboarding)/[orgSlug]/onboarding/components/billing-step.tsx",
  "apps/web/src/app/(subscription)/[orgSlug]/upgrade/page.tsx",
  "apps/web/src/app/page.tsx",
  "apps/web/src/components/organization-settings-billing.tsx",
  "apps/web/src/lib/plans.ts",
  "apps/website/src/app/compare/amazon-ses-vs-wraps/page.tsx",
  "apps/website/src/app/compare/customer-io-vs-wraps/page.tsx",
  "apps/website/src/app/compare/klaviyo-vs-wraps/page.tsx",
  "apps/website/src/app/compare/mailgun-vs-wraps/page.tsx",
  "apps/website/src/app/compare/page.tsx",
  "apps/website/src/app/compare/postmark-vs-wraps/page.tsx",
  "apps/website/src/app/compare/resend-vs-wraps/page.tsx",
  "apps/website/src/app/compare/sendgrid-vs-wraps/page.tsx",
  "apps/website/src/app/landing/components/faq-accordion.tsx",
  "apps/website/src/app/landing/components/features-section.tsx",
  "apps/website/src/app/landing/components/hero-section.tsx",
  "apps/website/src/app/landing/components/infrastructure-section.tsx",
  "apps/website/src/app/landing/components/pricing-section.tsx",
  "apps/website/src/app/landing/components/problem-contrast-section.tsx",
  "apps/website/src/app/landing/components/product-tabbed-section.tsx",
  "apps/website/src/app/landing/components/sms-teaser-section.tsx",
  "apps/website/src/app/page.tsx",
  "apps/website/src/app/platform/components/pricing-section.tsx",
  "apps/website/src/app/terms/page.tsx",
  "apps/website/src/app/why-wraps/components/faq-section.tsx",
  "apps/website/src/app/why-wraps/page.tsx",
  "apps/website/src/config/pricing.ts",
] as const;

describe("SES pricing facts (lib/ses-cost.ts)", () => {
  it("SES_PLANS carries the verified 2026-07-21 AWS rates", () => {
    expect(SES_PLANS.alacarte.perThousandEmails).toBe(0.1);
    expect(SES_PLANS.essentials.perThousandEmails).toBe(0.16);
    expect(SES_PLANS.essentials.defaultForNewAccounts).toBe(true);
    expect(SES_PLANS.pro.monthlyFee).toBe(105);
    expect(SES_PLANS.enterprise.monthlyFee).toBe(500);
  });
});

describe("SES_PRICING_COPY", () => {
  it("every variant states the à la carte rate", () => {
    for (const value of Object.values(SES_PRICING_COPY)) {
      expect(value).toContain("$0.10");
    }
  });

  it("every variant except rateStat also states the Essentials default rate", () => {
    expect(SES_PRICING_COPY.rateShort).toContain("$0.16");
    expect(SES_PRICING_COPY.rateLong).toContain("$0.16");
  });

  it("rateStat carries the à la carte qualifier instead", () => {
    expect(SES_PRICING_COPY.rateStat).toContain("à la carte");
  });
});

describe("Case 3 — regression gate: no bare $0.10 claim in tier-1 marketing surfaces", () => {
  it.each(FILES)(
    "%s: every $0.10 mention is qualified with à la carte or $0.16",
    (file) => {
      const source = readRepo(file);
      if (!source.includes("$0.10")) {
        return;
      }
      const qualified =
        source.includes("à la carte") || source.includes("$0.16");
      expect(qualified, `${file} has an unqualified "$0.10" claim`).toBe(true);
    }
  );
});
