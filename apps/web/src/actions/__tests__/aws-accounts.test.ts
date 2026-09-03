import { awsAccount, db, member, organization, user } from "@wraps/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { AssumeRoleError } from "@/lib/aws/assume-role";
import {
  deleteAWSAccount,
  getSMSPhoneNumbers,
  getVerifiedDomains,
  listAWSAccounts,
  removeWebhookSecretAction,
  saveWebhookSecretAction,
  scanAWSAccountFeatures,
} from "../aws-accounts";

// Test data
const testUser = {
  id: "test-aws-user-1",
  email: "aws-test@example.com",
  name: "AWS Test User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testNonMemberUser = {
  id: "test-aws-non-member-1",
  email: "aws-non-member@example.com",
  name: "AWS Non-Member User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testOrganization = {
  id: "test-aws-org-1",
  name: "AWS Test Org",
  slug: "aws-test-org",
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const testMember = {
  id: "test-aws-member-1",
  organizationId: testOrganization.id,
  userId: testUser.id,
  role: "owner" as const,
  createdAt: new Date(),
};

const testMemberUser = {
  id: "test-aws-member-user-1",
  email: "aws-member@example.com",
  name: "AWS Member User",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  image: null,
  twoFactorEnabled: false,
  stripeCustomerId: null,
};

const testRegularMember = {
  id: "test-aws-regular-member-1",
  organizationId: testOrganization.id,
  userId: testMemberUser.id,
  role: "member" as const,
  createdAt: new Date(),
};

const testAwsAccount = {
  id: "test-aws-account-1",
  organizationId: testOrganization.id,
  name: "Test AWS Account",
  accountId: "123456789012",
  region: "us-east-1",
  roleArn: "arn:aws:iam::123456789012:role/WrapsRole",
  externalId: "test-external-id-12345",
  isVerified: true,
  lastVerifiedAt: new Date(),
  createdBy: testUser.id,
  createdAt: new Date(),
  updatedAt: new Date(),
  webhookSecret: null,
};

const testAwsAccount2 = {
  id: "test-aws-account-2",
  organizationId: testOrganization.id,
  name: "Second AWS Account",
  accountId: "987654321098",
  region: "us-west-2",
  roleArn: "arn:aws:iam::987654321098:role/WrapsRole",
  externalId: "test-external-id-67890",
  isVerified: false,
  lastVerifiedAt: null,
  createdBy: testUser.id,
  createdAt: new Date(),
  updatedAt: new Date(),
  webhookSecret: "a".repeat(64), // Valid 64-char hex string
};

// Track current mock user and session state
let currentMockUserId: string | null = testUser.id;

// Mock next/headers
vi.mock("next/headers", () => ({
  headers: () => new Headers(),
}));

vi.mock("next/server", () => ({
  after: vi.fn((fn: () => unknown) => fn()),
}));

// Mock next/cache
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Helper to get user data based on current mock user id
const getUserData = (userId: string | null) => {
  if (userId === testUser.id) {
    return { email: testUser.email, name: testUser.name };
  }
  if (userId === testMemberUser.id) {
    return { email: testMemberUser.email, name: testMemberUser.name };
  }
  return { email: testNonMemberUser.email, name: testNonMemberUser.name };
};

// Mock the auth module - dynamic based on currentMockUserId
vi.mock("@wraps/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => {
        if (currentMockUserId === null) {
          return null;
        }
        const userData = getUserData(currentMockUserId);
        return {
          user: {
            id: currentMockUserId,
            email: userData.email,
            name: userData.name,
          },
          session: {
            id: "session-123",
            createdAt: new Date(),
            updatedAt: new Date(),
            userId: currentMockUserId,
            expiresAt: new Date(Date.now() + 86_400_000),
            token: "test-token",
          },
        };
      }),
    },
  },
}));

// Mock AWS credential cache
const mockGetOrAssumeRole = vi.fn();
vi.mock("@/lib/aws/credential-cache", () => ({
  getOrAssumeRole: (...args: unknown[]) => mockGetOrAssumeRole(...args),
}));

// Mock AWS SES SDK - must use function factory for hoisting
const mockSend = vi.fn();
const mockDynamoSend = vi.fn();
const mockS3Send = vi.fn();
const mockSmsSend = vi.fn();

vi.mock("@aws-sdk/client-sesv2", () => ({
  SESv2Client: class {
    send = (command: {
      _type: string;
      EmailIdentity?: string;
      ConfigurationSetName?: string;
    }) => mockSend(command);
  },
  ListEmailIdentitiesCommand: class {
    _type = "ListEmailIdentitiesCommand";
    constructor(public input?: unknown) {}
  },
  GetEmailIdentityCommand: class {
    _type = "GetEmailIdentityCommand";
    EmailIdentity: string;
    constructor(input: { EmailIdentity: string }) {
      this.EmailIdentity = input.EmailIdentity;
    }
  },
  GetConfigurationSetCommand: class {
    _type = "GetConfigurationSetCommand";
    ConfigurationSetName: string;
    constructor(input: { ConfigurationSetName: string }) {
      this.ConfigurationSetName = input.ConfigurationSetName;
    }
  },
  GetConfigurationSetEventDestinationsCommand: class {
    _type = "GetConfigurationSetEventDestinationsCommand";
    ConfigurationSetName: string;
    constructor(input: { ConfigurationSetName: string }) {
      this.ConfigurationSetName = input.ConfigurationSetName;
    }
  },
  ListConfigurationSetsCommand: class {
    _type = "ListConfigurationSetsCommand";
    constructor(public input?: unknown) {}
  },
  GetAccountCommand: class {
    _type = "GetAccountCommand";
    constructor(public input?: unknown) {}
  },
  GetDedicatedIpsCommand: class {
    _type = "GetDedicatedIpsCommand";
    constructor(public input?: unknown) {}
  },
}));

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class {
    send = (...args: unknown[]) => mockDynamoSend(...args);
  },
  DescribeTableCommand: class {
    _type = "DescribeTableCommand";
    constructor(public input?: unknown) {}
  },
}));

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send = (...args: unknown[]) => mockS3Send(...args);
  },
  HeadBucketCommand: class {
    _type = "HeadBucketCommand";
    constructor(public input?: unknown) {}
  },
}));

