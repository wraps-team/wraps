/**
 * Identity backstop tests (real DB).
 *
 * recordSendingIdentity runs on every SES webhook event. The hot path (domain
 * already in the snapshot) must make zero SES calls, and a burst of events for
 * unknown domains must cost at most one GetEmailIdentity per cooldown.
 *
 * Only true boundaries are mocked (STS credentials, the SES client).
 */

import { awsAccount, db, eq } from "@wraps/db";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  type BaseOrgFixture,
  cleanupBaseOrg,
  seedBaseOrg,
} from "../(ee)/__tests__/fixtures/real-db";

const mockSesSend = vi.fn();

vi.mock("@aws-sdk/client-sesv2", () => ({
  SESv2Client: class {
    send = mockSesSend;
  },
  GetEmailIdentityCommand: class {
    constructor(public input: unknown) {}
  },
  ListEmailIdentitiesCommand: class {
    constructor(public input: unknown) {}
  },
}));

vi.mock("../services/credentials", () => ({
  getCredentials: vi.fn().mockResolvedValue({
    accessKeyId: "k",
    secretAccessKey: "s",
    sessionToken: "t",
    expiration: new Date(Date.now() + 3_600_000),
    region: "us-east-1",
  }),
}));

const { recordSendingIdentity } = await import("../lib/identity-backstop");

const TEST_PREFIX = "identity-backstop-db";

let fixture: BaseOrgFixture;

const wrapsTags = (domain: string) => ({
  "ses:configuration-set": ["wraps-email-tracking"],
  "ses:from-domain": [domain],
});

async function reseed(features: (typeof awsAccount.$inferInsert)["features"]) {
  await db
    .update(awsAccount)
    .set({ features, identitiesScannedAt: null })
    .where(eq(awsAccount.id, fixture.ids.awsAccount));
}

async function readAccount() {
  const [row] = await db
    .select()
    .from(awsAccount)
    .where(eq(awsAccount.id, fixture.ids.awsAccount));
  if (!row) {
    throw new Error("fixture account missing");
  }
  return row;
}

async function callBackstop(tags: Record<string, string[]> | undefined) {
  const account = await readAccount();
  await recordSendingIdentity({
    account: {
      id: account.id,
      organizationId: account.organizationId,
      features: account.features,
    },
    tags,
  });
}

const verifiedOnWrapsSet = {
  IdentityType: "DOMAIN",
  VerifiedForSendingStatus: true,
  ConfigurationSetName: "wraps-email-tracking",
};

beforeAll(async () => {
  fixture = await seedBaseOrg(TEST_PREFIX);
});

afterAll(async () => {
  await cleanupBaseOrg(TEST_PREFIX);
});

beforeEach(async () => {
  mockSesSend.mockReset();
  await reseed({
    email: { identities: [] },
    sms: { enabled: true, phoneNumbers: [] },
  });
});

describe("recordSendingIdentity", () => {
  it("adds an unknown verified Wraps domain and keeps unrelated features", async () => {
    mockSesSend.mockResolvedValue(verifiedOnWrapsSet);

    await callBackstop(wrapsTags("new.example.com"));

    const row = await readAccount();
    expect(row.features?.email?.identities).toEqual([
      {
        identity: "new.example.com",
        type: "DOMAIN",
        configSetName: "wraps-email-tracking",
      },
    ]);
    expect(row.features?.sms).toEqual({ enabled: true, phoneNumbers: [] });
    expect(mockSesSend).toHaveBeenCalledTimes(1);
  });

  it("makes no SES call when the domain is already in the snapshot", async () => {
    await reseed({
      email: {
        identities: [
          {
            identity: "Known.Example.com",
            type: "DOMAIN",
            configSetName: "wraps-email-tracking",
          },
        ],
      },
    });

    await callBackstop(wrapsTags("known.example.com"));

    expect(mockSesSend).not.toHaveBeenCalled();
  });

  it("makes no SES call for a non-Wraps config set or absent tags", async () => {
    await callBackstop({
      "ses:configuration-set": ["someone-elses-set"],
      "ses:from-domain": ["other.example.com"],
    });
    await callBackstop(undefined);

    expect(mockSesSend).not.toHaveBeenCalled();
  });

  it("makes one SES call for two different unknown domains within the cooldown", async () => {
    mockSesSend.mockResolvedValue(verifiedOnWrapsSet);

    await callBackstop(wrapsTags("first.example.com"));
    await callBackstop(wrapsTags("second.example.com"));

    expect(mockSesSend).toHaveBeenCalledTimes(1);
  });

  it("leaves the row unchanged when SES reports the identity not found", async () => {
    const notFound = new Error("not found");
    notFound.name = "NotFoundException";
    mockSesSend.mockRejectedValue(notFound);

    await callBackstop(wrapsTags("gone.example.com"));

    const row = await readAccount();
    expect(row.features?.email?.identities).toEqual([]);
  });

  it("does not throw when SES fails with a generic error", async () => {
    mockSesSend.mockRejectedValue(new Error("boom"));

    await expect(
      callBackstop(wrapsTags("err.example.com"))
    ).resolves.toBeUndefined();

    const row = await readAccount();
    expect(row.features?.email?.identities).toEqual([]);
  });
});
