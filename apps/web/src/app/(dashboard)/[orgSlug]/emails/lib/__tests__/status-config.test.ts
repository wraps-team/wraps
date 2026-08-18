/**
 * Shared status rendering (audit finding F12)
 *
 * Two defects are pinned here. The list and the detail page each had their own
 * colour map, so the same status was a different colour on each page. And
 * neither map had a fallback, so a status outside the union made `config.icon`
 * undefined and React blanked the whole table - a latent crash sitting behind
 * any new SES event type or enum value.
 */

import { describe, expect, it } from "vitest";
import type { EmailStatus } from "../../types";
import {
  getEmailStatusConfig,
  humanizeEmailStatus,
  normalizeEmailStatus,
} from "../status-config";

const ALL_STATUSES: EmailStatus[] = [
  "sent",
  "delivered",
  "opened",
  "clicked",
  "bounced",
  "complained",
  "failed",
  "rejected",
  "rendering_failure",
  "delivery_delay",
  "suppressed",
];

const RAW_COLOR =
  /\b(?:bg|text|border)-(?!muted|border|foreground|background)[a-z]+-\d{2,3}/;

describe("getEmailStatusConfig", () => {
  it("returns a config for every status in the union", () => {
    for (const status of ALL_STATUSES) {
      const config = getEmailStatusConfig(status);
      expect(config.icon, status).toBeTruthy();
      expect(config.label, status).not.toBe("");
      expect(config.tone.text, status).not.toBe("");
    }
  });

  it("falls back to a neutral badge for an unknown status instead of throwing", () => {
    const config = getEmailStatusConfig("quarantined_by_new_ses_feature");

    expect(config.label).toBe("Quarantined by new ses feature");
    expect(config.icon).toBeTruthy();
    expect(config.tone.text).toBe("text-muted-foreground");
  });

  it("never returns an undefined icon, whatever it is handed", () => {
    for (const value of [
      "",
      "   ",
      "Delivery_delay",
      "TOTALLY_UNKNOWN",
      "42",
    ]) {
      expect(getEmailStatusConfig(value).icon, value).toBeTruthy();
    }
  });

  it("gives every raw colour a dark variant", () => {
    for (const status of ALL_STATUSES) {
      const { text } = getEmailStatusConfig(status).tone;
      if (RAW_COLOR.test(text)) {
        expect(text, `${status} has a light-only colour: ${text}`).toContain(
          "dark:"
        );
      }
    }
  });

  it("renders the same status identically wherever it is asked for", () => {
    // The list asked for "opened" and got blue; the detail page asked for the
    // same status and got purple. One lookup, one answer.
    expect(getEmailStatusConfig("opened")).toEqual(
      getEmailStatusConfig("Open")
    );
    expect(getEmailStatusConfig("clicked")).toEqual(
      getEmailStatusConfig("click")
    );
  });
});

describe("humanizeEmailStatus", () => {
  it("turns a raw enum into a sentence", () => {
    expect(humanizeEmailStatus("Rendering_failure")).toBe("Rendering failure");
    expect(humanizeEmailStatus("delivery_delay")).toBe("Delivery delay");
    expect(humanizeEmailStatus("bounced")).toBe("Bounced");
  });

  it("has something to say about an empty value", () => {
    expect(humanizeEmailStatus("")).toBe("Unknown");
    expect(humanizeEmailStatus("   ")).toBe("Unknown");
  });
});

describe("normalizeEmailStatus", () => {
  it("maps the SES event names the timeline stores", () => {
    // The timeline keeps the raw SES event type, so the detail page used to look
    // every event up by a key its own map did not have: no colour at all.
    expect(normalizeEmailStatus("send")).toBe("sent");
    expect(normalizeEmailStatus("delivery")).toBe("delivered");
    expect(normalizeEmailStatus("bounce")).toBe("bounced");
    expect(normalizeEmailStatus("complaint")).toBe("complained");
    expect(normalizeEmailStatus("rendering_failure")).toBe("rendering_failure");
    expect(normalizeEmailStatus("Rendering Failure")).toBe("rendering_failure");
    expect(normalizeEmailStatus("deliverydelay")).toBe("delivery_delay");
  });

  it("returns null rather than guessing", () => {
    expect(normalizeEmailStatus("archived")).toBeNull();
  });
});