vi.mock("@aws-sdk/client-pinpoint-sms-voice-v2", () => ({
  PinpointSMSVoiceV2Client: class {
    send = (...args: unknown[]) => mockSmsSend(...args);
  },
  DescribePhoneNumbersCommand: class {
    _type = "DescribePhoneNumbersCommand";
    constructor(public input?: unknown) {}
  },
}));

vi.mock("@/lib/aws/mailmanager", () => ({
  findWrapsArchive: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/activation-tracking", () => ({
  trackDomainVerified: vi.fn().mockResolvedValue(undefined),
  trackAwsConnected: vi.fn().mockResolvedValue(undefined),
}));

// Capture warnings so tests can assert on them. `serializeError` stays real —
// the actions module uses it to shape what gets logged.
const mockLogWarn = vi.fn();
// `error` is what forwards to Sentry, so tests assert on it to prove that an
// expected customer misconfiguration does not page us.
const mockLogError = vi.fn();

vi.mock("@/lib/logger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/logger")>();
  return {
    ...actual,
    createActionLogger: () => ({
      info: vi.fn(),
      warn: (...args: unknown[]) => mockLogWarn(...args),
      error: (...args: unknown[]) => mockLogError(...args),
      debug: vi.fn(),
    }),
  };
});

// Set up test database
beforeAll(async () => {
  // Insert test users
  await db
    .insert(user)
    .values(testUser)
    .onConflictDoUpdate({
      target: user.id,
      set: { updatedAt: new Date() },
    });

  await db
    .insert(user)
    .values(testNonMemberUser)
    .onConflictDoUpdate({
      target: user.id,
      set: { updatedAt: new Date() },
    });

  await db
    .insert(user)
    .values(testMemberUser)
    .onConflictDoUpdate({
      target: user.id,
      set: { updatedAt: new Date() },
    });

  // Insert test organization
  await db
    .insert(organization)
    .values(testOrganization)
    .onConflictDoUpdate({
      target: organization.id,
      set: { name: testOrganization.name },
    });

  // Insert test members (owner and regular member)
  await db
    .insert(member)
    .values(testMember)
    .onConflictDoUpdate({
      target: member.id,
      set: { role: testMember.role },
    });

  await db
    .insert(member)
    .values(testRegularMember)
    .onConflictDoUpdate({
      target: member.id,
      set: { role: testRegularMember.role },
    });

  // Insert test AWS accounts
  await db
    .insert(awsAccount)
    .values(testAwsAccount)
    .onConflictDoUpdate({
      target: awsAccount.id,
      set: { updatedAt: new Date() },
    });

  await db
    .insert(awsAccount)
    .values(testAwsAccount2)
    .onConflictDoUpdate({
      target: awsAccount.id,
      set: { updatedAt: new Date() },
    });
});

// Reset mocks before each test
beforeEach(() => {
  currentMockUserId = testUser.id;
  mockSend.mockReset();
  mockDynamoSend.mockReset();
  mockS3Send.mockReset();
  mockSmsSend.mockReset();
  mockGetOrAssumeRole.mockReset();

  // Default mock for credentials
  mockGetOrAssumeRole.mockResolvedValue({
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    sessionToken: "session-token",
  });
});

// Clean up after all tests
afterAll(async () => {
  await db.delete(awsAccount).where(eq(awsAccount.id, testAwsAccount.id));
  await db.delete(awsAccount).where(eq(awsAccount.id, testAwsAccount2.id));
  await db.delete(member).where(eq(member.id, testMember.id));
  await db.delete(member).where(eq(member.id, testRegularMember.id));
  await db.delete(organization).where(eq(organization.id, testOrganization.id));
  await db.delete(user).where(eq(user.id, testUser.id));
  await db.delete(user).where(eq(user.id, testNonMemberUser.id));
  await db.delete(user).where(eq(user.id, testMemberUser.id));
});

