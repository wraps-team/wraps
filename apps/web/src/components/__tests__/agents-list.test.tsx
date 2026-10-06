import { describe, expect, it, vi } from "vitest";
import type { AgentWithMeta } from "@/lib/agents";

vi.mock("@/actions/agents", () => ({
  listAgents: vi.fn(),
  killAgent: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { policySummary } from "../agents-list";

function makeAgent(policy: Partial<AgentWithMeta["policy"]> = {}) {
  return {
    id: "agent-1",
    name: "support-bot",
    emailAddress: "support-bot@acme.com",
    domain: "acme.com",
    status: "ACTIVE",
    policy: {
      maxPerHour: 20,
      maxPerDay: 100,
      allowedRecipients: [],
      allowedRecipientDomains: [],
      ...policy,
    },
    createdAt: new Date("2026-01-01T00:00:00Z"),
    createdBy: null,
  } as AgentWithMeta;
}

describe("policySummary", () => {
  it("says every send needs approval when the allowlist is empty", () => {
    const summary = policySummary(makeAgent());
    expect(summary).toContain("no allowlist, every send needs approval");
    expect(summary).not.toContain("any recipient");
  });

  it("counts a single allowlisted recipient", () => {
    expect(
      policySummary(makeAgent({ allowedRecipients: ["a@acme.com"] }))
    ).toContain("1 allowlisted target");
  });

  it("counts recipients and domains together", () => {
    expect(
      policySummary(
        makeAgent({
          allowedRecipients: ["a@acme.com"],
          allowedRecipientDomains: ["partner.io"],
        })
      )
    ).toContain("2 allowlisted targets");
  });

  it("still renders the caps", () => {
    expect(
      policySummary(makeAgent({ maxPerHour: 20, maxPerDay: 100 })).startsWith(
        "20/hr · 100/day · "
      )
    ).toBe(true);
  });
});
