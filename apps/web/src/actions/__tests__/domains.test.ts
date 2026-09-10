import { awsAccount, db, member, organization, user } from "@wraps/db";
import { eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { dnsRecordsFor } from "@/lib/dns-records";
import {
  addSendingDomain,
  getConfigurationSetDetail,
  listSendingDomains,
  probeTrackingDomain,
  type SendingDomain,
} from "../domains";
import { UNAUTHORIZED } from "../shared/org-action";

// ─── Mocks ──────────────────────────────────────────────────────────────────

let currentMockUserId: string | null = null;

vi.mock("next/headers", () => ({
  headers: () => new Headers(),
}));

vi.mock("@wraps/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => {
        if (currentMockUserId === null) {
          return null;
        }
        return {
          user: {
            id: currentMockUserId,
            email: "domains-test@example.com",
            name: "Domains Test User",
          },
          session: {
            id: "domains-test-session",
            createdAt: new Date(),
            updatedAt: new Date(),
            userId: currentMockUserId,
            expiresAt: new Date(Date.now() + 86_400_000),
            token: "domains-test-token",
          },
        };
      }),
    },
  },
}));

const mockGetOrAssumeRole = vi.fn();
vi.mock("@/lib/aws/credential-cache", () => ({
  getOrAssumeRole: (...args: unknown[]) => mockGetOrAssumeRole(...args),
}));

const mockProbeTrackingTls = vi.fn();
vi.mock("@/lib/tracking-tls", () => ({
  probeTrackingTls: (...args: unknown[]) => mockProbeTrackingTls(...args),
}));

// addSendingDomain revalidates the domains route on success; outside a real
// Next.js request context revalidatePath throws "static generation store
// missing", which orgAction's catch-all would otherwise turn into a false
// "Failed to add sending domain".
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

type SesCommand = {
  _type: string;
  EmailIdentity?: string;
  input?: Record<string, unknown>;
};

const mockSend = vi.fn();

vi.mock("@aws-sdk/client-sesv2", () => ({
  SESv2Client: class {
    send(command: SesCommand) {
      return mockSend(command);
    }
  },
  ListEmailIdentitiesCommand: class {
    _type = "ListEmailIdentitiesCommand";
    input: Record<string, unknown>;
    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  },
  GetEmailIdentityCommand: class {
    _type = "GetEmailIdentityCommand";
    EmailIdentity: string;
    constructor(input: { EmailIdentity: string }) {
      this.EmailIdentity = input.EmailIdentity;
    }
  },
  CreateEmailIdentityCommand: class {
    _type = "CreateEmailIdentityCommand";
    input: Record<string, unknown>;
    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  },
  GetConfigurationSetCommand: class {
    _type = "GetConfigurationSetCommand";
    input: Record<string, unknown>;
    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  },
  GetConfigurationSetEventDestinationsCommand: class {
    _type = "GetConfigurationSetEventDestinationsCommand";
    input: Record<string, unknown>;
    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  },
}));

// ─── Test fixtures ──────────────────────────────────────────────────────────