describe("getVerifiedDomains", () => {
  describe("authorization", () => {
    it("should return error when user is not authenticated", async () => {
      currentMockUserId = null;

      const result = await getVerifiedDomains(
        testAwsAccount.id,
        testOrganization.id
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Unauthorized");
      }
    });

    it("should return error when user is not a member of the organization", async () => {
      currentMockUserId = testNonMemberUser.id;

      const result = await getVerifiedDomains(
        testAwsAccount.id,
        testOrganization.id
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("don't have access");
      }
    });
  });

  describe("AWS account lookup", () => {
    it("should return error when AWS account is not found", async () => {
      const result = await getVerifiedDomains(
        "non-existent-account-id",
        testOrganization.id
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("AWS account not found");
      }
    });

    it("should return error when AWS account belongs to different organization", async () => {
      const result = await getVerifiedDomains(
        testAwsAccount.id,
        "different-org-id"
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        // User is not a member of different-org-id
        expect(result.error).toContain("don't have access");
      }
    });
  });

  describe("successful domain fetch", () => {
    it("should return empty array when no identities exist", async () => {
      mockSend.mockResolvedValueOnce({
        EmailIdentities: [],
      });

      const result = await getVerifiedDomains(
        testAwsAccount.id,
        testOrganization.id
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.identities).toEqual([]);
      }
    });

    it("should return verified domains using Wraps configuration set", async () => {
      // Mock ListEmailIdentitiesCommand response
      mockSend.mockImplementation((command) => {
        if (command._type === "ListEmailIdentitiesCommand") {
          return Promise.resolve({
            EmailIdentities: [
              {
                IdentityName: "example.com",
                IdentityType: "DOMAIN",
                SendingEnabled: true,
              },
              {
                IdentityName: "other.com",
                IdentityType: "DOMAIN",
                SendingEnabled: true,
              },
              {
                IdentityName: "test@example.com",
                IdentityType: "EMAIL_ADDRESS",
                SendingEnabled: true,
              },
            ],
          });
        }
        if (command._type === "GetEmailIdentityCommand") {
          // Return different config sets based on identity
          if (command.EmailIdentity === "example.com") {
            return Promise.resolve({
              IdentityType: "DOMAIN",
              VerifiedForSendingStatus: true,
              ConfigurationSetName: "wraps-email-tracking",
            });
          }
          if (command.EmailIdentity === "other.com") {
            return Promise.resolve({
              IdentityType: "DOMAIN",
              VerifiedForSendingStatus: true,
              ConfigurationSetName: "some-other-config-set",
            });
          }
          if (command.EmailIdentity === "test@example.com") {
            return Promise.resolve({
              IdentityType: "EMAIL_ADDRESS",
              VerifiedForSendingStatus: true,
              ConfigurationSetName: "wraps-email-production",
            });
          }
        }
        return Promise.resolve({});
      });

      const result = await getVerifiedDomains(
        testAwsAccount.id,
        testOrganization.id
      );

      expect(result.success).toBe(true);
      if (result.success) {
        // Should only include identities with wraps-email-* config set
        expect(result.identities).toHaveLength(2);
        expect(result.identities).toContainEqual({
          identity: "example.com",
          type: "DOMAIN",
        });
        expect(result.identities).toContainEqual({
          identity: "test@example.com",
          type: "EMAIL_ADDRESS",
        });
        // Should NOT include other.com (different config set)
        expect(
          result.identities.find((i) => i.identity === "other.com")
        ).toBeUndefined();
      }
    });

    it("should filter out unverified identities", async () => {
      mockSend.mockImplementation((command) => {
        if (command._type === "ListEmailIdentitiesCommand") {
          return Promise.resolve({
            EmailIdentities: [
              {
                IdentityName: "verified.com",
                IdentityType: "DOMAIN",
                SendingEnabled: true,
              },
              {
                IdentityName: "unverified.com",
                IdentityType: "DOMAIN",
                SendingEnabled: true,
              },
            ],
          });
        }
        if (command._type === "GetEmailIdentityCommand") {
          if (command.EmailIdentity === "verified.com") {
            return Promise.resolve({
              IdentityType: "DOMAIN",
              VerifiedForSendingStatus: true,
              ConfigurationSetName: "wraps-email-tracking",
            });
          }
          if (command.EmailIdentity === "unverified.com") {
            return Promise.resolve({
              IdentityType: "DOMAIN",
              VerifiedForSendingStatus: false, // Not verified
              ConfigurationSetName: "wraps-email-tracking",
            });
          }
        }
        return Promise.resolve({});
      });

      const result = await getVerifiedDomains(
        testAwsAccount.id,
        testOrganization.id
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.identities).toHaveLength(1);
        expect(result.identities[0].identity).toBe("verified.com");
      }
    });

    it("should filter out identities with sending disabled", async () => {
      mockSend.mockImplementation((command) => {
        if (command._type === "ListEmailIdentitiesCommand") {
          return Promise.resolve({
            EmailIdentities: [
              {
                IdentityName: "enabled.com",
                IdentityType: "DOMAIN",
                SendingEnabled: true,
              },
              {
                IdentityName: "disabled.com",
                IdentityType: "DOMAIN",
                SendingEnabled: false, // Sending disabled
              },
            ],
          });
        }
        if (command._type === "GetEmailIdentityCommand") {
          return Promise.resolve({
            IdentityType: "DOMAIN",
            VerifiedForSendingStatus: true,
            ConfigurationSetName: "wraps-email-tracking",
          });
        }
        return Promise.resolve({});
      });

      const result = await getVerifiedDomains(
        testAwsAccount.id,
        testOrganization.id
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.identities).toHaveLength(1);
        expect(result.identities[0].identity).toBe("enabled.com");
      }
    });
  });

  describe("non-Wraps identity filtering", () => {
    it("should exclude identities without configuration set", async () => {
      mockSend.mockImplementation((command) => {
        if (command._type === "ListEmailIdentitiesCommand") {
          return Promise.resolve({
            EmailIdentities: [
              {
                IdentityName: "no-config.com",
                IdentityType: "DOMAIN",
                SendingEnabled: true,
              },
            ],
          });
        }
        if (command._type === "GetEmailIdentityCommand") {
          return Promise.resolve({
            IdentityType: "DOMAIN",
            VerifiedForSendingStatus: true,
            ConfigurationSetName: undefined, // No config set
          });
        }
        return Promise.resolve({});
      });

      const result = await getVerifiedDomains(
        testAwsAccount.id,
        testOrganization.id
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.identities).toHaveLength(0);
      }
    });

    it("should exclude identities with non-Wraps configuration set", async () => {
      mockSend.mockImplementation((command) => {
        if (command._type === "ListEmailIdentitiesCommand") {
          return Promise.resolve({
            EmailIdentities: [
              {
                IdentityName: "custom-config.com",
                IdentityType: "DOMAIN",
                SendingEnabled: true,
              },
            ],
          });
        }
        if (command._type === "GetEmailIdentityCommand") {
          return Promise.resolve({
            IdentityType: "DOMAIN",
            VerifiedForSendingStatus: true,
            ConfigurationSetName: "my-custom-ses-config", // Not wraps-email-*
          });
        }
        return Promise.resolve({});
      });

      const result = await getVerifiedDomains(
        testAwsAccount.id,
        testOrganization.id
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.identities).toHaveLength(0);
      }
    });
  });

  describe("error handling", () => {
    it("should handle AWS SDK errors gracefully", async () => {
      mockSend.mockRejectedValueOnce(new Error("AWS SDK Error"));

      const result = await getVerifiedDomains(
        testAwsAccount.id,
        testOrganization.id
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("AWS SDK Error");
      }
    });

    it("should handle credential errors gracefully", async () => {
      mockGetOrAssumeRole.mockRejectedValueOnce(
        new Error("Failed to assume role")
      );

      const result = await getVerifiedDomains(
        testAwsAccount.id,
        testOrganization.id
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Failed to assume role");
      }
    });

    // assumeRole() replaces the underlying AWS message with its own copy, so
    // the only surviving signal that the customer's role is unusable is the
    // AssumeRoleError `code`.
    it.each(["ACCESS_DENIED", "INVALID_TRUST_POLICY"] as const)(
      "reports a %s assume-role failure as PERMISSION_DENIED",
      async (code) => {
        mockLogError.mockClear();
        mockGetOrAssumeRole.mockRejectedValueOnce(
          new AssumeRoleError(
            code,
            "Wraps could not assume the IAM role. Check that the CloudFormation stack deployed successfully and that the External ID matches the stack output."
          )
        );

        const result = await getVerifiedDomains(
          testAwsAccount.id,
          testOrganization.id
        );

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.errorCode).toBe("PERMISSION_DENIED");
        }
        // log.error is the Sentry hook — a customer misconfiguration must not page us.
        expect(mockLogError).not.toHaveBeenCalled();
      }
    );

    it("still reports a Wraps-side credential failure as UNKNOWN so it reaches Sentry", async () => {
      mockLogError.mockClear();
      mockGetOrAssumeRole.mockRejectedValueOnce(
        new AssumeRoleError(
          "INVALID_BACKEND_CREDENTIALS",
          "Wraps could not authenticate to AWS to validate your connection. This is a Wraps-side issue — please try again shortly."
        )
      );

      const result = await getVerifiedDomains(
        testAwsAccount.id,
        testOrganization.id
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errorCode).toBe("UNKNOWN");
      }
      expect(mockLogError).toHaveBeenCalled();
    });

    it("should skip identities that fail to fetch details", async () => {
      mockSend.mockImplementation((command) => {
        if (command._type === "ListEmailIdentitiesCommand") {
          return Promise.resolve({
            EmailIdentities: [
              {
                IdentityName: "good.com",
                IdentityType: "DOMAIN",
                SendingEnabled: true,
              },
              {
                IdentityName: "error.com",
                IdentityType: "DOMAIN",
                SendingEnabled: true,
              },
            ],
          });
        }
        if (command._type === "GetEmailIdentityCommand") {
          if (command.EmailIdentity === "good.com") {
            return Promise.resolve({
              IdentityType: "DOMAIN",
              VerifiedForSendingStatus: true,
              ConfigurationSetName: "wraps-email-tracking",
            });
          }
          if (command.EmailIdentity === "error.com") {
            return Promise.reject(new Error("Access denied"));
          }
        }
        return Promise.resolve({});
      });

      const result = await getVerifiedDomains(
        testAwsAccount.id,
        testOrganization.id
      );

      expect(result.success).toBe(true);
      if (result.success) {
        // Should still return good.com, skipping error.com
        expect(result.identities).toHaveLength(1);
        expect(result.identities[0].identity).toBe("good.com");
      }
    });
  });
});

