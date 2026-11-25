import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  savingsDollars,
  savingsMultiple,
  savingsPercent,
  wrapsAllIn,
} from "@/app/compare/components/wraps-cost";
import {
  CUSTOMER_IO_INPUTS,
  pricingRows as cioRows,
} from "@/app/compare/customer-io-vs-wraps/pricing-rows";
import {
  KLAVIYO_INPUTS,
  pricingRows as klaviyoRows,
} from "@/app/compare/klaviyo-vs-wraps/pricing-rows";
import {
  CONTACT_PRICE_ROWS,
  CUSTOMER_IO_ESSENTIALS,
} from "@/config/competitor-contact-pricing";

/**
 * Plan 070's corrected totals. The compare pages compute the Wraps column from
 * `estimateCost`; these are the values it must produce, so a pricing change
 * that moves them fails here instead of silently shifting a page.
 */
describe("compare pages: Wraps all-in column", () => {
  it("Klaviyo page rows (the page's own tiers)", () => {
    const expected = [
      ["free", "$1.18/mo", "Free plan + $1.18 Amazon"],
      ["pro", "$35.00/mo", "$29 Pro + $6.00 Amazon"],
      ["pro", "$41.50/mo", "$29 Pro + $12.50 Amazon"],
      ["pro", "$94.10/mo", "$29 Pro + $65.10 Amazon"],
      ["pro", "$165.09/mo", "$29 Pro + $136.09 Amazon"],
    ];
    expect(KLAVIYO_INPUTS.map((row) => row.tier)).toEqual(
      expected.map(([tier]) => tier)
    );
    expect(klaviyoRows.map((row) => [row.wraps, row.wrapsBreakdown])).toEqual(
      expected.map(([, total, breakdown]) => [total, breakdown])
    );
    expect(klaviyoRows.map((row) => row.savings)).toEqual([
      "25x",
      "2.9x",
      "3.6x",
      "7.7x",
      "8.4x",
    ]);
  });

  it("Customer.io page rows (the page's own tiers)", () => {
    const expected = [
      ["free", "$1.18/mo"],
      ["pro", "$35.00/mo"],
      ["pro", "$41.50/mo"],
      ["business", "$264.10/mo"],
      ["business", "$335.09/mo"],
    ];
    expect(CUSTOMER_IO_INPUTS.map((row) => row.tier)).toEqual(
      expected.map(([tier]) => tier)
    );
    expect(cioRows.map((row) => row.wraps)).toEqual(
      expected.map(([, total]) => total)
    );
    expect(cioRows[3].wrapsBreakdown).toBe("$199 Business + $65.10 Amazon");
  });

  it("Customer.io notes reproduce the config price: minimum + overage x profiles", () => {
    const { minimum, includedProfiles, overagePerProfile } =
      CUSTOMER_IO_ESSENTIALS;
    for (const [index, input] of CUSTOMER_IO_INPUTS.entries()) {
      const shown = Number(cioRows[index].competitor.replace(/[^0-9.]/g, ""));
      const note = cioRows[index].competitorNote;
      const over = /\+ (\d+)K overage/.exec(note);
      const extraProfiles = over ? Number(over[1]) * 1000 : 0;
      expect(extraProfiles).toBe(
        Math.max(0, input.contacts - includedProfiles)
      );
      expect(shown).toBeCloseTo(minimum + extraProfiles * overagePerProfile, 2);
    }
    for (const row of CONTACT_PRICE_ROWS) {
      const extra = Math.max(0, row.contacts - includedProfiles);
      expect(row.customerIo).toBeCloseTo(
        minimum + extra * overagePerProfile,
        2
      );
    }
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
      // The Article JSON-LD carries the same description as the metadata.
      expect(source).toMatch(/description: PAGE_DESCRIPTION,\n\s+path/);
      expect(source).toMatch(
        /headline: [^\n]+\n\s+description:\s+PAGE_DESCRIPTION/
      );
    });
  }
});
