import { describe, expect, it } from "vitest";
import { humanizeSesHealthReason } from "@/lib/ses-health-reasons";
import {
  type AccountStatusInput,
  getAccountStatus,
  ROLE_REACHABILITY_WINDOW_MS,
} from "../account-status";

const now = new Date("2026-09-30T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);

function input(overrides: {
  lastReachableAt?: Date | null;
  healthStatus?: AccountStatusInput["regional"]["healthStatus"];
  healthReasons?: string[];
  eventFeedStaleSince?: Date | null;
  lastEventReceivedAt?: Date | null;
}): AccountStatusInput {
  return {
    role: {
      lastReachableAt:
        overrides.lastReachableAt === undefined
          ? hoursAgo(0.5)
          : overrides.lastReachableAt,
    },
    regional: {
      healthStatus: overrides.healthStatus ?? null,
      healthReasons: overrides.healthReasons ?? [],
      eventFeedStaleSince: overrides.eventFeedStaleSince ?? null,
      lastEventReceivedAt: overrides.lastEventReceivedAt ?? null,
    },
    now,
  };
}

describe("getAccountStatus", () => {
  it("uses a three-hour role window", () => {
    expect(ROLE_REACHABILITY_WINDOW_MS).toBe(3 * 60 * 60 * 1000);
  });

  it("never reports healthy when nothing has been measured", () => {
    const status = getAccountStatus(input({}));
    expect(status.level).toBe("unknown");
    expect(status.label).toBe("Not checked yet");
    expect(status.detail).toBeNull();
  });

  it("does not treat a never-reached role as unreachable", () => {
    const status = getAccountStatus(input({ lastReachableAt: null }));
    expect(status.level).toBe("unknown");
    expect(status.label).toBe("Not checked yet");
  });

  it("lets an unreachable role beat a stale healthy verdict", () => {
    const status = getAccountStatus(
      input({ healthStatus: "healthy", lastReachableAt: hoursAgo(4) })
    );
    expect(status.level).toBe("critical");
    expect(status.label).toBe("Role unreachable");
    expect(status.detail).toMatch(/^Last reached /);
  });

  it("stays healthy when the role was reached two hours ago", () => {
    const status = getAccountStatus(
      input({ healthStatus: "healthy", lastReachableAt: hoursAgo(2) })
    );
    expect(status).toEqual({
      level: "healthy",
      label: "Healthy",
      detail: null,
    });
  });

  it("reports in_danger as critical with the humanized reason", () => {
    const status = getAccountStatus(
      input({ healthStatus: "in_danger", healthReasons: ["sending_disabled"] })
    );
    expect(status.level).toBe("critical");
    expect(status.label).toBe("In danger");
    expect(status.detail).toBe(humanizeSesHealthReason("sending_disabled"));
  });

  it("ranks in_danger above a stale event feed", () => {
    const status = getAccountStatus(
      input({ healthStatus: "in_danger", eventFeedStaleSince: hoursAgo(5) })
    );
    expect(status.label).toBe("In danger");
  });

  it("ranks a stale event feed above at_risk", () => {
    const status = getAccountStatus(
      input({
        healthStatus: "at_risk",
        eventFeedStaleSince: hoursAgo(5),
        lastEventReceivedAt: hoursAgo(6),
      })
    );
    expect(status.level).toBe("warning");
    expect(status.label).toBe("Events stopped");
    expect(status.detail).toMatch(/^Last event /);
  });

  it("warns on a stale event feed even with null health", () => {
    const status = getAccountStatus(
      input({ healthStatus: null, eventFeedStaleSince: hoursAgo(5) })
    );
    expect(status.level).toBe("warning");
    expect(status.label).toBe("Events stopped");
    expect(status.detail).toBeNull();
  });

  it("explains at_risk with the first humanized reason", () => {
    const status = getAccountStatus(
      input({ healthStatus: "at_risk", healthReasons: ["bounce_review"] })
    );
    expect(status.level).toBe("warning");
    expect(status.label).toBe("At risk");
    expect(status.detail).toBe(humanizeSesHealthReason("bounce_review"));
  });

  it("has no detail for at_risk without reasons", () => {
    const status = getAccountStatus(
      input({ healthStatus: "at_risk", healthReasons: [] })
    );
    expect(status.detail).toBeNull();
  });
});