describe("getSMSPhoneNumbers", () => {
  beforeAll(async () => {
    await db
      .update(awsAccount)
      .set({ smsEnabled: true })
      .where(eq(awsAccount.id, testAwsAccount.id));
  });

  afterAll(async () => {
    await db
      .update(awsAccount)
      .set({ smsEnabled: false })
      .where(eq(awsAccount.id, testAwsAccount.id));
  });

  it("does not page us when the customer's role cannot be assumed", async () => {
    currentMockUserId = testUser.id;
    mockLogError.mockClear();
    mockLogWarn.mockClear();
    mockGetOrAssumeRole.mockRejectedValueOnce(
      new AssumeRoleError(
        "ACCESS_DENIED",
        "Wraps could not assume the IAM role. Check that the CloudFormation stack deployed successfully and that the External ID matches the stack output."
      )
    );

    const result = await getSMSPhoneNumbers(
      testAwsAccount.id,
      testOrganization.id
    );

    expect(result.success).toBe(false);
    expect(mockLogError).not.toHaveBeenCalled();
    expect(mockLogWarn).toHaveBeenCalled();
  });

  it("tells the client the role needs repair so the UI can offer a remediation", async () => {
    currentMockUserId = testUser.id;
    mockGetOrAssumeRole.mockRejectedValueOnce(
      new AssumeRoleError(
        "INVALID_TRUST_POLICY",
        "Wraps could not assume the IAM role. Check that the CloudFormation stack deployed successfully and that the External ID matches the stack output."
      )
    );

    const result = await getSMSPhoneNumbers(
      testAwsAccount.id,
      testOrganization.id
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe("PERMISSION_DENIED");
    }
  });

  it("reports a Wraps-side credential failure as UNKNOWN", async () => {
    currentMockUserId = testUser.id;
    mockGetOrAssumeRole.mockRejectedValueOnce(
      new AssumeRoleError(
        "INVALID_BACKEND_CREDENTIALS",
        "Wraps could not authenticate to AWS to validate your connection. This is a Wraps-side issue — please try again shortly."
      )
    );

    const result = await getSMSPhoneNumbers(
      testAwsAccount.id,
      testOrganization.id
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe("UNKNOWN");
    }
  });
});

describe("listAWSAccounts", () => {
  it("should return error when user is not authenticated", async () => {
    currentMockUserId = null;

    const result = await listAWSAccounts(testOrganization.id);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("You must be logged in");
    }
  });

  it("should return error when user is not a member of the organization", async () => {
    currentMockUserId = testNonMemberUser.id;

    const result = await listAWSAccounts(testOrganization.id);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("don't have access");
    }
  });

  it("should return all AWS accounts for the organization", async () => {
    const result = await listAWSAccounts(testOrganization.id);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.accounts.length).toBeGreaterThanOrEqual(2);
      expect(result.accounts.map((a) => a.id)).toContain(testAwsAccount.id);
      expect(result.accounts.map((a) => a.id)).toContain(testAwsAccount2.id);
    }
  });

  it("should include creator information", async () => {
    const result = await listAWSAccounts(testOrganization.id);

    expect(result.success).toBe(true);
    if (result.success) {
      const account = result.accounts.find((a) => a.id === testAwsAccount.id);
      expect(account).toBeDefined();
      expect(account?.createdBy).toBeDefined();
      expect(account?.createdBy?.id).toBe(testUser.id);
      expect(account?.createdBy?.email).toBe(testUser.email);
    }
  });

  it("should allow regular members to view accounts", async () => {
    currentMockUserId = testMemberUser.id;

    const result = await listAWSAccounts(testOrganization.id);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.accounts.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("should return empty list for organization with no accounts", async () => {
    // Create a new org without accounts
    const emptyOrg = {
      id: "test-empty-org",
      name: "Empty Org",
      slug: "empty-org",
      createdAt: new Date(),
      logo: null,
      metadata: null,
    };

    const emptyOrgMember = {
      id: "test-empty-org-member",
      organizationId: emptyOrg.id,
      userId: testUser.id,
      role: "owner" as const,
      createdAt: new Date(),
    };

    await db
      .insert(organization)
      .values(emptyOrg)
      .onConflictDoUpdate({
        target: organization.id,
        set: { name: emptyOrg.name },
      });

    await db
      .insert(member)
      .values(emptyOrgMember)
      .onConflictDoUpdate({
        target: member.id,
        set: { role: emptyOrgMember.role },
      });

    const result = await listAWSAccounts(emptyOrg.id);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.accounts).toHaveLength(0);
    }

    // Clean up
    await db.delete(member).where(eq(member.id, emptyOrgMember.id));
    await db.delete(organization).where(eq(organization.id, emptyOrg.id));
  });
});

