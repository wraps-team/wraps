import { ALL_EVENT_TYPES, MANAGED_DEDICATED_IP_POOL_NAME } from "@wraps/core";
import { describe, expect, it } from "vitest";
import { WrapsError } from "../../../utils/shared/errors.js";
import {
  buildDeliveryOptions,
  resolveMatchingEventTypes,
  resolveSendingPoolName,
  validateEventTypes,
} from "../ses.js";

/**
 * Plan 182: `eventTracking.events` was declared on the type but never read —
 * `createSESResources` always sent the same hardcoded ten-type array to SES
 * regardless of what the customer configured. These tests pin the fix:
 * `config.eventTypes` now drives `matchingEventTypes`, defaulting to all ten
 * (byte-identical to the old hardcoded behavior), with an empty array also
 * meaning "all" (matching packages/pulumi), and BOUNCE/COMPLAINT guarded
 * against being dropped since a Suppressed webhook event arrives as a Bounce
 * with bounceSubType === "Suppressed".
 */

describe("resolveMatchingEventTypes", () => {
  it("defaults to all ten event types, in order, when eventTypes is undefined", () => {
    expect(resolveMatchingEventTypes(undefined)).toEqual([
      "SEND",
      "DELIVERY",
      "OPEN",
      "CLICK",
      "BOUNCE",
      "COMPLAINT",
      "REJECT",
      "RENDERING_FAILURE",
      "DELIVERY_DELAY",
      "SUBSCRIPTION",
    ]);
  });

  it("matches the ALL_EVENT_TYPES constant exactly (regression guard for the default)", () => {
    expect(resolveMatchingEventTypes(undefined)).toEqual(ALL_EVENT_TYPES);
    expect(resolveMatchingEventTypes(undefined)).toHaveLength(10);
  });

  it("returns all ten event types when eventTypes is an empty array", () => {
    expect(resolveMatchingEventTypes([])).toEqual(ALL_EVENT_TYPES);
  });

  it("returns exactly the configured subset when eventTypes is non-empty", () => {
    const subset = resolveMatchingEventTypes([
      "SEND",
      "DELIVERY",
      "BOUNCE",
      "COMPLAINT",
    ]);
    expect(subset).toEqual(["SEND", "DELIVERY", "BOUNCE", "COMPLAINT"]);
  });

  it("drops OPEN/CLICK without dropping anything else when only those are excluded", () => {
    const withoutEngagement = ALL_EVENT_TYPES.filter(
      (t) => t !== "OPEN" && t !== "CLICK"
    );
    expect(resolveMatchingEventTypes(withoutEngagement)).toEqual(
      withoutEngagement
    );
  });
});

describe("validateEventTypes", () => {
  it("does not throw when eventTypes is undefined (defaults to all)", () => {
    expect(() => validateEventTypes(undefined)).not.toThrow();
  });

  it("does not throw when eventTypes is an empty array (means all)", () => {
    expect(() => validateEventTypes([])).not.toThrow();
  });

  it("does not throw when eventTypes includes both BOUNCE and COMPLAINT", () => {
    expect(() =>
      validateEventTypes(["SEND", "BOUNCE", "COMPLAINT"])
    ).not.toThrow();
  });

  it("rejects a config that omits BOUNCE", () => {
    expect(() => validateEventTypes(["SEND", "DELIVERY", "COMPLAINT"])).toThrow(
      WrapsError
    );
    try {
      validateEventTypes(["SEND", "DELIVERY", "COMPLAINT"]);
      throw new Error("expected validateEventTypes to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(WrapsError);
      expect((error as WrapsError).code).toBe(
        "EVENT_TYPES_MISSING_SUPPRESSION_EVENTS"
      );
      expect((error as WrapsError).message).toContain("BOUNCE");
    }
  });

  it("rejects a config that omits COMPLAINT", () => {
    expect(() => validateEventTypes(["SEND", "DELIVERY", "BOUNCE"])).toThrow(
      WrapsError
    );
    try {
      validateEventTypes(["SEND", "DELIVERY", "BOUNCE"]);
      throw new Error("expected validateEventTypes to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(WrapsError);
      expect((error as WrapsError).message).toContain("COMPLAINT");
    }
  });

  it("does not require SUBSCRIPTION (unrelated to suppression — preference-center changes only)", () => {
    expect(() =>
      validateEventTypes(["SEND", "DELIVERY", "BOUNCE", "COMPLAINT"])
    ).not.toThrow();
  });
});

describe("buildDeliveryOptions", () => {
  it("returns undefined when neither tlsRequired nor sendingPoolName is set", () => {
    expect(buildDeliveryOptions({})).toBeUndefined();
  });

  it("returns only tlsPolicy when only tlsRequired is set", () => {
    expect(buildDeliveryOptions({ tlsRequired: true })).toEqual({
      tlsPolicy: "REQUIRE",
    });
  });

  it("returns only sendingPoolName when only a pool is set", () => {
    expect(
      buildDeliveryOptions({ sendingPoolName: "wraps-email-managed" })
    ).toEqual({ sendingPoolName: "wraps-email-managed" });
  });

  it("returns both when tlsRequired and a pool are both set", () => {
    expect(
      buildDeliveryOptions({
        tlsRequired: true,
        sendingPoolName: "wraps-email-managed",
      })
    ).toEqual({ tlsPolicy: "REQUIRE", sendingPoolName: "wraps-email-managed" });
  });
});

describe("resolveSendingPoolName", () => {
  it("returns the managed pool name when managed is on and nothing is attached", () => {
    expect(resolveSendingPoolName({ managedDedicatedIps: true })).toBe(
      MANAGED_DEDICATED_IP_POOL_NAME
    );
  });

  it("returns the managed pool name when managed is on and it's already attached", () => {
    expect(
      resolveSendingPoolName({
        managedDedicatedIps: true,
        existingPoolName: MANAGED_DEDICATED_IP_POOL_NAME,
      })
    ).toBe(MANAGED_DEDICATED_IP_POOL_NAME);
  });

  it("refuses to replace a foreign pool when managed is on", () => {
    expect(() =>
      resolveSendingPoolName({
        managedDedicatedIps: true,
        existingPoolName: "customer-pool",
      })
    ).toThrow(WrapsError);
    try {
      resolveSendingPoolName({
        managedDedicatedIps: true,
        existingPoolName: "customer-pool",
      });
      throw new Error("expected resolveSendingPoolName to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(WrapsError);
      expect((error as WrapsError).code).toBe("SENDING_POOL_CONFLICT");
    }
  });

  it("drops our own pool when managed is off (it's being deleted)", () => {
    expect(
      resolveSendingPoolName({
        managedDedicatedIps: false,
        existingPoolName: MANAGED_DEDICATED_IP_POOL_NAME,
      })
    ).toBeUndefined();
  });

  it("keeps a foreign pool untouched when managed is off", () => {
    expect(
      resolveSendingPoolName({
        managedDedicatedIps: false,
        existingPoolName: "customer-pool",
      })
    ).toBe("customer-pool");
  });
});