const testUser = {
  id: "test-domains-user-1",
  email: "domains-user@example.com",
  name: "Domains Test User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testOrganization = {
  id: "test-domains-org-1",
  name: "Domains Test Org",
  slug: "domains-test-org",
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const testMember = {
  id: "test-domains-member-1",
  organizationId: testOrganization.id,
  userId: testUser.id,
  role: "owner" as const,
  createdAt: new Date(),
};

const testAwsAccount = {
  id: "test-domains-aws-account-1",
  organizationId: testOrganization.id,
  name: "Domains Test AWS Account",
  accountId: "111111111111",
  region: "us-east-1",
  roleArn: "arn:aws:iam::111111111111:role/WrapsRole",
  externalId: "test-domains-external-id-1",
  isVerified: true,
  lastVerifiedAt: new Date(),
  createdBy: testUser.id,
  createdAt: new Date(),
  updatedAt: new Date(),
  webhookSecret: null,
};

const testAwsAccount2 = {
  id: "test-domains-aws-account-2",
  organizationId: testOrganization.id,
  name: "Domains Test AWS Account 2",
  accountId: "222222222222",
  region: "eu-west-1",
  roleArn: "arn:aws:iam::222222222222:role/WrapsRole",
  externalId: "test-domains-external-id-2",
  isVerified: true,
  lastVerifiedAt: new Date(),
  createdBy: testUser.id,
  createdAt: new Date(),
  updatedAt: new Date(),
  webhookSecret: null,
};

// ─── Cross-org IDOR fixtures ────────────────────────────────────────────────
// A second organization testUser is NOT a member of, and an AWS account that
// belongs to it — exercises the "account belongs to a different org" path
// for addSendingDomain (see describe("addSendingDomain") below).

const testOrganization2 = {
  id: "test-domains-org-2",
  name: "Domains Test Org 2",
  slug: "domains-test-org-2",
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const testAwsAccountForeign = {
  id: "test-domains-aws-account-foreign",
  organizationId: testOrganization2.id,
  name: "Foreign Org AWS Account",
  accountId: "333333333333",
  region: "us-east-1",
  roleArn: "arn:aws:iam::333333333333:role/WrapsRole",
  externalId: "test-domains-external-id-foreign",
  isVerified: true,
  lastVerifiedAt: new Date(),
  createdBy: testUser.id,
  createdAt: new Date(),
  updatedAt: new Date(),
  webhookSecret: null,
};

beforeAll(async () => {
  await db
    .insert(user)
    .values(testUser)
    .onConflictDoUpdate({ target: user.id, set: { updatedAt: new Date() } });

  await db
    .insert(organization)
    .values(testOrganization)
    .onConflictDoUpdate({
      target: organization.id,
      set: { name: testOrganization.name },
    });

  await db
    .insert(member)
    .values(testMember)
    .onConflictDoUpdate({ target: member.id, set: { role: testMember.role } });

  await db
    .insert(awsAccount)
    .values(testAwsAccount)
    .onConflictDoUpdate({
      target: awsAccount.id,
      set: { updatedAt: new Date() },
    });

  // No `member` row for testUser in org 2 — deliberate, this is the IDOR
  // fixture.
  await db
    .insert(organization)
    .values(testOrganization2)
    .onConflictDoUpdate({
      target: organization.id,
      set: { name: testOrganization2.name },
    });

  await db
    .insert(awsAccount)
    .values(testAwsAccountForeign)
    .onConflictDoUpdate({
      target: awsAccount.id,
      set: { updatedAt: new Date() },
    });
});

afterAll(async () => {
  await db.delete(awsAccount).where(eq(awsAccount.id, testAwsAccount.id));
  await db.delete(awsAccount).where(eq(awsAccount.id, testAwsAccount2.id));
  await db
    .delete(awsAccount)
    .where(eq(awsAccount.id, testAwsAccountForeign.id));
  await db
    .delete(organization)
    .where(eq(organization.id, testOrganization2.id));
  await db.delete(member).where(eq(member.id, testMember.id));
  await db.delete(organization).where(eq(organization.id, testOrganization.id));
  await db.delete(user).where(eq(user.id, testUser.id));
});

beforeEach(() => {
  currentMockUserId = testUser.id;
  mockGetOrAssumeRole.mockReset();
  mockGetOrAssumeRole.mockResolvedValue({
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    sessionToken: "session-token",
  });
  mockSend.mockReset();
  mockProbeTrackingTls.mockReset();
  mockProbeTrackingTls.mockResolvedValue({
    status: "unknown",
    reason: "not probed",
  });
});

// ─── dnsRecordsFor (pure) ───────────────────────────────────────────────────

const baseDomain: SendingDomain = {
  identity: "example.com",
  identityType: "DOMAIN",
  verifiedForSending: true,
  verificationStatus: "SUCCESS",
  dkim: null,
  mailFromDomain: null,
  configurationSet: "wraps-email-example.com",
  awsAccountId: "acct-1",
  region: "us-east-1",
};

describe("dnsRecordsFor", () => {
  it("emits one CNAME record per DKIM token, with the exact name/value shape", () => {
    const records = dnsRecordsFor({
      ...baseDomain,
      dkim: { status: "SUCCESS", tokens: ["tok1", "tok2", "tok3"] },
    });

    const dkimRecords = records.filter((r) => r.kind === "dkim");
    expect(dkimRecords).toHaveLength(3);
    for (const token of ["tok1", "tok2", "tok3"]) {
      const record = dkimRecords.find(
        (r) => r.value === `${token}.dkim.amazonses.com`
      );
      expect(record).toBeTruthy();
      expect(record?.type).toBe("CNAME");
      expect(record?.name).toBe(`${token}._domainkey.example.com`);
    }
  });

  it("emits no DKIM records when dkim is null", () => {
    const records = dnsRecordsFor({ ...baseDomain, dkim: null });
    expect(records.filter((r) => r.kind === "dkim")).toHaveLength(0);
  });

  it("emits no DKIM records when dkim.tokens is empty", () => {
    const records = dnsRecordsFor({
      ...baseDomain,
      dkim: { status: "SUCCESS", tokens: [] },
    });
    expect(records.filter((r) => r.kind === "dkim")).toHaveLength(0);
  });

  it("emits exactly one MX and one TXT record when mailFromDomain is present, with the region interpolated into the MX value", () => {
    const records = dnsRecordsFor({
      ...baseDomain,
      region: "eu-west-1",
      mailFromDomain: { domain: "mail.example.com", status: "SUCCESS" },
    });

    const mx = records.filter((r) => r.type === "MX");
    const txt = records.filter((r) => r.type === "TXT");
    expect(mx).toHaveLength(1);
    expect(txt).toHaveLength(1);
    expect(mx[0].name).toBe("mail.example.com");
    expect(mx[0].value).toBe("10 feedback-smtp.eu-west-1.amazonses.com");
    expect(txt[0].name).toBe("mail.example.com");
    expect(txt[0].value).toBe("v=spf1 include:amazonses.com ~all");
  });

  it("emits no MAIL FROM records when mailFromDomain is null", () => {
    const records = dnsRecordsFor({ ...baseDomain, mailFromDomain: null });
    expect(records.filter((r) => r.kind.startsWith("mailfrom"))).toHaveLength(
      0
    );
  });

  it("never emits an SPF or DMARC record for the root domain itself", () => {
    const records = dnsRecordsFor({
      ...baseDomain,
      dkim: { status: "SUCCESS", tokens: ["tok1"] },
      mailFromDomain: { domain: "mail.example.com", status: "SUCCESS" },
    });

    const rootDomainRecords = records.filter((r) => r.name === "example.com");
    expect(rootDomainRecords).toHaveLength(0);
  });
});

// ─── listSendingDomains ─────────────────────────────────────────────────────

describe("listSendingDomains", () => {
  it("returns unverified identities — the filter getVerifiedDomains applies must not apply here", async () => {
    mockSend.mockImplementation((command: SesCommand) => {
      if (command._type === "ListEmailIdentitiesCommand") {
        return Promise.resolve({
          EmailIdentities: [{ IdentityName: "unverified.com" }],
        });
      }
      if (command._type === "GetEmailIdentityCommand") {
        return Promise.resolve({
          IdentityType: "DOMAIN",
          VerifiedForSendingStatus: false,
          VerificationStatus: "PENDING",
          DkimAttributes: { Status: "PENDING", Tokens: ["tok1"] },
        });
      }
      return Promise.reject(new Error(`Unexpected command ${command._type}`));
    });

    const result = await listSendingDomains(testOrganization.id);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.domains).toHaveLength(1);
      expect(result.domains[0].identity).toBe("unverified.com");
      expect(result.domains[0].verifiedForSending).toBe(false);
      expect(result.domains[0].verificationStatus).toBe("PENDING");
    }
  });

  it("omits only the identity whose GetEmailIdentity call fails; other identities still return", async () => {
    mockSend.mockImplementation((command: SesCommand) => {
      if (command._type === "ListEmailIdentitiesCommand") {
        return Promise.resolve({
          EmailIdentities: [
            { IdentityName: "good.com" },
            { IdentityName: "broken.com" },
          ],
        });
      }
      if (command._type === "GetEmailIdentityCommand") {
        if (command.EmailIdentity === "broken.com") {
          return Promise.reject(new Error("InternalFailure"));
        }
        return Promise.resolve({
          IdentityType: "DOMAIN",
          VerifiedForSendingStatus: true,
          VerificationStatus: "SUCCESS",
        });
      }
      return Promise.reject(new Error(`Unexpected command ${command._type}`));
    });

    const result = await listSendingDomains(testOrganization.id);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.domains).toHaveLength(1);
      expect(result.domains[0].identity).toBe("good.com");
      expect(result.unreachableAccountIds).toHaveLength(0);
    }
  });

  it("returns identities from both AWS accounts when an org has two", async () => {
    await db
      .insert(awsAccount)
      .values(testAwsAccount2)
      .onConflictDoUpdate({
        target: awsAccount.id,
        set: { updatedAt: new Date() },
      });

    try {
      let listCalls = 0;
      mockSend.mockImplementation((command: SesCommand) => {
        if (command._type === "ListEmailIdentitiesCommand") {
          listCalls += 1;
          const identity = listCalls === 1 ? "acct1.com" : "acct2.com";
          return Promise.resolve({
            EmailIdentities: [{ IdentityName: identity }],
          });
        }
        if (command._type === "GetEmailIdentityCommand") {
          return Promise.resolve({
            IdentityType: "DOMAIN",
            VerifiedForSendingStatus: true,
            VerificationStatus: "SUCCESS",
          });
        }
        return Promise.reject(new Error(`Unexpected command ${command._type}`));
      });

      const result = await listSendingDomains(testOrganization.id);

      expect(result.success).toBe(true);
      if (result.success) {
        const identities = result.domains.map((d) => d.identity).sort();
        expect(identities).toEqual(["acct1.com", "acct2.com"]);
        const accountIds = new Set(result.domains.map((d) => d.awsAccountId));
        expect(accountIds.size).toBe(2);
      }
    } finally {
      await db.delete(awsAccount).where(eq(awsAccount.id, testAwsAccount2.id));
    }
  });

  it("returns an unauthorized failure for an organization the caller is not a member of", async () => {
    const result = await listSendingDomains("test-domains-org-nonexistent");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(UNAUTHORIZED);
    }
  });

  it("pages through multiple pages of identities, following the NextToken from each response", async () => {
    let listCalls = 0;
    mockSend.mockImplementation((command: SesCommand) => {
      if (command._type === "ListEmailIdentitiesCommand") {
        listCalls += 1;
        if (listCalls === 1) {
          expect(command.input?.NextToken).toBeUndefined();
          const page = Array.from({ length: 100 }, (_, i) => ({
            IdentityName: `page1-${i}.com`,
          }));
          return Promise.resolve({
            EmailIdentities: page,
            NextToken: "page-2-token",
          });
        }
        expect(command.input?.NextToken).toBe("page-2-token");
        const page = Array.from({ length: 20 }, (_, i) => ({
          IdentityName: `page2-${i}.com`,
        }));
        return Promise.resolve({ EmailIdentities: page });
      }
      if (command._type === "GetEmailIdentityCommand") {
        return Promise.resolve({
          IdentityType: "DOMAIN",
          VerifiedForSendingStatus: true,
          VerificationStatus: "SUCCESS",
        });
      }
      return Promise.reject(new Error(`Unexpected command ${command._type}`));
    });

    const result = await listSendingDomains(testOrganization.id);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.domains).toHaveLength(120);
      expect(result.truncatedAccountIds).toHaveLength(0);
    }
    expect(listCalls).toBe(2);
  });

  it("makes exactly one list call when the first page has no NextToken", async () => {
    let listCalls = 0;
    mockSend.mockImplementation((command: SesCommand) => {
      if (command._type === "ListEmailIdentitiesCommand") {
        listCalls += 1;
        return Promise.resolve({
          EmailIdentities: [{ IdentityName: "solo.com" }],
        });
      }
      if (command._type === "GetEmailIdentityCommand") {
        return Promise.resolve({
          IdentityType: "DOMAIN",
          VerifiedForSendingStatus: true,
          VerificationStatus: "SUCCESS",
        });
      }
      return Promise.reject(new Error(`Unexpected command ${command._type}`));
    });

    const result = await listSendingDomains(testOrganization.id);

    expect(result.success).toBe(true);
    expect(listCalls).toBe(1);
  });

  it("terminates when NextToken does not advance between pages, instead of looping forever", async () => {
    let listCalls = 0;
    mockSend.mockImplementation((command: SesCommand) => {
      if (command._type === "ListEmailIdentitiesCommand") {
        listCalls += 1;
        return Promise.resolve({
          EmailIdentities: [{ IdentityName: `stuck-${listCalls}.com` }],
          NextToken: "stuck-token",
        });
      }
      if (command._type === "GetEmailIdentityCommand") {
        return Promise.resolve({
          IdentityType: "DOMAIN",
          VerifiedForSendingStatus: true,
          VerificationStatus: "SUCCESS",
        });
      }
      return Promise.reject(new Error(`Unexpected command ${command._type}`));
    });

    const result = await listSendingDomains(testOrganization.id);

    expect(result.success).toBe(true);
    // Without the "returned !== nextToken" guard this hangs rather than
    // fails, so an explicit short timeout (see the third arg below) bounds
    // the failure mode instead of letting a regression stall the suite.
    expect(listCalls).toBeLessThanOrEqual(2);
  }, 5000);

  it("stops at MAX_IDENTITIES and reports the account as truncated, without hanging on an endless supply of pages", async () => {
    // MAX_IDENTITIES is 1000 in apps/web/src/actions/domains.ts — the
    // constant is not exported (a non-async export from a "use server"
    // file breaks next build), so this value must be kept in sync by hand.
    const sharedGetResponse = {
      IdentityType: "DOMAIN",
      VerifiedForSendingStatus: true,
      VerificationStatus: "SUCCESS",
    };

    let listCalls = 0;
    mockSend.mockImplementation((command: SesCommand) => {
      if (command._type === "ListEmailIdentitiesCommand") {
        listCalls += 1;
        const page = Array.from({ length: 100 }, (_, i) => ({
          IdentityName: `overflow-${listCalls}-${i}.com`,
        }));
        // Always return a token — this account has far more than
        // MAX_IDENTITIES identities, an endless supply of pages.
        return Promise.resolve({
          EmailIdentities: page,
          NextToken: `token-${listCalls}`,
        });
      }
      if (command._type === "GetEmailIdentityCommand") {
        // A single shared response object — building 1000 distinct
        // fixtures here is what makes this kind of test slow to run and
        // read.
        return Promise.resolve(sharedGetResponse);
      }
      return Promise.reject(new Error(`Unexpected command ${command._type}`));
    });

    const result = await listSendingDomains(testOrganization.id);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.domains.length).toBeGreaterThan(0);
      expect(result.domains.length).toBeLessThanOrEqual(1000);
      expect(result.truncatedAccountIds).toContain(testAwsAccount.id);
    }
  }, 20_000);

  it("marks the account unreachable when pagination itself fails partway through; other accounts' domains still return", async () => {
    await db
      .insert(awsAccount)
      .values(testAwsAccount2)
      .onConflictDoUpdate({
        target: awsAccount.id,
        set: { updatedAt: new Date() },
      });

    try {
      // The DB does not guarantee which of the org's two accounts is
      // processed first, so drive the failure off call order rather than a
      // specific account id: whichever account is processed first fails
      // partway through pagination, whichever is second succeeds normally.
      let listCalls = 0;
      mockSend.mockImplementation((command: SesCommand) => {
        if (command._type === "ListEmailIdentitiesCommand") {
          listCalls += 1;
          if (listCalls === 1) {
            // First account, first page: succeeds, hands back a token.
            return Promise.resolve({
              EmailIdentities: [{ IdentityName: "page1.com" }],
              NextToken: "token-1",
            });
          }
          if (listCalls === 2) {
            // First account, second page: the role loses access mid-pagination.
            return Promise.reject(new Error("AccessDeniedException"));
          }
          // Second account: a normal, single-page list.
          return Promise.resolve({
            EmailIdentities: [{ IdentityName: "surviving.com" }],
          });
        }
        if (command._type === "GetEmailIdentityCommand") {
          return Promise.resolve({
            IdentityType: "DOMAIN",
            VerifiedForSendingStatus: true,
            VerificationStatus: "SUCCESS",
          });
        }
        return Promise.reject(new Error(`Unexpected command ${command._type}`));
      });

      const result = await listSendingDomains(testOrganization.id);

      expect(result.success).toBe(true);
      if (result.success) {
        // Exactly one of the two accounts landed in unreachableAccountIds …
        expect(result.unreachableAccountIds).toHaveLength(1);
        expect([testAwsAccount.id, testAwsAccount2.id]).toContain(
          result.unreachableAccountIds[0]
        );
        // … and the other account's domain still came back, undisturbed by
        // the first account's mid-pagination failure.
        expect(result.domains).toHaveLength(1);
        expect(result.domains[0].identity).toBe("surviving.com");
        expect(result.domains[0].awsAccountId).not.toBe(
          result.unreachableAccountIds[0]
        );
      }
    } finally {
      await db.delete(awsAccount).where(eq(awsAccount.id, testAwsAccount2.id));
    }
  });

  it("does not mark the account truncated on the ordinary (exhausted-list) path", async () => {
    mockSend.mockImplementation((command: SesCommand) => {
      if (command._type === "ListEmailIdentitiesCommand") {
        return Promise.resolve({
          EmailIdentities: [{ IdentityName: "clean.com" }],
        });
      }
      if (command._type === "GetEmailIdentityCommand") {
        return Promise.resolve({
          IdentityType: "DOMAIN",
          VerifiedForSendingStatus: true,
          VerificationStatus: "SUCCESS",
        });
      }
      return Promise.reject(new Error(`Unexpected command ${command._type}`));
    });

    const result = await listSendingDomains(testOrganization.id);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.truncatedAccountIds).toEqual([]);
    }
  });
});

