import { describe, expect, it } from "vitest";
import { describeManagedDedicatedIpCost } from "../managed-dedicated-ips.js";

describe("describeManagedDedicatedIpCost", () => {
  it("says included for PRO", () => {
    const result = describeManagedDedicatedIpCost("PRO", "us-east-1");
    expect(result).toContain("us-east-1");
    expect(result).toContain("Included in your SES Pro plan");
  });

  it("says included for ENTERPRISE", () => {
    const result = describeManagedDedicatedIpCost("ENTERPRISE", "us-east-1");
    expect(result).toContain("us-east-1");
    expect(result).toContain("Included in your SES Enterprise plan");
  });

  it("says à la carte for NONE", () => {
    const result = describeManagedDedicatedIpCost("NONE", "us-east-1");
    expect(result).toContain("us-east-1");
    expect(result).toContain("À la carte");
  });

  it("flags the unpublished Essentials add-on rate", () => {
    const result = describeManagedDedicatedIpCost("ESSENTIALS", "us-east-1");
    expect(result).toContain("us-east-1");
    expect(result).toContain("does not publish the Essentials add-on rate");
  });

  it("hedges when the plan could not be read", () => {
    const result = describeManagedDedicatedIpCost(undefined, "us-east-1");
    expect(result).toContain("us-east-1");
    expect(result).toContain("Couldn't read");
  });
});
