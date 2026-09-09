/**
 * AWS Marketplace lifecycle consumer.
 *
 * The behaviours pinned here are the ones that fail silently in production if
 * they regress: correlation across the three key shapes AWS actually sends, the
 * out-of-order guard, and the rule that nothing but a lifecycle event may
 * activate a subscription.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const updateSet = vi.fn();
const selectWhere = vi.fn();
const sendWelcome = vi.fn();
// What the conditional claim UPDATE ... WHERE welcome_email_sent_at IS NULL returns.
let claimResult: () => unknown[] = () => [{ id: "row-1" }];

vi.mock("../../lib/sentry", () => ({}));
vi.mock("@sentry/aws-serverless", () => ({
  captureException: vi.fn(),
  wrapHandler: (fn: unknown) => fn,
}));
vi.mock("@wraps/email", () => ({
  generateMarketplaceLinkToken: () => Promise.resolve("signed.link.token"),
  sendMarketplaceWelcomeEmail: (...args: unknown[]) => {
    sendWelcome(...args);
    return Promise.resolve({ messageId: "m" });
  },
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
    welcomeEmailSentAt: "welcome_email_sent_at",
    resolvedAt: "resolved_at",
  },
  and: (...a: unknown[]) => ({ and: a }),
  desc: (col: unknown) => ({ desc: col }),
  eq: (col: unknown, val: unknown) => ({ eq: [col, val] }),
  ilike: (col: unknown, val: unknown) => ({ ilike: [col, val] }),
  isNull: (col: unknown) => ({ isNull: col }),
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
          const result = Promise.resolve(claimResult());
          // The status write awaits this directly; the claim calls
          // .returning(); the claim-release calls .catch().
          return Object.assign(result, {
            returning: () => Promise.resolve(claimResult()),
          });
        },
      }),
    }),
  },
}));

const { handler, licenseKey } = await import("../marketplace-events");

const LICENSE_ARN =
  "arn:aws:license-manager:us-east-1:905130073023:l-e52ca6f38bf84d0fafb8802ca15ac11a";

function sqsEvent(
  detailType: string,
  detail: unknown,
  time = "2026-09-08T12:00:00Z"
) {
  return {
    Records: [
      {
        messageId: "m1",
        body: JSON.stringify({
          id: "evt-1",
          "detail-type": detailType,
          source: "aws.agreement-marketplace",
          time,
          detail,
        }),
      },
    ],
    // biome-ignore lint/suspicious/noExplicitAny: minimal SQS shape for the handler
  } as any;
}

const existingRow = {
  id: "row-1",
  licenseArn: LICENSE_ARN,
  lastEventAt: null as Date | null,
  contactEmail: "buyer@example.com" as string | null,
  customerAwsAccountId: "845735284135",
  welcomeEmailSentAt: null as Date | null,
};

describe("licenseKey", () => {
  it("reduces differently-formatted ARNs to the same key", () => {
    // AWS's own docs print the License event ARN without the leading `arn:`.
    const fromDocs =
      "aws:license-manager:us-east-1:905130073023:l-e52ca6f38bf84d0fafb8802ca15ac11a";
    expect(licenseKey(fromDocs)).toBe(licenseKey(LICENSE_ARN));
  });

  it("returns null for a missing ARN", () => {
    expect(licenseKey(undefined)).toBeNull();
  });
});

describe("marketplace events consumer", () => {
  beforeEach(() => {
    updateSet.mockReset();
    selectWhere.mockReset();
    sendWelcome.mockReset();
    claimResult = () => [{ id: "row-1" }];
    existingRow.lastEventAt = null;
    existingRow.contactEmail = "buyer@example.com";
    existingRow.welcomeEmailSentAt = null;
  });

  it("activates on License Updated", async () => {
    selectWhere.mockReturnValue([existingRow]);

    await handler(
      sqsEvent("License Updated - Manufacturer", {
        agreement: { id: "agmt-1" },
        product: { code: "7lbtkjmkplbo76u3umbic6b7t" },
        license: { arn: LICENSE_ARN },
        acceptor: { accountId: "845735284135" },
      }),
      {} as never,
      // biome-ignore lint/suspicious/noExplicitAny: unused lambda callback
      undefined as any
    );

    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active", agreementId: "agmt-1" })
    );
  });

  it("also activates on Purchase Agreement Created, which is all a free product may send", async () => {
    selectWhere.mockReturnValue([existingRow]);

    await handler(
      sqsEvent("Purchase Agreement Created - Proposer", {
        agreement: { id: "agmt-2", intent: "NEW", status: "ACTIVE" },
        acceptor: { accountId: "845735284135" },
        // Note: no license.arn — this event shape does not carry one.
      }),
      {} as never,
      // biome-ignore lint/suspicious/noExplicitAny: unused lambda callback
      undefined as any
    );

    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active" })
    );
  });

  it("deactivates on License Deprovisioned", async () => {
    selectWhere.mockReturnValue([existingRow]);

    await handler(
      sqsEvent("License Deprovisioned - Manufacturer", {
        agreement: { id: "agmt-1" },
        license: { arn: LICENSE_ARN },
      }),
      {} as never,
      // biome-ignore lint/suspicious/noExplicitAny: unused lambda callback
      undefined as any
    );

    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "unsubscribed" })
    );
  });

  it("ignores a replayed event older than the last one applied", async () => {
    // SQS is at-least-once and unordered: a redelivered activation must not
    // resurrect a subscription that was already deprovisioned.
    existingRow.lastEventAt = new Date("2026-09-08T13:00:00Z");
    selectWhere.mockReturnValue([existingRow]);

    await handler(
      sqsEvent(
        "License Updated - Manufacturer",
        { license: { arn: LICENSE_ARN } },
        "2026-09-08T12:00:00Z"
      ),
      {} as never,
      // biome-ignore lint/suspicious/noExplicitAny: unused lambda callback
      undefined as any
    );

    expect(updateSet).not.toHaveBeenCalled();
  });

  it("writes nothing when no subscription matches", async () => {
    selectWhere.mockReturnValue([]);

    await handler(
      sqsEvent("License Updated - Manufacturer", {
        license: { arn: LICENSE_ARN },
      }),
      {} as never,
      // biome-ignore lint/suspicious/noExplicitAny: unused lambda callback
      undefined as any
    );

    expect(updateSet).not.toHaveBeenCalled();
  });

  it("never changes status on an advisory — that is a human decision", async () => {
    selectWhere.mockReturnValue([existingRow]);

    await handler(
      sqsEvent("Purchase Agreement Advisory Issued - Manufacturer", {
        agreement: { id: "agmt-1" },
        advisory: { issuedAt: "2026-09-08T11:00:00Z" },
      }),
      {} as never,
      // biome-ignore lint/suspicious/noExplicitAny: unused lambda callback
      undefined as any
    );

    expect(updateSet).not.toHaveBeenCalled();
  });

  it("swallows a malformed record rather than throwing — the DLQ is the only retry", async () => {
    const bad = {
      Records: [{ messageId: "m-bad", body: "not json" }],
      // biome-ignore lint/suspicious/noExplicitAny: minimal SQS shape
    } as any;

    await expect(
      // biome-ignore lint/suspicious/noExplicitAny: unused lambda callback
      handler(bad, {} as never, undefined as any)
    ).resolves.toBeUndefined();
    expect(updateSet).not.toHaveBeenCalled();
  });

  it("emails the buyer once on activation", async () => {
    selectWhere.mockReturnValue([existingRow]);

    await handler(
      sqsEvent("License Updated - Manufacturer", {
        license: { arn: LICENSE_ARN },
      }),
      {} as never,
      // biome-ignore lint/suspicious/noExplicitAny: unused lambda callback
      undefined as any
    );

    expect(sendWelcome).toHaveBeenCalledTimes(1);
    expect(sendWelcome).toHaveBeenCalledWith(
      expect.objectContaining({ to: "buyer@example.com" })
    );
  });

  it("does not email when another delivery already claimed the send", async () => {
    // The guard that matters is the conditional UPDATE, not the in-memory
    // flag: two concurrent deliveries both load a row with a null timestamp,
    // and only the one whose claim returns a row may send.
    claimResult = () => [];
    selectWhere.mockReturnValue([existingRow]);

    await handler(
      sqsEvent("License Updated - Manufacturer", {
        license: { arn: LICENSE_ARN },
      }),
      {} as never,
      // biome-ignore lint/suspicious/noExplicitAny: unused lambda callback
      undefined as any
    );

    expect(sendWelcome).not.toHaveBeenCalled();
  });

  it("skips the email when registration never captured an address", async () => {
    existingRow.contactEmail = null;
    selectWhere.mockReturnValue([existingRow]);

    await handler(
      sqsEvent("License Updated - Manufacturer", {
        license: { arn: LICENSE_ARN },
      }),
      {} as never,
      // biome-ignore lint/suspicious/noExplicitAny: unused lambda callback
      undefined as any
    );

    expect(sendWelcome).not.toHaveBeenCalled();
  });

  it("never emails on deactivation", async () => {
    selectWhere.mockReturnValue([existingRow]);

    await handler(
      sqsEvent("License Deprovisioned - Manufacturer", {
        license: { arn: LICENSE_ARN },
      }),
      {} as never,
      // biome-ignore lint/suspicious/noExplicitAny: unused lambda callback
      undefined as any
    );

    expect(sendWelcome).not.toHaveBeenCalled();
  });
});