describe("deleteAWSAccount", () => {
  // Create a deletable account for each test
  const deletableAccount = {
    id: "test-deletable-account",
    organizationId: testOrganization.id,
    name: "Deletable Account",
    accountId: "111222333444",
    region: "eu-west-1",
    roleArn: "arn:aws:iam::111222333444:role/WrapsRole",
    externalId: "deletable-external-id",
    isVerified: true,
    lastVerifiedAt: new Date(),
    createdBy: testUser.id,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    // Ensure the deletable account exists before each test
    await db
      .insert(awsAccount)
      .values(deletableAccount)
      .onConflictDoUpdate({
        target: awsAccount.id,
        set: { updatedAt: new Date() },
      });
  });

  it("should return error when user is not authenticated", async () => {
    currentMockUserId = null;

    const result = await deleteAWSAccount(
      deletableAccount.id,
      testOrganization.id
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Not authenticated");
    }
  });

  it("should return error when user is a regular member", async () => {
    currentMockUserId = testMemberUser.id;

    const result = await deleteAWSAccount(
      deletableAccount.id,
      testOrganization.id
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("permission");
    }
  });

  it("should return error when account does not exist", async () => {
    const result = await deleteAWSAccount(
      "non-existent-account",
      testOrganization.id
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("AWS account not found");
    }
  });

  it("should return error when account belongs to different organization", async () => {
    const result = await deleteAWSAccount(
      deletableAccount.id,
      "different-org-id"
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      // User is not a member of different org
      expect(result.error).toContain("Only owners and admins");
    }
  });

  it("should successfully delete an AWS account as owner", async () => {
    const result = await deleteAWSAccount(
      deletableAccount.id,
      testOrganization.id
    );

    expect(result.success).toBe(true);

    // Verify the account is deleted
    const deleted = await db.query.awsAccount.findFirst({
      where: (a, { eq }) => eq(a.id, deletableAccount.id),
    });
    expect(deleted).toBeUndefined();
  });
});

// ─── IDOR: second org and account for cross-org tests ─────────────────────

const orgB = {
  id: "test-aws-org-b",
  name: "AWS Test Org B",
  slug: "aws-test-org-b",
  createdAt: new Date(),
  logo: null,
  metadata: null,
};

const orgBAccount = {
  id: "test-aws-account-org-b",
  organizationId: orgB.id,
  name: "Org B AWS Account",
  accountId: "555666777888",
  region: "us-east-1",
  roleArn: "arn:aws:iam::555666777888:role/WrapsRole",
  externalId: "test-external-id-orgb",
  isVerified: true,
  lastVerifiedAt: new Date(),
  createdBy: testUser.id,
  createdAt: new Date(),
  updatedAt: new Date(),
  webhookSecret: "c".repeat(64),
};

describe("saveWebhookSecretAction — IDOR prevention", () => {
  const validWebhookSecret = "d".repeat(64);

  beforeAll(async () => {
    await db
      .insert(organization)
      .values(orgB)
      .onConflictDoUpdate({
        target: organization.id,
        set: { name: orgB.name },
      });
    await db
      .insert(awsAccount)
      .values(orgBAccount)
      .onConflictDoUpdate({
        target: awsAccount.id,
        set: { updatedAt: new Date() },
      });
  });

  afterAll(async () => {
    await db.delete(awsAccount).where(eq(awsAccount.id, orgBAccount.id));
    await db.delete(organization).where(eq(organization.id, orgB.id));
  });

  it("should return 'AWS account not found' when account belongs to a different org", async () => {
    // Authenticated as userA (owner of testOrganization / org A).
    // Attempt to save a webhook secret for orgBAccount using orgA's organizationId.
    // The query scoped to orgA.id should find nothing — not a permission error,
    // specifically "not found" because the account+org pair doesn't match.
    const result = await saveWebhookSecretAction(
      orgBAccount.id,
      validWebhookSecret,
      testOrganization.id
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("AWS account not found");
    }
  });
});

describe("removeWebhookSecretAction — IDOR prevention", () => {
  beforeAll(async () => {
    await db
      .insert(organization)
      .values(orgB)
      .onConflictDoUpdate({
        target: organization.id,
        set: { name: orgB.name },
      });
    await db
      .insert(awsAccount)
      .values(orgBAccount)
      .onConflictDoUpdate({
        target: awsAccount.id,
        set: { updatedAt: new Date() },
      });
  });

  afterAll(async () => {
    await db.delete(awsAccount).where(eq(awsAccount.id, orgBAccount.id));
    await db.delete(organization).where(eq(organization.id, orgB.id));
  });

  it("should return 'AWS account not found' when account belongs to a different org", async () => {
    // Authenticated as userA (owner of testOrganization / org A).
    // Attempt to remove the webhook secret for orgBAccount using orgA's organizationId.
    // The scoped query finds nothing — result is not-found, not a permission error.
    const result = await removeWebhookSecretAction(
      orgBAccount.id,
      testOrganization.id
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("AWS account not found");
    }
  });
});

