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
import { listSendingDomains, type SendingDomain } from "../domains";
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
});

afterAll(async () => {
  await db.delete(awsAccount).where(eq(awsAccount.id, testAwsAccount.id));
  await db.delete(awsAccount).where(eq(awsAccount.id, testAwsAccount2.id));
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
});
