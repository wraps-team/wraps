import type { awsAccount } from "@wraps/db";
import { describe, expect, it } from "vitest";
import { toClientAccount } from "../client-account";

type AwsAccountRow = typeof awsAccount.$inferSelect;

const makeRow = (webhookSecret: string | null): AwsAccountRow =>
  ({
    id: "acc-1",
    organizationId: "org-1",
    accountId: "123456789012",
    name: "Prod",
    region: "us-east-1",
    roleArn: "arn:aws:iam::123456789012:role/wraps-console-access-role",
    externalId: "ext-1",
    webhookSecret,
    updatedAt: new Date("2026-09-01T00:00:00Z"),
    createdAt: new Date("2026-08-01T00:00:00Z"),
    features: null,
    healthDetail: null,
    dailyQuotaReserve: 100,
    someFutureColumn: "must-not-leak",
  }) as unknown as AwsAccountRow;

describe("toClientAccount", () => {
  it("never carries the webhook secret", () => {
    const result = toClientAccount(makeRow("whsec-SENTINEL-7f3a"));

    expect(JSON.stringify(result)).not.toContain("SENTINEL");
    expect(result).not.toHaveProperty("webhookSecret");
  });

  it("reports only whether a secret is set", () => {
    expect(
      toClientAccount(makeRow("whsec-SENTINEL-7f3a")).webhookConnected
    ).toBe(true);
    expect(toClientAccount(makeRow(null)).webhookConnected).toBe(false);
  });

  it("exposes exactly the allowlisted keys", () => {
    const result = toClientAccount(makeRow("whsec-SENTINEL-7f3a"));

    expect(Object.keys(result).sort()).toEqual(
      [
        "id",
        "organizationId",
        "accountId",
        "name",
        "region",
        "roleArn",
        "externalId",
        "updatedAt",
        "features",
        "healthDetail",
        "dailyQuotaReserve",
        "webhookConnected",
      ].sort()
    );
  });
});
