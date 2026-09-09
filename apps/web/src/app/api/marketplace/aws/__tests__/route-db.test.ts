/**
 * AWS Marketplace registration — upsert semantics against a real database.
 *
 * The mocked suite in `route.test.ts` proves the error classification and the
 * cookie handling, but it stubs `@wraps/db` and so cannot say anything about
 * the behaviour the whole design rests on: a buyer who returns to "Set up your
 * account" from the Marketplace console must update their existing agreement
 * rather than create a second row. That is `onConflictDoUpdate` keyed on
 * `licenseArn`, and only Postgres can confirm it.
 *
 * Only the AWS SDK is mocked here — ResolveCustomer cannot be called for real.
 */

import { db } from "@wraps/db";
import { awsMarketplaceSubscription } from "@wraps/db/schema/aws-marketplace";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const send = vi.fn();

vi.mock("@aws-sdk/client-marketplace-metering", () => ({
  MarketplaceMeteringClient: class {
    send = send;
  },
  ResolveCustomerCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  serializeError: (e: unknown) => ({ err: String(e) }),
}));

const { POST } = await import("../route");

const PREFIX = "awsmp-route-db";
const LICENSE_ARN = `arn:aws:license-manager::999999999999:license/${PREFIX}-l1`;

function marketplacePost(token: string, offerType?: string) {
  const body = new FormData();
  body.append("x-amzn-marketplace-token", token);
  if (offerType) {
    body.append("x-amzn-marketplace-offer-type", offerType);
  }
  return new Request("https://app.wraps.dev/api/marketplace/aws", {
    method: "POST",
    body,
  });
}

async function rowsForLicense() {
  return await db
    .select()
    .from(awsMarketplaceSubscription)
    .where(eq(awsMarketplaceSubscription.licenseArn, LICENSE_ARN));
}

async function cleanup() {
  await db
    .delete(awsMarketplaceSubscription)
    .where(eq(awsMarketplaceSubscription.licenseArn, LICENSE_ARN));
}

describe("AWS Marketplace registration (real DB)", () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it("creates one row, then updates it in place when the buyer returns", async () => {
    send.mockResolvedValue({
      LicenseArn: LICENSE_ARN,
      CustomerAWSAccountId: "999999999999",
      ProductCode: "prod-first",
      CustomerIdentifier: undefined,
    });

    const first = await POST(marketplacePost("token-1"));
    expect(first.status).toBe(303);

    const afterFirst = await rowsForLicense();
    expect(afterFirst).toHaveLength(1);
    expect(afterFirst[0]?.productCode).toBe("prod-first");
    expect(afterFirst[0]?.status).toBe("pending");
    const originalId = afterFirst[0]?.id;

    // Same licence, a later visit carrying a free-trial offer.
    send.mockResolvedValue({
      LicenseArn: LICENSE_ARN,
      CustomerAWSAccountId: "999999999999",
      ProductCode: "prod-second",
      CustomerIdentifier: undefined,
    });

    await POST(marketplacePost("token-2", "free-trial"));

    const afterSecond = await rowsForLicense();
    // The whole point: still one agreement, not two.
    expect(afterSecond).toHaveLength(1);
    expect(afterSecond[0]?.id).toBe(originalId);
    expect(afterSecond[0]?.productCode).toBe("prod-second");
    expect(afterSecond[0]?.offerType).toBe("free-trial");
  });

  it("never provisions on registration — status stays pending until EventBridge", async () => {
    // AWS forbids activating a subscription before a `License Updated` event
    // arrives, so the registration POST must not advance status on its own.
    const rows = await rowsForLicense();
    expect(rows[0]?.status).toBe("pending");
    expect(rows[0]?.organizationId).toBeNull();
  });
});
