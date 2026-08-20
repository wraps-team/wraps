/**
 * Contact status presentation — palette and engagement rates.
 *
 * Audit findings F15 and F24:
 *  - F15: the status badge maps carried raw Tailwind palette classes with no
 *    dark variant, so a near-white badge glared off a dark card.
 *  - F24: per-contact engagement cells divided two counters that are written by
 *    different, unsynchronised writers, and rendered whatever came out as a
 *    percentage — "400% click" was on screen in a real org.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONTACT_STATUS_COLORS,
  CONTACT_STATUSES,
  EMAIL_STATUS_COLORS,
  EMAIL_STATUSES,
  engagementRate,
  SMS_STATUS_COLORS,
  SMS_STATUSES,
} from "../contacts";

const RAW_PALETTE =
  /\b(?:bg|text|border|from|via|to|ring|fill|stroke)-(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;

describe("contact status palette", () => {
  it("uses only semantic theme tokens for email status badges", () => {
    for (const status of EMAIL_STATUSES) {
      expect(EMAIL_STATUS_COLORS[status]).not.toMatch(RAW_PALETTE);
    }
  });

  it("uses only semantic theme tokens for SMS status badges", () => {
    for (const status of SMS_STATUSES) {
      expect(SMS_STATUS_COLORS[status]).not.toMatch(RAW_PALETTE);
    }
  });

  it("uses only semantic theme tokens for the deprecated status badges", () => {
    for (const status of CONTACT_STATUSES) {
      expect(CONTACT_STATUS_COLORS[status]).not.toMatch(RAW_PALETTE);
    }
  });

  it("keeps a failing status visually distinct from a healthy one", () => {
    expect(EMAIL_STATUS_COLORS.active).not.toBe(EMAIL_STATUS_COLORS.bounced);
    expect(EMAIL_STATUS_COLORS.active).not.toBe(
      EMAIL_STATUS_COLORS.unsubscribed
    );
  });
});

describe("contacts surface palette", () => {
  const componentDir = path.resolve(
    import.meta.dirname,
    "../../app/(dashboard)/[orgSlug]/contacts/components"
  );

  // `contacts-table.tsx` is deliberately absent — it is not part of this
  // change's ownership. Every other component on the surface is covered here,
  // including the ones that are already clean, so they stay that way.
  const files = [
    "columns.tsx",
    "contact-analytics.tsx",
    "contact-details-sheet.tsx",
    "contact-form-dialog.tsx",
    "contact-timeline.tsx",
    "contacts-empty-state.tsx",
    "import-contacts-dialog.tsx",
  ];

  for (const file of files) {
    it(`${file} carries no raw Tailwind palette class`, () => {
      const source = readFileSync(path.join(componentDir, file), "utf8");
      const offenders = source
        .split("\n")
        .map((line, i) => ({ line, number: i + 1 }))
        .filter(({ line }) => RAW_PALETTE.test(line))
        .map(({ line, number }) => `${file}:${number}: ${line.trim()}`);

      expect(offenders).toEqual([]);
    });
  }
});

describe("engagementRate", () => {
  it("returns the percentage for an ordinary ratio", () => {
    expect(engagementRate(3, 10)).toBe(30);
    expect(engagementRate(1, 3)).toBeCloseTo(33.33, 1);
  });

  it("returns 0 when nothing engaged", () => {
    expect(engagementRate(0, 10)).toBe(0);
  });

  it("allows a full 100%", () => {
    expect(engagementRate(10, 10)).toBe(100);
  });

  it("refuses to invent a rate when nothing was sent", () => {
    expect(engagementRate(0, 0)).toBeNull();
    expect(engagementRate(4, 0)).toBeNull();
  });

  it("refuses an impossible ratio rather than printing 400%", () => {
    // Observed live: smsSent 1, smsClicked 4. The counters are incremented by
    // different writers, so the numerator can outrun the denominator.
    expect(engagementRate(4, 1)).toBeNull();
    expect(engagementRate(15, 10)).toBeNull();
  });

  it("refuses negative inputs", () => {
    expect(engagementRate(-1, 10)).toBeNull();
    expect(engagementRate(1, -10)).toBeNull();
  });
});
