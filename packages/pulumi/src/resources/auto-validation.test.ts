import { beforeEach, describe, expect, it, vi } from "vitest";
import { autoValidationProvider } from "./auto-validation.js";

// ---------------------------------------------------------------------------
// Hoisted mock handle — must be defined before vi.mock() factory runs.
// ---------------------------------------------------------------------------
const { mockSESSend } = vi.hoisted(() => ({
  mockSESSend: vi.fn(),
}));

vi.mock("@aws-sdk/client-sesv2", () => ({
  // biome-ignore lint/complexity/useArrowFunction: constructor mock requires function expression
  SESv2Client: vi.fn(function () {
    return { send: mockSESSend };
  }),
  // biome-ignore lint/complexity/useArrowFunction: constructor mock requires function expression
  PutConfigurationSetSuppressionOptionsCommand: vi.fn(function (args: unknown) {
    return {
      _type: "put-suppression",
      ...(typeof args === "object" ? args : {}),
    };
  }),
}));

// @wraps/core's buildSuppressionOptions is pure and side-effect-free — it
// runs for real here rather than being mocked, so these tests also cover
// that the provider calls it with the right arguments.

const baseInputs = {
  configSetName: "wraps-email-tracking",
  region: "us-east-1",
  suppressedReasons: ["BOUNCE", "COMPLAINT"] as Array<"BOUNCE" | "COMPLAINT">,
  enabled: true,
  threshold: "HIGH" as const,
};

beforeEach(() => {
  mockSESSend.mockReset();
  vi.clearAllMocks();
});

describe("autoValidationProvider.create()", () => {
  it("sends one Put carrying both SuppressedReasons and ValidationOptions", async () => {
    mockSESSend.mockResolvedValueOnce({});

    const result = await autoValidationProvider.create!(baseInputs);

    expect(result.id).toBe("wraps-email-tracking-auto-validation");
    expect(result.outs).toEqual(baseInputs);

    const { PutConfigurationSetSuppressionOptionsCommand } = await import(
      "@aws-sdk/client-sesv2"
    );
    const calls = vi.mocked(PutConfigurationSetSuppressionOptionsCommand).mock
      .calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toMatchObject({
      ConfigurationSetName: "wraps-email-tracking",
      SuppressedReasons: ["BOUNCE", "COMPLAINT"],
      ValidationOptions: {
        ConditionThreshold: {
          ConditionThresholdEnabled: "ENABLED",
          OverallConfidenceThreshold: { ConfidenceVerdictThreshold: "HIGH" },
        },
      },
    });
  });
});

describe("autoValidationProvider.diff()", () => {
  it("reports a change when only suppressedReasons differs", async () => {
    const olds = { ...baseInputs };
    const news = {
      ...baseInputs,
      suppressedReasons: ["BOUNCE"] as Array<"BOUNCE" | "COMPLAINT">,
    };

    const result = await autoValidationProvider.diff!("id", olds, news);

    expect(result.changes).toBe(true);
  });

  it("reports no change when nothing differs", async () => {
    const result = await autoValidationProvider.diff!("id", baseInputs, {
      ...baseInputs,
    });

    expect(result.changes).toBe(false);
  });
});

describe("autoValidationProvider.delete()", () => {
  it("sends ConditionThresholdEnabled: DISABLED together with the live reasons", async () => {
    mockSESSend.mockResolvedValueOnce({});

    await autoValidationProvider.delete!("id", baseInputs);

    const { PutConfigurationSetSuppressionOptionsCommand } = await import(
      "@aws-sdk/client-sesv2"
    );
    const calls = vi.mocked(PutConfigurationSetSuppressionOptionsCommand).mock
      .calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toMatchObject({
      ConfigurationSetName: "wraps-email-tracking",
      SuppressedReasons: ["BOUNCE", "COMPLAINT"],
      ValidationOptions: {
        ConditionThreshold: { ConditionThresholdEnabled: "DISABLED" },
      },
    });
  });

  it("never throws, even when the Put fails (best-effort teardown)", async () => {
    mockSESSend.mockRejectedValueOnce(new Error("boom"));

    await expect(
      autoValidationProvider.delete!("id", baseInputs)
    ).resolves.toBeUndefined();
  });
});
