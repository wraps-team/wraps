import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
const insertValues = vi.fn();

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

vi.mock("@wraps/db", () => ({
  db: {
    insert: () => ({
      values: (v: unknown) => {
        insertValues(v);
        return {
          onConflictDoUpdate: () => ({
            returning: () => Promise.resolve([{ id: "row-1" }]),
          }),
        };
      },
    }),
  },
}));

vi.mock("@wraps/db/schema/aws-marketplace", () => ({
  awsMarketplaceSubscription: { licenseArn: "license_arn", id: "id" },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  serializeError: (e: unknown) => ({ err: String(e) }),
}));

const { POST } = await import("../route");

function marketplacePost(fields: Record<string, string>) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    body.append(k, v);
  }
  return new Request("https://app.wraps.dev/api/marketplace/aws", {
    method: "POST",
    body,
  });
}

const VALID_IDENTITY = {
  LicenseArn: "arn:aws:license-manager::123456789012:license/l-abc",
  CustomerAWSAccountId: "123456789012",
  ProductCode: "prod-abc123",
  CustomerIdentifier: undefined,
};

function errorOf(response: Response): string | null {
  return new URL(
    response.headers.get("location") ?? "",
    "https://x"
  ).searchParams.get("error");
}

describe("AWS Marketplace registration POST", () => {
  beforeEach(() => {
    send.mockReset();
    insertValues.mockReset();
  });

  it("redirects with 303 so the browser follows a cross-site POST with GET", async () => {
    send.mockResolvedValue(VALID_IDENTITY);
    const response = await POST(
      marketplacePost({ "x-amzn-marketplace-token": "t" })
    );
    expect(response.status).toBe(303);
  });

  it("persists the resolved licence and sets an httpOnly ref cookie", async () => {
    send.mockResolvedValue(VALID_IDENTITY);

    const response = await POST(
      marketplacePost({
        "x-amzn-marketplace-token": "t",
        "x-amzn-marketplace-offer-type": "free-trial",
      })
    );

    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        licenseArn: VALID_IDENTITY.LicenseArn,
        customerAwsAccountId: "123456789012",
        productCode: "prod-abc123",
        offerType: "free-trial",
      })
    );

    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("wraps_awsmp_ref=row-1");
    expect(cookie).toContain("HttpOnly");
    // The row id maps to a customer AWS account — it must not ride in the URL.
    expect(response.headers.get("location")).not.toContain("row-1");
  });

  it("rejects a request with no token without calling AWS", async () => {
    const response = await POST(marketplacePost({}));
    expect(send).not.toHaveBeenCalled();
    expect(errorOf(response)).toBe("missing_token");
  });

  it("refuses to store an identity missing LicenseArn", async () => {
    // Concurrent Agreements: without the licence two agreements on one account
    // are indistinguishable, so the row would be unreconcilable.
    send.mockResolvedValue({ ...VALID_IDENTITY, LicenseArn: undefined });

    const response = await POST(
      marketplacePost({ "x-amzn-marketplace-token": "t" })
    );

    expect(insertValues).not.toHaveBeenCalled();
    expect(errorOf(response)).toBe("resolve_incomplete");
  });

  it.each([
    ["ExpiredTokenException", "expired_token"],
    ["InvalidTokenException", "invalid_token"],
    ["DisabledApiException", "listing_unavailable"],
    ["ThrottlingException", "try_again"],
  ])(
    "maps %s to a specific reason, not a generic failure",
    async (name, expected) => {
      const error = new Error("boom");
      error.name = name;
      send.mockRejectedValue(error);

      const response = await POST(
        marketplacePost({ "x-amzn-marketplace-token": "t" })
      );

      expect(errorOf(response)).toBe(expected);
    }
  );

  it("classifies by message when the SDK reports a bare Error name", async () => {
    // AWS SDK v3 sometimes returns name: "Error" with the real exception only
    // in the message.
    const error = new Error("ExpiredTokenException: token is no longer valid");
    error.name = "Error";
    send.mockRejectedValue(error);

    const response = await POST(
      marketplacePost({ "x-amzn-marketplace-token": "t" })
    );

    expect(errorOf(response)).toBe("expired_token");
  });
});
