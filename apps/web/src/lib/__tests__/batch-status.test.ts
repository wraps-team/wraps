import { describe, expect, it } from "vitest";
import {
  BATCH_STATUS_COLORS,
  BATCH_STATUSES,
  getPausedPresentation,
  getStallPresentation,
  getZeroSendPresentation,
  isStaleDraft,
} from "@/lib/batch";

const NOW = new Date("2026-08-19T12:00:00.000Z");
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60 * 1000);
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

const base = {
  status: "queued" as string,
  pausedReason: null as string | null,
  lastChunkAt: null as Date | null,
  scheduledFor: null as Date | null,
  createdAt: NOW,
};

describe("getStallPresentation", () => {
  it("flags a scheduled broadcast whose time passed without starting", () => {
    const stall = getStallPresentation(
      { ...base, status: "scheduled", scheduledFor: minutesAgo(60) },
      NOW
    );
    expect(stall?.label).toBe("Overdue");
  });

  it("leaves a scheduled broadcast alone inside the delivery-jitter window", () => {
    expect(
      getStallPresentation(
        { ...base, status: "scheduled", scheduledFor: minutesAgo(5) },
        NOW
      )
    ).toBeNull();
  });

  it("leaves a future schedule alone", () => {
    expect(
      getStallPresentation(
        {
          ...base,
          status: "scheduled",
          scheduledFor: new Date(NOW.getTime() + 60 * 60 * 1000),
        },
        NOW
      )
    ).toBeNull();
  });

  it("flags a queued broadcast no worker ever picked up", () => {
    const stall = getStallPresentation(
      { ...base, status: "queued", createdAt: minutesAgo(45) },
      NOW
    );
    expect(stall?.label).toBe("Not started");
  });

  it("leaves a freshly queued broadcast alone", () => {
    expect(
      getStallPresentation(
        { ...base, status: "queued", createdAt: minutesAgo(2) },
        NOW
      )
    ).toBeNull();
  });

  it("flags a processing broadcast with no progress for over 30 minutes", () => {
    const stall = getStallPresentation(
      { ...base, status: "processing", lastChunkAt: minutesAgo(45) },
      NOW
    );
    expect(stall?.label).toBe("No progress");
  });

  it("does NOT flag a paused broadcast — pausing is expected, not a stall", () => {
    expect(
      getStallPresentation(
        {
          ...base,
          status: "processing",
          pausedReason: "daily_quota",
          lastChunkAt: minutesAgo(120),
        },
        NOW
      )
    ).toBeNull();
  });

  it("returns null for terminal statuses", () => {
    for (const status of ["completed", "failed", "cancelled", "draft"]) {
      expect(
        getStallPresentation({ ...base, status, createdAt: daysAgo(90) }, NOW)
      ).toBeNull();
    }
  });
});

describe("isStaleDraft", () => {
  it("flags a draft older than 30 days", () => {
    expect(
      isStaleDraft({ status: "draft", createdAt: daysAgo(117) }, NOW)
    ).toBe(true);
  });

  it("leaves a recent draft alone", () => {
    expect(isStaleDraft({ status: "draft", createdAt: daysAgo(3) }, NOW)).toBe(
      false
    );
  });

  it("never flags a non-draft, however old", () => {
    expect(
      isStaleDraft({ status: "completed", createdAt: daysAgo(400) }, NOW)
    ).toBe(false);
  });
});

describe("status badge palette", () => {
  it("uses only semantic theme tokens — no raw Tailwind palette", () => {
    const rawPalette =
      /\b(?:bg|text|border)-(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;
    for (const status of BATCH_STATUSES) {
      expect(BATCH_STATUS_COLORS[status]).not.toMatch(rawPalette);
    }
    expect(
      getPausedPresentation("processing", "daily_quota")?.color
    ).not.toMatch(rawPalette);
    expect(getZeroSendPresentation("completed", 0)?.color).not.toMatch(
      rawPalette
    );
  });
});
