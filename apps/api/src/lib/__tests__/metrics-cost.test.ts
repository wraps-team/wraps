import { type SesPricingPlan, sendingCostForPlan } from "@wraps/core/ses-plans";
import type { BillableCell, MetricsRow } from "@wraps/db";
import { describe, expect, it } from "vitest";
import {
  type AccountPlans,
  attributeCost,
  parseSesPlan,
} from "../metrics-cost";

const counts = {
  sent: 0,
  delivered: 0,
  bounced: 0,
  bouncedPermanent: 0,
  bouncedTransient: 0,
  bouncedUndetermined: 0,
  complained: 0,
  suppressed: 0,
  opened: 0,
  openedRaw: 0,
  clicked: 0,
  failed: 0,
};

const plansOf = (
  entries: Array<[string, SesPricingPlan | null]>
): AccountPlans => new Map(entries);

const cell = (
  dimensionKey: string,
  billable: number,
  billingMonth = "2026-04",
  awsAccountId: string | null = "acct-1"
): BillableCell => ({ dimensionKey, awsAccountId, billingMonth, billable });

describe("attributeCost", () => {
  it("prices a known plan and volume", () => {
    const result = attributeCost({
      data: [{ broadcastId: "b1", ...counts }],
      dimensions: ["broadcast"],
      cells: [cell(JSON.stringify(["b1"]), 1000)],
      volumes: [
        { awsAccountId: "acct-1", billingMonth: "2026-04", billable: 1000 },
      ],
      plans: plansOf([["acct-1", "ESSENTIALS"]]),
    });

    expect(result.data[0]?.costUsd).toBeCloseTo(
      sendingCostForPlan("ESSENTIALS", 1000),
      6
    );
    expect(result.totalCostUsd).toBeCloseTo(
      sendingCostForPlan("ESSENTIALS", 1000),
      6
    );
    expect(result.unattributed).toBe(0);
  });

  it("charges the blended tier rate across a month, not the first-tier rate", () => {
    const result = attributeCost({
      data: [],
      dimensions: [],
      cells: [cell("[]", 1000)],
      volumes: [
        {
          awsAccountId: "acct-1",
          billingMonth: "2026-04",
          billable: 20_000_000,
        },
      ],
      plans: plansOf([["acct-1", "ESSENTIALS"]]),
    });

    expect(result.totalCostUsd).toBeLessThan((1000 * 0.16) / 1000);
    expect(result.totalCostUsd).toBeCloseTo(
      (1000 * sendingCostForPlan("ESSENTIALS", 20_000_000)) / 20_000_000,
      6
    );
  });

  it("adds up to the same total under any grouping", () => {
    const volumes = [
      { awsAccountId: "acct-1", billingMonth: "2026-04", billable: 15_000_000 },
    ];
    const plans = plansOf([["acct-1", "ESSENTIALS"]]);
    const byBroadcast = attributeCost({
      data: [
        { broadcastId: "b1", ...counts },
        { broadcastId: "b2", ...counts },
      ],
      dimensions: ["broadcast"],
      cells: [
        cell(JSON.stringify(["b1"]), 4000),
        cell(JSON.stringify(["b2"]), 6000),
      ],
      volumes,
      plans,
    });
    const byTemplate = attributeCost({
      data: [{ templateId: "t1", ...counts }],
      dimensions: ["template"],
      cells: [cell(JSON.stringify(["t1"]), 10_000)],
      volumes,
      plans,
    });

    expect(byBroadcast.totalCostUsd).toBeCloseTo(
      byTemplate.totalCostUsd ?? 0,
      6
    );
    const rowSum = byBroadcast.data.reduce((s, r) => s + (r.costUsd ?? 0), 0);
    expect(rowSum).toBeCloseTo(byBroadcast.totalCostUsd ?? 0, 5);
    const templateSum = byTemplate.data.reduce(
      (s, r) => s + (r.costUsd ?? 0),
      0
    );
    expect(templateSum).toBeCloseTo(byTemplate.totalCostUsd ?? 0, 6);
  });

  it("tiers each UTC month separately", () => {
    const result = attributeCost({
      data: [],
      dimensions: [],
      cells: [
        cell("[]", 8_000_000, "2026-03"),
        cell("[]", 8_000_000, "2026-04"),
      ],
      volumes: [
        {
          awsAccountId: "acct-1",
          billingMonth: "2026-03",
          billable: 8_000_000,
        },
        {
          awsAccountId: "acct-1",
          billingMonth: "2026-04",
          billable: 12_000_000,
        },
      ],
      plans: plansOf([["acct-1", "ESSENTIALS"]]),
    });

    const march = sendingCostForPlan("ESSENTIALS", 8_000_000);
    const april =
      (8_000_000 * sendingCostForPlan("ESSENTIALS", 12_000_000)) / 12_000_000;
    expect(result.totalCostUsd).toBeCloseTo(march + april, 4);
    expect(result.totalCostUsd).not.toBeCloseTo(
      sendingCostForPlan("ESSENTIALS", 16_000_000),
      4
    );
  });

  it("returns null, not 0, when a plan is unknown, and keeps known siblings", () => {
    const data: MetricsRow[] = [
      { broadcastId: "known", ...counts },
      { broadcastId: "unknown", ...counts },
    ];
    const result = attributeCost({
      data,
      dimensions: ["broadcast"],
      cells: [
        cell(JSON.stringify(["known"]), 100, "2026-04", "acct-1"),
        cell(JSON.stringify(["unknown"]), 100, "2026-04", "acct-2"),
      ],
      volumes: [
        { awsAccountId: "acct-1", billingMonth: "2026-04", billable: 100 },
        { awsAccountId: "acct-2", billingMonth: "2026-04", billable: 100 },
      ],
      plans: plansOf([
        ["acct-1", "ESSENTIALS"],
        ["acct-2", null],
      ]),
    });

    expect(result.data[0]?.costUsd).toBeCloseTo(
      sendingCostForPlan("ESSENTIALS", 100),
      6
    );
    expect(result.data[1]?.costUsd).toBeNull();
    expect(result.totalCostUsd).toBeNull();
    expect(result.unattributed).toBe(1);
  });

  it("returns null when a cell has no account", () => {
    const result = attributeCost({
      data: [{ broadcastId: "b1", ...counts }],
      dimensions: ["broadcast"],
      cells: [cell(JSON.stringify(["b1"]), 10, "2026-04", null)],
      volumes: [],
      plans: plansOf([]),
    });

    expect(result.data[0]?.costUsd).toBeNull();
    expect(result.totalCostUsd).toBeNull();
  });

  it("prices the same volume differently on different plans", () => {
    const run = (plan: SesPricingPlan) =>
      attributeCost({
        data: [],
        dimensions: [],
        cells: [cell("[]", 50_000)],
        volumes: [
          { awsAccountId: "acct-1", billingMonth: "2026-04", billable: 50_000 },
        ],
        plans: plansOf([["acct-1", plan]]),
      }).totalCostUsd;

    expect(run("NONE")).not.toBe(run("ESSENTIALS"));
  });

  it("gives a row with no billable cells a cost of 0", () => {
    const result = attributeCost({
      data: [{ broadcastId: "only-failed", ...counts, failed: 3 }],
      dimensions: ["broadcast"],
      cells: [],
      volumes: [],
      plans: plansOf([]),
    });

    expect(result.data[0]?.costUsd).toBe(0);
    expect(result.totalCostUsd).toBe(0);
  });

  it("throws when the month volume is smaller than the cell (query bug)", () => {
    expect(() =>
      attributeCost({
        data: [],
        dimensions: [],
        cells: [cell("[]", 100)],
        volumes: [
          { awsAccountId: "acct-1", billingMonth: "2026-04", billable: 50 },
        ],
        plans: plansOf([["acct-1", "ESSENTIALS"]]),
      })
    ).toThrow();
  });
});

describe("parseSesPlan", () => {
  it("accepts NONE as a real plan", () => {
    expect(parseSesPlan("NONE")).toBe("NONE");
  });

  it.each([null, undefined, "", "SOMETHING_NEW"])(
    "treats %j as unknown",
    (raw) => {
      expect(parseSesPlan(raw)).toBeNull();
    }
  );
});
