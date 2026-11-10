import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setJsonMode } from "../../utils/shared/json-output.js";

vi.mock("../../telemetry/events.js", () => ({
  trackCommand: vi.fn(),
}));

import { permissions } from "../permissions.js";

type Statement = { Sid: string; Action: string[]; Resource: string | string[] };

async function policyFor(
  preset: "starter" | "production" | "enterprise",
  service: "email" | undefined = "email"
): Promise<Statement[]> {
  const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  await permissions({ json: true, preset, service });
  const line = log.mock.calls
    .map((c) => c[0])
    .find(
      (a) => typeof a === "string" && a.includes('"command":"permissions"')
    );
  log.mockRestore();
  return JSON.parse(line as string).data.policy.Statement;
}

beforeEach(() => {
  setJsonMode(true);
});

afterEach(() => {
  setJsonMode(false);
});

describe("permissions: inbound statements (plan 041)", () => {
  it.each(["production", "enterprise"] as const)(
    "%s includes InboundReceiptRules, InboundBucket and InboundBucketObjects",
    async (preset) => {
      const sids = (await policyFor(preset)).map((s) => s.Sid);
      expect(sids).toEqual(
        expect.arrayContaining([
          "InboundReceiptRules",
          "InboundBucket",
          "InboundBucketObjects",
        ])
      );
    }
  );

  it("starter has none of them", async () => {
    const sids = (await policyFor("starter")).map((s) => s.Sid);
    expect(sids).not.toContain("InboundReceiptRules");
    expect(sids).not.toContain("InboundBucket");
    expect(sids).not.toContain("InboundBucketObjects");
  });

  it("receipt-rule actions are on Resource * (they take no resource ARN)", async () => {
    const stmt = (await policyFor("production")).find(
      (s) => s.Sid === "InboundReceiptRules"
    );
    expect(stmt?.Resource).toBe("*");
    expect(stmt?.Action).toEqual(
      expect.arrayContaining([
        "ses:CreateReceiptRule",
        "ses:UpdateReceiptRule",
        "ses:DescribeReceiptRule",
        "ses:DeleteReceiptRule",
        "ses:CreateReceiptRuleSet",
        "ses:DeleteReceiptRuleSet",
        "ses:DescribeActiveReceiptRuleSet",
        "ses:SetActiveReceiptRuleSet",
      ])
    );
  });

  it("bucket statements are scoped to wraps-inbound-* and cover the notification and policy writes", async () => {
    const statements = await policyFor("production");
    const bucket = statements.find((s) => s.Sid === "InboundBucket");
    const objects = statements.find((s) => s.Sid === "InboundBucketObjects");
    expect(bucket?.Resource).toEqual(["arn:aws:s3:::wraps-inbound-*"]);
    expect(bucket?.Action).toEqual(
      expect.arrayContaining([
        "s3:PutBucketNotification",
        "s3:GetBucketNotification",
        "s3:PutBucketPolicy",
        "s3:GetBucketPolicy",
        "s3:CreateBucket",
        "s3:DeleteBucket",
      ])
    );
    expect(objects?.Resource).toEqual(["arn:aws:s3:::wraps-inbound-*/*"]);
    expect(objects?.Action).toEqual(
      expect.arrayContaining(["s3:DeleteObject", "s3:DeleteObjectVersion"])
    );
  });

  it("every Sid in the email policy is unique (buildPolicy drops repeats silently)", async () => {
    const sids = (await policyFor("enterprise")).map((s) => s.Sid);
    expect(new Set(sids).size).toBe(sids.length);
  });
});
