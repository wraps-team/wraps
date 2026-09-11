import { describe, expect, it } from "vitest";
import { roles } from "../access";

// better-auth's organization plugin authorizes its own endpoints against its own
// statements. A custom `ac` replaces that set instead of extending it, so a role
// that never declares `organization` fails closed — which is exactly how
// `authClient.organization.delete()` came to return FORBIDDEN for owners.
describe("organization access control", () => {
  it("lets an owner delete the organization", () => {
    expect(roles.owner.authorize({ organization: ["delete"] }).success).toBe(
      true
    );
  });

  it("lets an owner and an admin update the organization", () => {
    expect(roles.owner.authorize({ organization: ["update"] }).success).toBe(
      true
    );
    expect(roles.admin.authorize({ organization: ["update"] }).success).toBe(
      true
    );
  });

  it("keeps deletion away from admins and members", () => {
    expect(roles.admin.authorize({ organization: ["delete"] }).success).toBe(
      false
    );
    for (const role of [
      "member",
      "marketing",
      "read-only",
      "billing",
    ] as const) {
      expect(roles[role].authorize({ organization: ["delete"] }).success).toBe(
        false
      );
      expect(roles[role].authorize({ organization: ["update"] }).success).toBe(
        false
      );
    }
  });

  it("keeps the Wraps-specific statements intact alongside better-auth's", () => {
    expect(roles.owner.authorize({ billing: ["write"] }).success).toBe(true);
    expect(roles.member.authorize({ apiKeys: ["write"] }).success).toBe(false);
    expect(roles["read-only"].authorize({ contacts: ["read"] }).success).toBe(
      true
    );
  });
});