describe("saveWebhookSecretAction", () => {
  const validWebhookSecret = "a".repeat(64); // Valid 64-char hex string

  beforeEach(async () => {
    // Reset webhook secret on test account
    await db
      .update(awsAccount)
      .set({ webhookSecret: null, updatedAt: new Date() })
      .where(eq(awsAccount.id, testAwsAccount.id));
  });

  it("should return error when user is not authenticated", async () => {
    currentMockUserId = null;

    const result = await saveWebhookSecretAction(
      testAwsAccount.id,
      validWebhookSecret,
      testOrganization.id
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("must be logged in");
    }
  });

  it("should return error when account does not exist", async () => {
    const result = await saveWebhookSecretAction(
      "non-existent-account",
      validWebhookSecret,
      testOrganization.id
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("AWS account not found");
    }
  });

  it("should return error when user is a regular member", async () => {
    currentMockUserId = testMemberUser.id;

    const result = await saveWebhookSecretAction(
      testAwsAccount.id,
      validWebhookSecret,
      testOrganization.id
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("don't have permission");
    }
  });

  it("should return error for invalid webhook secret format", async () => {
    const result = await saveWebhookSecretAction(
      testAwsAccount.id,
      "invalid-secret",
      testOrganization.id
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Invalid webhook secret format");
    }
  });

  it("should return error for webhook secret that is too short", async () => {
    const result = await saveWebhookSecretAction(
      testAwsAccount.id,
      "abc123", // Too short
      testOrganization.id
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Invalid webhook secret format");
    }
  });

  it("should successfully save a valid webhook secret", async () => {
    const result = await saveWebhookSecretAction(
      testAwsAccount.id,
      validWebhookSecret,
      testOrganization.id
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message).toContain("saved successfully");
    }

    // Verify the secret was saved
    const updated = await db.query.awsAccount.findFirst({
      where: (a, { eq }) => eq(a.id, testAwsAccount.id),
    });
    expect(updated?.webhookSecret).toBe(validWebhookSecret);
  });

  it("revalidates the webhook configuration page using org slug", async () => {
    const vi_revalidatePath = vi.mocked(revalidatePath);
    vi_revalidatePath.mockClear();

    await saveWebhookSecretAction(
      testAwsAccount.id,
      validWebhookSecret,
      testOrganization.id
    );

    expect(vi_revalidatePath).toHaveBeenCalledWith(
      `/${testOrganization.slug}/settings/aws-accounts/${testAwsAccount.id}`
    );
  });
});

describe("removeWebhookSecretAction", () => {
  beforeEach(async () => {
    // Set webhook secret on test account 2
    await db
      .update(awsAccount)
      .set({ webhookSecret: "b".repeat(64), updatedAt: new Date() })
      .where(eq(awsAccount.id, testAwsAccount2.id));
  });

  it("should return error when user is not authenticated", async () => {
    currentMockUserId = null;

    const result = await removeWebhookSecretAction(
      testAwsAccount2.id,
      testOrganization.id
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("must be logged in");
    }
  });

  it("should return error when account does not exist", async () => {
    const result = await removeWebhookSecretAction(
      "non-existent-account",
      testOrganization.id
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("AWS account not found");
    }
  });

  it("should return error when user is a regular member", async () => {
    currentMockUserId = testMemberUser.id;

    const result = await removeWebhookSecretAction(
      testAwsAccount2.id,
      testOrganization.id
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("don't have permission");
    }
  });

  it("should successfully remove webhook secret as owner", async () => {
    const result = await removeWebhookSecretAction(
      testAwsAccount2.id,
      testOrganization.id
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message).toContain("disconnected successfully");
    }

    // Verify the secret was removed
    const updated = await db.query.awsAccount.findFirst({
      where: (a, { eq }) => eq(a.id, testAwsAccount2.id),
    });
    expect(updated?.webhookSecret).toBeNull();
  });

  it("should succeed even if webhook secret is already null", async () => {
    // First remove the secret
    await db
      .update(awsAccount)
      .set({ webhookSecret: null, updatedAt: new Date() })
      .where(eq(awsAccount.id, testAwsAccount2.id));

    const result = await removeWebhookSecretAction(
      testAwsAccount2.id,
      testOrganization.id
    );

    expect(result.success).toBe(true);
  });

  it("revalidates the webhook configuration page using org slug", async () => {
    const vi_revalidatePath = vi.mocked(revalidatePath);
    vi_revalidatePath.mockClear();
    await removeWebhookSecretAction(testAwsAccount2.id, testOrganization.id);
    expect(vi_revalidatePath).toHaveBeenCalledWith(
      `/${testOrganization.slug}/settings/aws-accounts/${testAwsAccount2.id}`
    );
  });
});

// ─── scanAWSAccountFeatures ────────────────────────────────────────────────

const scanTestAccount = {
  id: "test-scan-account-1",
  organizationId: testOrganization.id,
  name: "Scan Test AWS Account",
  accountId: "333444555666",
  region: "us-east-1",
  roleArn: "arn:aws:iam::333444555666:role/WrapsRole",
  externalId: "scan-test-external-id",
  isVerified: true,
  lastVerifiedAt: new Date(),
  createdBy: testUser.id,
  createdAt: new Date(),
  updatedAt: new Date(),
  webhookSecret: null,
};

// Silence noisy AWS calls for scanAWSAccountFeatures tests — each test only
// needs to configure the config-set-specific behaviour.
function setupQuietScanDefaults() {
  const notFound = Object.assign(new Error("ResourceNotFoundException"), {
    name: "ResourceNotFoundException",
  });
  const accessDenied = Object.assign(new Error("AccessDeniedException"), {
    name: "AccessDeniedException",
  });

  // DynamoDB: table not found for both email and SMS history
  mockDynamoSend.mockRejectedValue(notFound);
  // S3: inbound bucket not found
  mockS3Send.mockRejectedValue(
    Object.assign(new Error("NotFound"), { name: "NotFound" })
  );
  // Pinpoint SMS: access denied (SMS not set up)
  mockSmsSend.mockRejectedValue(accessDenied);

  // SES: sandbox check, dedicated IPs, and identity list are all benign
  mockSend.mockImplementation(
    (command: { _type: string; ConfigurationSetName?: string }) => {
      switch (command._type) {
        case "GetAccountCommand":
          return Promise.resolve({ ProductionAccessEnabled: true });
        case "GetDedicatedIpsCommand":
          return Promise.resolve({ DedicatedIps: [] });
        case "ListEmailIdentitiesCommand":
          return Promise.resolve({ EmailIdentities: [] });
        case "GetConfigurationSetEventDestinationsCommand":
          return Promise.resolve({ EventDestinations: [] });
        default:
          return Promise.reject(
            new Error(`Unexpected SES command: ${command._type}`)
          );
      }
    }
  );
}

