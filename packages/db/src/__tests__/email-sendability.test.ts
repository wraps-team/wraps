/**
 * The send gate is an allowlist, and these tests exist to keep it one.
 *
 * The bug they pin: the workflow step handler asked `emailStatus ===
 * "unsubscribed" || "bounced" || "complained"` and so had no opinion about
 * "suppressed" — the status `processSuppression` writes for every address SES
 * refuses at the account suppression list. Those contacts passed the gate,
 * reached SES, and came back as synthetic bounces charged to the workflow's
 * send stats. Three other hand-written copies of the status list (two API
 * validators, one form schema) lost the same value the same way.
 *
 * A denylist answers "sendable" for a status it has not heard of. Every status
 * this product invents arrives from a deliverability event, so that default is
 * always the wrong one.
 */

import { describe, expect, it } from "vitest";
import {
  EMAIL_STATUSES,
  type EmailStatus,
  isEmailSendable,
  SENDABLE_EMAIL_STATUSES,
} from "../schema/contacts";

describe("SENDABLE_EMAIL_STATUSES", () => {
  it("permits exactly one status", () => {
    // Pinned rather than derived: widening the set is a deliverability
    // decision, and it should have to be made here as well as in the map.
    expect([...SENDABLE_EMAIL_STATUSES]).toEqual(["active"]);
  });

  it("carries suppressed among the statuses it knows about", () => {
    // The value four separate hand-written lists dropped.
    expect([...EMAIL_STATUSES]).toEqual([
      "active",
      "unsubscribed",
      "bounced",
      "complained",
      "suppressed",
    ]);
  });
});

describe("isEmailSendable", () => {
  it("refuses a suppressed contact", () => {
    expect(isEmailSendable("suppressed")).toBe(false);
  });

  it.each(["unsubscribed", "bounced", "complained", "suppressed"] as const)(
    "refuses %s",
    (status) => {
      expect(isEmailSendable(status)).toBe(false);
    }
  );

  it("allows an active contact", () => {
    expect(isEmailSendable("active")).toBe(true);
  });

  it("treats a null status as sendable", () => {
    // Rows carrying an address and no status predate the column. Every caller
    // checks for an address first, so null here means "legacy", not "no email".
    // channelEligibilitySQL spells the same rule as a separate IS NULL arm,
    // because `NULL IN ('active')` is NULL rather than false in Postgres.
    expect(isEmailSendable(null)).toBe(true);
    expect(isEmailSendable(undefined)).toBe(true);
  });

  it("refuses every status outside the allowlist", () => {
    const refused = EMAIL_STATUSES.filter((status) => !isEmailSendable(status));
    const expected = EMAIL_STATUSES.filter(
      (status) =>
        !(SENDABLE_EMAIL_STATUSES as readonly string[]).includes(status)
    );

    expect(refused).toEqual(expected);
    expect(refused.length).toBeGreaterThan(0);
  });

  it("refuses a status this build has never heard of", () => {
    // The property that makes it an allowlist. A sixth status added to the
    // schema fails the build at EMAIL_STATUS_SENDABLE before reaching here,
    // but a value arriving from an older or newer writer must not send.
    expect(isEmailSendable("quarantined" as EmailStatus)).toBe(false);
  });
});
