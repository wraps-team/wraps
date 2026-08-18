/**
 * Emails list - state selection (audit findings F1 and F6)
 *
 * The page collapsed four situations into one sentence: "No emails found /
 * Try adjusting the time range or send your first email". It was shown for a
 * failed fetch (579 of them across six weeks), for an organization that had
 * never sent, for a filtered-out window, and for an organization the SES
 * sandbox will reject.
 *
 * These tests pin the split, and specifically pin the two claims the old copy
 * got wrong: a failure is never reported as an empty result, and an
 * organization AWS will reject is never told to send its first email.
 */

import { describe, expect, it } from "vitest";
import {
  describeActiveFilters,
  nextWiderRange,
  rangeLabel,
  resolveEmailsListState,
} from "../list-state";

const base = {
  days: 7,
  hasEverSent: false,
  isError: false,
  rowCount: 0,
  sandboxStatus: null as boolean | null,
};

describe("resolveEmailsListState", () => {
  it("reports a failed fetch as an error, never as an empty result", () => {
    expect(resolveEmailsListState({ ...base, isError: true })).toBe("error");
  });

  it("keeps the error state even for a sandboxed org with no sends", () => {
    expect(
      resolveEmailsListState({
        ...base,
        isError: true,
        sandboxStatus: true,
      })
    ).toBe("error");
  });

  it("says nothing at all when there are rows", () => {
    expect(resolveEmailsListState({ ...base, rowCount: 3 })).toBe("ok");
  });

  it("blames the search term when one is active", () => {
    expect(resolveEmailsListState({ ...base, search: "invoice" })).toBe(
      "empty-filtered"
    );
  });

  it("blames the status filter when one is active", () => {
    expect(resolveEmailsListState({ ...base, status: "bounced" })).toBe(
      "empty-filtered"
    );
  });

  it("treats sends outside the window as filtered, not as never-sent", () => {
    expect(resolveEmailsListState({ ...base, hasEverSent: true })).toBe(
      "empty-filtered"
    );
  });

  it("prefers the filtered state over sandbox when the org has sent before", () => {
    // A sandboxed org can still send to verified addresses. If it has, an
    // empty window is a window problem, not a sandbox problem.
    expect(
      resolveEmailsListState({
        ...base,
        hasEverSent: true,
        sandboxStatus: true,
      })
    ).toBe("empty-filtered");
  });

  it("names the sandbox for an org that has never sent and is sandboxed", () => {
    expect(resolveEmailsListState({ ...base, sandboxStatus: true })).toBe(
      "empty-sandbox"
    );
  });

  it("falls back to never-sent in production", () => {
    expect(resolveEmailsListState({ ...base, sandboxStatus: false })).toBe(
      "empty-never-sent"
    );
  });

  it("falls back to never-sent when sandbox status was never scanned", () => {
    expect(resolveEmailsListState({ ...base, sandboxStatus: null })).toBe(
      "empty-never-sent"
    );
  });
});

describe("describeActiveFilters", () => {
  it("names the search term and the window", () => {
    expect(describeActiveFilters({ days: 7, search: "invoice" })).toBe(
      'No messages match "invoice" in the last 7 days.'
    );
  });

  it("names the status and the window", () => {
    expect(describeActiveFilters({ days: 30, status: "bounced" })).toBe(
      "No bounced messages in the last 30 days."
    );
  });

  it("names both when both are active", () => {
    expect(
      describeActiveFilters({ days: 1, search: "receipt", status: "delivered" })
    ).toBe('No delivered messages match "receipt" in the last 24 hours.');
  });

  it("still names the window when nothing else is filtered", () => {
    expect(describeActiveFilters({ days: 90 })).toBe(
      "No messages in the last 90 days."
    );
  });
});

describe("nextWiderRange", () => {
  it("steps up through the windows the table offers", () => {
    expect(nextWiderRange(1)).toBe(7);
    expect(nextWiderRange(7)).toBe(30);
    expect(nextWiderRange(30)).toBe(90);
  });

  it("has nothing to offer at the widest window", () => {
    expect(nextWiderRange(90)).toBeNull();
  });

  it("steps up from a window that is not one of the presets", () => {
    expect(nextWiderRange(14)).toBe(30);
  });
});

describe("rangeLabel", () => {
  it("says hours for the one-day window", () => {
    expect(rangeLabel(1)).toBe("the last 24 hours");
  });

  it("says days for the rest", () => {
    expect(rangeLabel(7)).toBe("the last 7 days");
  });
});