// ─── addSendingDomain ───────────────────────────────────────────────────────

describe("addSendingDomain", () => {
  function mockCreateSuccess() {
    mockSend.mockImplementation((command: SesCommand) => {
      if (command._type === "CreateEmailIdentityCommand") {
        return Promise.resolve({});
      }
      return Promise.reject(new Error(`Unexpected command ${command._type}`));
    });
  }

  it("sends CreateEmailIdentityCommand with the trimmed, lowercased domain and reports a fresh create", async () => {
    mockCreateSuccess();

    const result = await addSendingDomain(
      testOrganization.id,
      testAwsAccount.id,
      "example.com"
    );

    expect(result).toEqual({
      success: true,
      domain: "example.com",
      alreadyExisted: false,
    });
    expect(mockSend).toHaveBeenCalledTimes(1);
    const sentCommand = mockSend.mock.calls[0][0] as SesCommand;
    expect(sentCommand._type).toBe("CreateEmailIdentityCommand");
    expect(sentCommand.input).toEqual({ EmailIdentity: "example.com" });
  });

  it("normalises surrounding whitespace and mixed case before sending", async () => {
    mockCreateSuccess();

    const result = await addSendingDomain(
      testOrganization.id,
      testAwsAccount.id,
      "  Example.COM  "
    );

    expect(result).toEqual({
      success: true,
      domain: "example.com",
      alreadyExisted: false,
    });
    const sentCommand = mockSend.mock.calls[0][0] as SesCommand;
    expect(sentCommand.input).toEqual({ EmailIdentity: "example.com" });
  });

  it("treats AlreadyExistsException as success, not a failure", async () => {
    mockSend.mockImplementation((command: SesCommand) => {
      if (command._type === "CreateEmailIdentityCommand") {
        const err = new Error("AlreadyExistsException");
        err.name = "AlreadyExistsException";
        return Promise.reject(err);
      }
      return Promise.reject(new Error(`Unexpected command ${command._type}`));
    });

    const result = await addSendingDomain(
      testOrganization.id,
      testAwsAccount.id,
      "already-there.com"
    );

    expect(result).toEqual({
      success: true,
      domain: "already-there.com",
      alreadyExisted: true,
    });
  });

  it("maps an access-denied error to the wraps platform update-role remediation string", async () => {
    mockSend.mockImplementation((command: SesCommand) => {
      if (command._type === "CreateEmailIdentityCommand") {
        const err = new Error("AccessDeniedException");
        err.name = "AccessDeniedException";
        return Promise.reject(err);
      }
      return Promise.reject(new Error(`Unexpected command ${command._type}`));
    });

    const result = await addSendingDomain(
      testOrganization.id,
      testAwsAccount.id,
      "denied.com"
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("wraps platform update-role");
    }
  });

  it("refuses an AWS account belonging to a different organization, without calling AWS", async () => {
    mockCreateSuccess();

    const result = await addSendingDomain(
      testOrganization.id,
      testAwsAccountForeign.id,
      "example.com"
    );

    expect(result.success).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("rejects empty and whitespace-only input without calling AWS", async () => {
    mockCreateSuccess();

    const emptyResult = await addSendingDomain(
      testOrganization.id,
      testAwsAccount.id,
      ""
    );
    expect(emptyResult.success).toBe(false);

    const whitespaceResult = await addSendingDomain(
      testOrganization.id,
      testAwsAccount.id,
      "   "
    );
    expect(whitespaceResult.success).toBe(false);

    expect(mockSend).not.toHaveBeenCalled();
  });

  it("rejects input containing @ without calling AWS", async () => {
    mockCreateSuccess();

    const result = await addSendingDomain(
      testOrganization.id,
      testAwsAccount.id,
      "user@example.com"
    );

    expect(result.success).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("never sends DkimSigningAttributes — pins the Easy DKIM default", async () => {
    mockCreateSuccess();

    await addSendingDomain(
      testOrganization.id,
      testAwsAccount.id,
      "easy-dkim.com"
    );

    const sentCommand = mockSend.mock.calls[0][0] as SesCommand;
    expect(sentCommand.input).not.toHaveProperty("DkimSigningAttributes");
  });
});

describe("getConfigurationSetDetail", () => {
  function mockConfigSetResponses(
    csResponse: Record<string, unknown>,
    eventDestResponse: Record<string, unknown> = { EventDestinations: [] }
  ) {
    mockSend.mockImplementation((command: SesCommand) => {
      if (command._type === "GetConfigurationSetCommand") {
        return Promise.resolve(csResponse);
      }
      if (command._type === "GetConfigurationSetEventDestinationsCommand") {
        return Promise.resolve(eventDestResponse);
      }
      return Promise.reject(new Error(`Unexpected command ${command._type}`));
    });
  }

  it("sends both commands with the given ConfigurationSetName and maps the response", async () => {
    mockConfigSetResponses(
      {
        TrackingOptions: {
          CustomRedirectDomain: "track.example.com",
          HttpsPolicy: "REQUIRE",
        },
        DeliveryOptions: { TlsPolicy: "REQUIRE" },
        SendingOptions: { SendingEnabled: true },
        ReputationOptions: { ReputationMetricsEnabled: true },
        SuppressionOptions: { SuppressedReasons: ["BOUNCE"] },
      },
      {
        EventDestinations: [
          {
            Name: "wraps-events",
            Enabled: true,
            MatchingEventTypes: ["SEND", "DELIVERY"],
            EventBridgeDestination: { EventBusArn: "arn:aws:events:::bus" },
          },
        ],
      }
    );

    const result = await getConfigurationSetDetail(
      testOrganization.id,
      testAwsAccount.id,
      "wraps-email-example.com"
    );

    expect(result).toEqual({
      success: true,
      detail: {
        name: "wraps-email-example.com",
        trackingRedirectDomain: "track.example.com",
        trackingHttpsPolicy: "REQUIRE",
        tlsPolicy: "REQUIRE",
        sendingEnabled: true,
        reputationMetricsEnabled: true,
        suppressedReasons: ["BOUNCE"],
        eventDestinations: [
          {
            name: "wraps-events",
            enabled: true,
            matchingEventTypes: ["SEND", "DELIVERY"],
            destinationType: "EventBridge",
          },
        ],
      },
    });

    expect(mockSend).toHaveBeenCalledTimes(2);
    const [csCommand, eventDestCommand] = mockSend.mock.calls.map(
      (call) => call[0] as SesCommand
    );
    expect(csCommand._type).toBe("GetConfigurationSetCommand");
    expect(csCommand.input).toEqual({
      ConfigurationSetName: "wraps-email-example.com",
    });
    expect(eventDestCommand._type).toBe(
      "GetConfigurationSetEventDestinationsCommand"
    );
    expect(eventDestCommand.input).toEqual({
      ConfigurationSetName: "wraps-email-example.com",
    });
  });

  it("maps a missing TrackingOptions to null rather than undefined or a crash", async () => {
    mockConfigSetResponses({});

    const result = await getConfigurationSetDetail(
      testOrganization.id,
      testAwsAccount.id,
      "wraps-email-no-tracking.com"
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.detail.trackingRedirectDomain).toBeNull();
      expect(result.detail.trackingHttpsPolicy).toBeNull();
    }
  });

  it("surfaces an OPTIONAL HttpsPolicy verbatim", async () => {
    mockConfigSetResponses({
      TrackingOptions: {
        CustomRedirectDomain: "track.example.com",
        HttpsPolicy: "OPTIONAL",
      },
    });

    const result = await getConfigurationSetDetail(
      testOrganization.id,
      testAwsAccount.id,
      "wraps-email-optional-https.com"
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.detail.trackingHttpsPolicy).toBe("OPTIONAL");
    }
  });

  it("refuses an AWS account belonging to a different organization, without calling AWS", async () => {
    mockConfigSetResponses({});

    const result = await getConfigurationSetDetail(
      testOrganization.id,
      testAwsAccountForeign.id,
      "wraps-email-example.com"
    );

    expect(result.success).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("maps AccessDeniedException to an unreachable failure", async () => {
    mockSend.mockImplementation(() => {
      const err = new Error("AccessDeniedException");
      err.name = "AccessDeniedException";
      return Promise.reject(err);
    });

    const result = await getConfigurationSetDetail(
      testOrganization.id,
      testAwsAccount.id,
      "wraps-email-denied.com"
    );

    expect(result).toEqual({
      success: false,
      error: expect.any(String),
      unreachable: true,
    });
  });

  it("maps NotFoundException to a failure that is not unreachable, mentioning the configuration set", async () => {
    mockSend.mockImplementation((command: SesCommand) => {
      if (command._type === "GetConfigurationSetCommand") {
        const err = new Error("NotFoundException");
        err.name = "NotFoundException";
        return Promise.reject(err);
      }
      return Promise.reject(new Error(`Unexpected command ${command._type}`));
    });

    const result = await getConfigurationSetDetail(
      testOrganization.id,
      testAwsAccount.id,
      "wraps-email-deleted-set.com"
    );

    expect(result.success).toBe(false);
    expect(result).toHaveProperty("unreachable", false);
    if (!result.success) {
      expect(result.error).toContain("wraps-email-deleted-set.com");
    }
  });

  it("maps an EventBridgeDestination to destinationType EventBridge, and an unrecognised destination to Unknown", async () => {
    mockConfigSetResponses(
      {},
      {
        EventDestinations: [
          {
            Name: "eventbridge-dest",
            Enabled: true,
            MatchingEventTypes: ["SEND"],
            EventBridgeDestination: { EventBusArn: "arn:aws:events:::bus" },
          },
          {
            Name: "mystery-dest",
            Enabled: false,
            MatchingEventTypes: ["BOUNCE"],
          },
        ],
      }
    );

    const result = await getConfigurationSetDetail(
      testOrganization.id,
      testAwsAccount.id,
      "wraps-email-multi-dest.com"
    );

    expect(result.success).toBe(true);
    if (result.success) {
      const [eventBridgeDest, mysteryDest] = result.detail.eventDestinations;
      expect(eventBridgeDest.destinationType).toBe("EventBridge");
      expect(mysteryDest.destinationType).toBe("Unknown");
    }
  });

  it("maps an empty EventDestinations list to an empty array without error", async () => {
    mockConfigSetResponses({}, { EventDestinations: [] });

    const result = await getConfigurationSetDetail(
      testOrganization.id,
      testAwsAccount.id,
      "wraps-email-no-events.com"
    );

    expect(result).toEqual({
      success: true,
      detail: expect.objectContaining({ eventDestinations: [] }),
    });
  });

  it("never sends ListConfigurationSetsCommand — this must work on roles predating that grant", async () => {
    mockConfigSetResponses({});

    await getConfigurationSetDetail(
      testOrganization.id,
      testAwsAccount.id,
      "wraps-email-example.com"
    );

    const sentTypes = mockSend.mock.calls.map(
      (call) => (call[0] as SesCommand)._type
    );
    expect(sentTypes).not.toContain("ListConfigurationSetsCommand");
  });
});

describe("probeTrackingDomain", () => {
  function mockGetConfigurationSetResponse(
    csResponse: Record<string, unknown>
  ) {
    mockSend.mockImplementation((command: SesCommand) => {
      if (command._type === "GetConfigurationSetCommand") {
        return Promise.resolve(csResponse);
      }
      return Promise.reject(new Error(`Unexpected command ${command._type}`));
    });
  }

  it("calls the TLS probe with SES's CustomRedirectDomain and passes the result through", async () => {
    mockGetConfigurationSetResponse({
      TrackingOptions: { CustomRedirectDomain: "track.example.com" },
    });
    mockProbeTrackingTls.mockResolvedValue({ status: "serving" });

    const result = await probeTrackingDomain(
      testOrganization.id,
      testAwsAccount.id,
      "wraps-email-example.com"
    );

    expect(result).toEqual({
      success: true,
      trackingDomain: "track.example.com",
      result: { status: "serving" },
    });
    expect(mockProbeTrackingTls).toHaveBeenCalledExactlyOnceWith(
      "track.example.com"
    );
  });

  it("takes no hostname argument — the probed host always comes from SES, never from the caller's configurationSetName", async () => {
    // The test passes an attacker-chosen string as the config-set name; the
    // stubbed SES response carries the real tracking domain. If the action
    // ever started deriving a hostname from caller input instead of the SES
    // response, this would catch it — the probe must receive the SES value.
    mockGetConfigurationSetResponse({
      TrackingOptions: { CustomRedirectDomain: "track.honest.com" },
    });
    mockProbeTrackingTls.mockResolvedValue({ status: "serving" });

    await probeTrackingDomain(
      testOrganization.id,
      testAwsAccount.id,
      "attacker-controlled-string-not-a-real-config-set"
    );

    expect(mockProbeTrackingTls).toHaveBeenCalledExactlyOnceWith(
      "track.honest.com"
    );
  });

  it("refuses an AWS account belonging to a different organization, calling neither SES nor the probe", async () => {
    mockGetConfigurationSetResponse({
      TrackingOptions: { CustomRedirectDomain: "track.example.com" },
    });

    const result = await probeTrackingDomain(
      testOrganization.id,
      testAwsAccountForeign.id,
      "wraps-email-example.com"
    );

    expect(result.success).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockProbeTrackingTls).not.toHaveBeenCalled();
  });

  it("returns a no-tracking-domain result and never calls the probe when TrackingOptions is absent", async () => {
    mockGetConfigurationSetResponse({});

    const result = await probeTrackingDomain(
      testOrganization.id,
      testAwsAccount.id,
      "wraps-email-no-tracking.com"
    );

    expect(result).toEqual({ success: true, trackingDomain: null });
    expect(mockProbeTrackingTls).not.toHaveBeenCalled();
  });

  it("maps AccessDeniedException to an unreachable failure without calling the probe", async () => {
    mockSend.mockImplementation(() => {
      const err = new Error("AccessDeniedException");
      err.name = "AccessDeniedException";
      return Promise.reject(err);
    });

    const result = await probeTrackingDomain(
      testOrganization.id,
      testAwsAccount.id,
      "wraps-email-denied.com"
    );

    expect(result).toEqual({
      success: false,
      error: expect.any(String),
      unreachable: true,
    });
    expect(mockProbeTrackingTls).not.toHaveBeenCalled();
  });
});
