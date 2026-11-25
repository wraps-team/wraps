import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  savingsDollars,
  savingsMultiple,
  savingsPercent,
  wrapsAllIn,
} from "@/app/compare/components/wraps-cost";

/**
 * Plan 070's corrected totals. The compare pages compute the Wraps column from
 * `estimateCost`; these are the values it must produce, so a pricing change
 * that moves them fails here instead of silently shifting a page.
 */
describe("compare pages: Wraps all-in column", () => {
  it("Klaviyo rows (Free at 10K, Pro above, à la carte)", () => {
    const rows = [
      [10_000, "free", "$1.18", "Free plan + $1.18 Amazon"],
      [50_000, "pro", "$35.00", "$29 Pro + $6.00 Amazon"],
      [100_000, "pro", "$41.50", "$29 Pro + $12.50 Amazon"],
      [500_000, "pro", "$94.10", "$29 Pro + $65.10 Amazon"],
      [1_000_000, "pro", "$165.09", "$29 Pro + $136.09 Amazon"],
    ] as const;
    for (const [emails, tier, total, breakdown] of rows) {
      const row = wrapsAllIn({ emails, tier });
      expect(row.totalLabel).toBe(total);
      expect(row.breakdown).toBe(breakdown);
    }
  });

  it("Customer.io rows (Business at 500K and 1M)", () => {
    const rows = [
      [10_000, "free", "$1.18"],
      [50_000, "pro", "$35.00"],
      [100_000, "pro", "$41.50"],
      [500_000, "business", "$264.10"],
      [1_000_000, "business", "$335.09"],
    ] as const;
    for (const [emails, tier, total] of rows) {
      expect(wrapsAllIn({ emails, tier }).totalLabel).toBe(total);
    }
    expect(wrapsAllIn({ emails: 500_000, tier: "business" }).breakdown).toBe(
      "$199 Business + $65.10 Amazon"
    );
  });

  it("the default Essentials plan at 1M is $225.09 on Pro", () => {
    expect(
      wrapsAllIn({ emails: 1_000_000, tier: "pro", sesPlan: "essentials" })
        .totalLabel
    ).toBe("$225.09");
  });

  it("derives savings from the displayed numbers", () => {
    expect(savingsMultiple(30, 1.18)).toBe("25x");
    expect(savingsMultiple(100, 35)).toBe("2.9x");
    expect(savingsMultiple(150, 41.5)).toBe("3.6x");
    expect(savingsMultiple(720, 94.1)).toBe("7.7x");
    expect(savingsMultiple(1380, 165.09)).toBe("8.4x");
    expect(savingsDollars(955, 335.09)).toBe("$619.91");
    expect(savingsPercent(955, 335.09)).toBe("65%");
  });
});

describe("Klaviyo and Customer.io compare pages: claim rules", () => {
  const banned = [
    /your reputation/i,
    /own your (data|sending reputation|infrastructure)/i,
    /vendor lock-in/i,
    /self-host/i,
    /real-time analytics/i,
    /no code required/i,
    /most popular/i,
    /soc 2|hipaa/i,
  ];
  for (const slug of ["klaviyo-vs-wraps", "customer-io-vs-wraps"]) {
    it(`${slug} avoids banned wording and names the AWS account`, () => {
      const dir = resolve(__dirname, "../app/compare", slug);
      const source = readFileSync(resolve(dir, "page.tsx"), "utf8");
      for (const pattern of banned) {
        expect(source).not.toMatch(pattern);
      }
      expect(source).toMatch(/AWS account/);
      expect(source).toMatch(/No Wraps lock-in/);
    });
  }
});