describe("scanAWSAccountFeatures — config set detection", () => {
  beforeAll(async () => {
    await db
      .insert(awsAccount)
      .values(scanTestAccount)
      .onConflictDoUpdate({
        target: awsAccount.id,
        set: { updatedAt: new Date() },
      });
  });

  afterAll(async () => {
    await db.delete(awsAccount).where(eq(awsAccount.id, scanTestAccount.id));
  });

  beforeEach(() => {
    setupQuietScanDefaults();
    // No clearMocks in the vitest config — warnings would otherwise accumulate
    // across tests and make the count assertions below pass for the wrong reason.
    mockLogWarn.mockClear();
  });

  it("stores wraps-email-tracking when global config set exists", async () => {
    mockSend.mockImplementation(
      (command: { _type: string; ConfigurationSetName?: string }) => {
        if (command._type === "ListConfigurationSetsCommand") {
          return Promise.resolve({
            ConfigurationSets: ["wraps-email-tracking"],
          });
        }
        if (command._type === "GetConfigurationSetCommand") {
          return Promise.resolve({ TrackingOptions: {} });
        }
        if (command._type === "GetConfigurationSetEventDestinationsCommand") {
          return Promise.resolve({
            EventDestinations: [
              { MatchingEventTypes: ["SEND", "OPEN", "CLICK"] },
            ],
          });
        }
        switch (command._type) {
          case "GetAccountCommand":
            return Promise.resolve({ ProductionAccessEnabled: true });
          case "GetDedicatedIpsCommand":
            return Promise.resolve({ DedicatedIps: [] });
          case "ListEmailIdentitiesCommand":
            return Promise.resolve({ EmailIdentities: [] });
          default:
            return Promise.reject(
              new Error(`Unexpected SES command: ${command._type}`)
            );
        }
      }
    );

    const result = await scanAWSAccountFeatures(
      scanTestAccount.id,
      testOrganization.id
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.features.email!.configSetName).toBe("wraps-email-tracking");
    }

    const row = await db.query.awsAccount.findFirst({
      where: (a, { eq }) => eq(a.id, scanTestAccount.id),
    });
    expect(row?.emailEnabled).toBe(true);
    expect(row?.features?.email?.configSetName).toBe("wraps-email-tracking");
  });

  it("falls back to per-domain config set when wraps-email-tracking is missing", async () => {
    const notFound = Object.assign(new Error("NotFoundException"), {
      name: "NotFoundException",
    });

    mockSend.mockImplementation(
      (command: { _type: string; ConfigurationSetName?: string }) => {
        if (command._type === "GetConfigurationSetCommand") {
          if (command.ConfigurationSetName === "wraps-email-tracking") {
            return Promise.reject(notFound);
          }
          // per-domain config set — return tracking domain
          return Promise.resolve({
            TrackingOptions: { CustomRedirectDomain: "track.example.com" },
          });
        }
        if (command._type === "ListConfigurationSetsCommand") {
          return Promise.resolve({
            ConfigurationSets: [
              "other-config",
              "wraps-email-example-com",
              "wraps-email-secondary-com",
            ],
          });
        }
        if (command._type === "GetConfigurationSetEventDestinationsCommand") {
          return Promise.resolve({
            EventDestinations: [{ MatchingEventTypes: ["SEND", "OPEN"] }],
          });
        }
        switch (command._type) {
          case "GetAccountCommand":
            return Promise.resolve({ ProductionAccessEnabled: true });
          case "GetDedicatedIpsCommand":
            return Promise.resolve({ DedicatedIps: [] });
          case "ListEmailIdentitiesCommand":
            return Promise.resolve({ EmailIdentities: [] });
          default:
            return Promise.reject(
              new Error(`Unexpected SES command: ${command._type}`)
            );
        }
      }
    );

    const result = await scanAWSAccountFeatures(
      scanTestAccount.id,
      testOrganization.id
    );

    expect(result.success).toBe(true);
    if (result.success) {
      // Should pick the first wraps-email-* match from the list
      expect(result.features.email!.configSetName).toBe(
        "wraps-email-example-com"
      );
      expect(result.features.email!.customTrackingDomain).toBe(
        "track.example.com"
      );
    }

    const row = await db.query.awsAccount.findFirst({
      where: (a, { eq }) => eq(a.id, scanTestAccount.id),
    });
    expect(row?.emailEnabled).toBe(true);
    expect(row?.features?.email?.configSetName).toBe("wraps-email-example-com");
  });

  it("sets emailEnabled=false when no wraps-email-* config set exists", async () => {
    const notFound = Object.assign(new Error("NotFoundException"), {
      name: "NotFoundException",
    });

    mockSend.mockImplementation(
      (command: { _type: string; ConfigurationSetName?: string }) => {
        if (command._type === "GetConfigurationSetCommand") {
          return Promise.reject(notFound);
        }
        if (command._type === "ListConfigurationSetsCommand") {
          return Promise.resolve({
            ConfigurationSets: ["some-other-config", "another-config"],
          });
        }
        switch (command._type) {
          case "GetAccountCommand":
            return Promise.resolve({ ProductionAccessEnabled: true });
          case "GetDedicatedIpsCommand":
            return Promise.resolve({ DedicatedIps: [] });
          case "ListEmailIdentitiesCommand":
            return Promise.resolve({ EmailIdentities: [] });
          default:
            return Promise.reject(
              new Error(`Unexpected SES command: ${command._type}`)
            );
        }
      }
    );

    const result = await scanAWSAccountFeatures(
      scanTestAccount.id,
      testOrganization.id
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.features.email?.configSetName).toBeUndefined();
    }

    const row = await db.query.awsAccount.findFirst({
      where: (a, { eq }) => eq(a.id, scanTestAccount.id),
    });
    expect(row?.emailEnabled).toBe(false);
    expect(row?.features?.email?.configSetName).toBeUndefined();
  });

  it("continues gracefully when config set scan is access denied", async () => {
    const accessDenied = Object.assign(new Error("AccessDeniedException"), {
      name: "AccessDeniedException",
    });

    mockSend.mockImplementation(
      (command: { _type: string; ConfigurationSetName?: string }) => {
        if (command._type === "GetConfigurationSetCommand") {
          return Promise.reject(accessDenied);
        }
        switch (command._type) {
          case "GetAccountCommand":
            return Promise.resolve({ ProductionAccessEnabled: true });
          case "GetDedicatedIpsCommand":
            return Promise.resolve({ DedicatedIps: [] });
          case "ListEmailIdentitiesCommand":
            return Promise.resolve({ EmailIdentities: [] });
          default:
            return Promise.reject(
              new Error(`Unexpected SES command: ${command._type}`)
            );
        }
      }
    );

    const result = await scanAWSAccountFeatures(
      scanTestAccount.id,
      testOrganization.id
    );

    // Should not throw — access denied is silently skipped
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.features.email?.configSetName).toBeUndefined();
    }

    const row = await db.query.awsAccount.findFirst({
      where: (a, { eq }) => eq(a.id, scanTestAccount.id),
    });
    expect(row?.emailEnabled).toBe(false);
  });

  it("sets emailEnabled=true from verified identities even when the config set list is unavailable", async () => {
    const accessDenied = Object.assign(new Error("AccessDeniedException"), {
      name: "AccessDeniedException",
    });

    mockSend.mockImplementation(
      (command: { _type: string; EmailIdentity?: string }) => {
        // Config-set discovery is denied — canonical configSetName stays undefined
        if (
          command._type === "ListConfigurationSetsCommand" ||
          command._type === "GetConfigurationSetCommand" ||
          command._type === "GetConfigurationSetEventDestinationsCommand"
        ) {
          return Promise.reject(accessDenied);
        }
        if (command._type === "ListEmailIdentitiesCommand") {
          return Promise.resolve({
            EmailIdentities: [
              {
                IdentityName: "verified.com",
                IdentityType: "DOMAIN",
                SendingEnabled: true,
              },
            ],
          });
        }
        if (command._type === "GetEmailIdentityCommand") {
          return Promise.resolve({
            IdentityType: "DOMAIN",
            VerifiedForSendingStatus: true,
            ConfigurationSetName: "wraps-email-verified-com",
          });
        }
        switch (command._type) {
          case "GetAccountCommand":
            return Promise.resolve({ ProductionAccessEnabled: true });
          case "GetDedicatedIpsCommand":
            return Promise.resolve({ DedicatedIps: [] });
          default:
            return Promise.reject(
              new Error(`Unexpected SES command: ${command._type}`)
            );
        }
      }
    );

    const result = await scanAWSAccountFeatures(
      scanTestAccount.id,
      testOrganization.id
    );

    expect(result.success).toBe(true);
    if (result.success) {
      // No canonical config set was discovered...
      expect(result.features.email?.configSetName).toBeUndefined();
      // ...but a verified Wraps identity was found, carrying the SES-confirmed
      // config set the send path resolves by lookup (never derives).
      expect(result.features.email?.identities).toHaveLength(1);
      expect(result.features.email?.identities?.[0]).toMatchObject({
        identity: "verified.com",
        type: "DOMAIN",
        configSetName: "wraps-email-verified-com",
      });
    }

    const row = await db.query.awsAccount.findFirst({
      where: (a, { eq }) => eq(a.id, scanTestAccount.id),
    });
    expect(row?.emailEnabled).toBe(true);
  });

  it("warns when ListConfigurationSets is denied instead of failing silently", async () => {
    // No role template granted ses:ListConfigurationSets, so this call was
    // denied for every customer — and the catch suppressed AccessDeniedException
    // specifically, so nothing was ever logged. The dashboard just reported
    // event tracking as disabled. A denial here now means a stale role, which
    // is exactly the signal needed to tell customers to run `update-role`.
    const accessDenied = Object.assign(new Error("AccessDeniedException"), {
      name: "AccessDeniedException",
    });

    mockSend.mockImplementation((command: { _type: string }) => {
      if (command._type === "ListConfigurationSetsCommand") {
        return Promise.reject(accessDenied);
      }
      switch (command._type) {
        case "GetAccountCommand":
          return Promise.resolve({ ProductionAccessEnabled: true });
        case "GetDedicatedIpsCommand":
          return Promise.resolve({ DedicatedIps: [] });
        case "ListEmailIdentitiesCommand":
          return Promise.resolve({ EmailIdentities: [] });
        default:
          return Promise.reject(
            new Error(`Unexpected SES command: ${command._type}`)
          );
      }
    });

    await scanAWSAccountFeatures(scanTestAccount.id, testOrganization.id);

    const configSetWarnings = mockLogWarn.mock.calls.filter((call) =>
      String(call[1]).includes("config set")
    );
    expect(configSetWarnings).toHaveLength(1);

    // The message must name the missing permission and the repair command —
    // a bare "error listing config sets" does not tell an operator what to do.
    const [context, message] = configSetWarnings[0];
    expect(message).toContain("ses:ListConfigurationSets");
    expect(message).toContain("update-role");
    expect(context).toMatchObject({
      err: expect.objectContaining({ name: "AccessDeniedException" }),
    });
  });

  it("still warns when ListConfigurationSets fails for a non-permission reason", async () => {
    const throttled = Object.assign(new Error("TooManyRequestsException"), {
      name: "TooManyRequestsException",
    });

    mockSend.mockImplementation((command: { _type: string }) => {
      if (command._type === "ListConfigurationSetsCommand") {
        return Promise.reject(throttled);
      }
      switch (command._type) {
        case "GetAccountCommand":
          return Promise.resolve({ ProductionAccessEnabled: true });
        case "GetDedicatedIpsCommand":
          return Promise.resolve({ DedicatedIps: [] });
        case "ListEmailIdentitiesCommand":
          return Promise.resolve({ EmailIdentities: [] });
        default:
          return Promise.reject(
            new Error(`Unexpected SES command: ${command._type}`)
          );
      }
    });

    await scanAWSAccountFeatures(scanTestAccount.id, testOrganization.id);

    const configSetWarnings = mockLogWarn.mock.calls.filter((call) =>
      String(call[1]).includes("config set")
    );
    expect(configSetWarnings).toHaveLength(1);
    // A throttle is not a stale role — it must not claim a missing permission.
    expect(configSetWarnings[0][1]).not.toContain("ses:ListConfigurationSets");
  });
});
