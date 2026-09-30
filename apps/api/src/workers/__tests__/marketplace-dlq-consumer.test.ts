/**
 * AWS Marketplace DLQ consumer.
 *
 * Pins the behaviours that make the dead-letter path safe: a dead-lettered
 * lifecycle event marks its subscription `failed` (terminal and visible, so it
 * no longer expires silently), anything without a row or without an actionable
 * detail type is surfaced but writes nothing, and the handler never throws —
 * a DLQ consumer has no DLQ of its own to catch it.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const updateSet = vi.fn();
const selectWhere = vi.fn();
const captureException = vi.fn();

vi.mock("../../lib/sentry", () => ({}));
vi.mock("@sentry/aws-serverless", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
  wrapHandler: (fn: unknown) => fn,
}));
vi.mock("../../lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  flushLogger: () => Promise.resolve(),
}));

vi.mock("@wraps/db", () => ({
  awsMarketplaceSubscription: {
    id: "id",
    licenseArn: "license_arn",
    agreementId: "agreement_id",
    customerAwsAccountId: "customer_aws_account_id",
    productCode: "product_code",
    resolvedAt: "resolved_at",
    status: "status",
  },
  and: (...a: unknown[]) => ({ and: a }),
  desc: (col: unknown) => ({ desc: col }),
  eq: (col: unknown, val: unknown) => ({ eq: [col, val] }),
  ilike: (col: unknown, val: unknown) => ({ ilike: [col, val] }),
  db: {
    select: () => ({
      from: () => ({
        where: (w: unknown) => {
          const tail = { limit: () => Promise.resolve(selectWhere(w)) };
          // The account+product fallback orders before limiting.
          return { ...tail, orderBy: () => tail };
        },
      }),
    }),
    update: () => ({
      set: (v: unknown) => ({
        where: () => {
          updateSet(v);
          const result = Promise.resolve([]);
          return Object.assign(result, {
            returning: () => Promise.resolve([]),
          });
        },
      }),
    }),
  },
}));

const { handler } = await import("../marketplace-dlq-consumer");

// The SQSHandler signature takes (event, context, callback); the test only
// needs the event, and the handler ignores the rest.
const invoke = (event: unknown) =>
  handler(event as never, {} as never, undefined as never);

const LICENSE_ARN =
  "arn:aws:license-manager:us-east-1:905130073023:l-e52ca6f38bf84d0fafb8802ca15ac11a";

function sqsEvent(detailType: string, detail: unknown) {
  return {
    Records: [
      {
        messageId: "m1",
        body: JSON.stringify({
          id: "evt-1",
          "detail-type": detailType,
          source: "aws.agreement-marketplace",
          time: "2026-09-08T12:00:00Z",
          detail,
        }),
      },
    ],
    // biome-ignore lint/suspicious/noExplicitAny: minimal SQS shape for the handler
  } as any;
}

const matchedRow = {
  id: "row-1",
  licenseArn: LICENSE_ARN,
  status: "pending",
};

describe("marketplace DLQ consumer", () => {
  beforeEach(() => {
    updateSet.mockReset();
    selectWhere.mockReset();
    captureException.mockReset();
    selectWhere.mockReturnValue([matchedRow]);
  });

  it("marks a correlated subscription failed", async () => {
    await invoke(
      sqsEvent("License Updated - Manufacturer", {
        license: { arn: LICENSE_ARN },
      })
    );

    expect(updateSet).toHaveBeenCalledTimes(1);
    expect(updateSet.mock.calls[0][0]).toMatchObject({ status: "failed" });
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it("marks failed for a deactivation event too", async () => {
    await invoke(
      sqsEvent("Purchase Agreement Ended - Manufacturer", {
        agreement: { id: "agr-1" },
      })
    );

    expect(updateSet).toHaveBeenCalledTimes(1);
    expect(updateSet.mock.calls[0][0]).toMatchObject({ status: "failed" });
  });

  it("surfaces but writes nothing when no subscription matches", async () => {
    selectWhere.mockReturnValue([]);

    await invoke(
      sqsEvent("License Updated - Manufacturer", {
        license: { arn: LICENSE_ARN },
      })
    );

    expect(updateSet).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it("writes nothing for a non-actionable detail type", async () => {
    await invoke(
      sqsEvent("Purchase Agreement Advisory Issued - Manufacturer", {})
    );

    expect(selectWhere).not.toHaveBeenCalled();
    expect(updateSet).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it("never throws on a malformed record", async () => {
    const event = {
      Records: [{ messageId: "m2", body: "not json" }],
      // biome-ignore lint/suspicious/noExplicitAny: minimal SQS shape
    } as any;

    await expect(invoke(event)).resolves.toBeUndefined();
    expect(updateSet).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledTimes(1);
  });
});
