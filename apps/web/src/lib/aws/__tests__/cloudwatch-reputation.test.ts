import { beforeEach, describe, expect, it, vi } from "vitest";
import { REPUTATION_LOOKBACK_DAYS } from "../../analytics-scope";

const mockSend = vi.fn();

vi.mock("@aws-sdk/client-cloudwatch", () => ({
  CloudWatchClient: class {
    send = (...args: unknown[]) => mockSend(...args);
  },
  GetMetricDataCommand: class {
    input: Record<string, unknown>;
    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  },
}));

const mockFindFirst = vi.fn();
vi.mock("@wraps/db", () => ({
  db: { query: { awsAccount: { findFirst: () => mockFindFirst() } } },
}));

vi.mock("../credential-cache", () => ({
  getOrAssumeRole: vi.fn(async () => ({
    accessKeyId: "AK",
    secretAccessKey: "SK",
    sessionToken: "ST",
  })),
}));

const DAY_MS = 24 * 60 * 60 * 1000;

/** A GetMetricData reply with parallel Timestamps/Values, newest first. */
function reply(
  points: Array<{ bounce?: number; complaint?: number; daysAgo: number }>
) {
  const pick = (key: "bounce" | "complaint") => {
    const usable = points.filter((p) => p[key] != null);
    return {
      Values: usable.map((p) => p[key] as number),
      Timestamps: usable.map((p) => new Date(Date.now() - p.daysAgo * DAY_MS)),
    };
  };
  const b = pick("bounce");
  const c = pick("complaint");
  return {
    MetricDataResults: [
      { Id: "bounce_rate", ...b },
      { Id: "complaint_rate", ...c },
    ],
  };
}

async function readReputation() {
  const { getSESReputationMetrics } = await import("../cloudwatch");
  return getSESReputationMetrics("acc-1");
}

describe("getSESReputationMetrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindFirst.mockResolvedValue({
      id: "acc-1",
      roleArn: "arn:aws:iam::384235570724:role/wraps",
      externalId: "ext",
      region: "eu-west-1",
    });
  });

  it("looks back far enough to outlast an ordinary sending pause", async () => {
    // SES publishes Reputation.* only while sending. The old 7-day lookback
    // reported "no rate" for any org that paused for a week, which flipped the
    // dashboard tile onto a different population.
    mockSend.mockResolvedValue(reply([{ bounce: 0.001, daysAgo: 0 }]));

    await readReputation();

    const { input } = mockSend.mock.calls[0][0] as {
      input: { StartTime: Date; EndTime: Date };
    };
    const spanDays = Math.round(
      (input.EndTime.getTime() - input.StartTime.getTime()) / DAY_MS
    );
    expect(spanDays).toBe(REPUTATION_LOOKBACK_DAYS);
    expect(spanDays).toBeGreaterThanOrEqual(30);
  });

  it("returns the timestamp SES actually published, not the read time", async () => {
    mockSend.mockResolvedValue(
      reply([{ bounce: 0.00147, complaint: 0.0002, daysAgo: 7 }])
    );

    const result = await readReputation();

    expect(result.bounceRate).toBeCloseTo(0.00147, 5);
    expect(result.asOf).toBeInstanceOf(Date);
    const ageDays = Math.round(
      (Date.now() - (result.asOf as Date).getTime()) / DAY_MS
    );
    expect(ageDays).toBe(7);
    // Stamping "now" would erase the one fact the caller cannot recompute.
    expect(Date.now() - (result.asOf as Date).getTime()).toBeGreaterThan(
      DAY_MS
    );
  });

  it("picks the newest datapoint by timestamp, not by array position", async () => {
    // Values[0] is only the newest while the scan order holds. Selecting by
    // timestamp means an ascending reply cannot silently return a stale rate.
    mockSend.mockResolvedValue(
      reply([
        { bounce: 0.09, daysAgo: 30 },
        { bounce: 0.01, daysAgo: 1 },
      ])
    );

    const result = await readReputation();

    expect(result.bounceRate).toBeCloseTo(0.01, 5);
    expect(
      Math.round((Date.now() - (result.asOf as Date).getTime()) / DAY_MS)
    ).toBe(1);
  });

  it("scans newest-first so any truncation drops old points", async () => {
    mockSend.mockResolvedValue(reply([{ bounce: 0.001, daysAgo: 0 }]));

    await readReputation();

    const { input } = mockSend.mock.calls[0][0] as {
      input: { ScanBy: string };
    };
    expect(input.ScanBy).toBe("TimestampDescending");
  });

  it("reports no rate and no timestamp when SES published nothing", async () => {
    mockSend.mockResolvedValue({
      MetricDataResults: [
        { Id: "bounce_rate", Values: [], Timestamps: [] },
        { Id: "complaint_rate", Values: [], Timestamps: [] },
      ],
    });

    const result = await readReputation();

    expect(result).toEqual({
      bounceRate: null,
      complaintRate: null,
      asOf: null,
    });
  });

  it("classifies a failed read rather than reporting a healthy zero", async () => {
    mockSend.mockRejectedValue(
      new Error("User is not authorized to perform: cloudwatch:GetMetricData")
    );
    const { getCloudWatchErrorKind } = await import("../cloudwatch");

    await expect(readReputation()).rejects.toThrow(/GetMetricData/);
    await readReputation().catch((error) => {
      expect(getCloudWatchErrorKind(error)).toBe("access_denied");
    });
  });
});
