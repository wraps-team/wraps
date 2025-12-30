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
import {
  deleteAWSAccount,
  getVerifiedDomains,
  listAWSAccounts,
  removeWebhookSecretAction,
  saveWebhookSecretAction,
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

vi.mock("@aws-sdk/client-sesv2", () => {
  return {
    SESv2Client: class {
      send = (command: { _type: string; EmailIdentity?: string }) => mockSend(command);
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
      expect(result.error).toContain("Only owners and admins");
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
      validWebhookSecret
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("must be logged in");
    }
  });

  it("should return error when account does not exist", async () => {
    const result = await saveWebhookSecretAction(
      "non-existent-account",
      validWebhookSecret
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
      validWebhookSecret
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("don't have permission");
    }
  });

  it("should return error for invalid webhook secret format", async () => {
    const result = await saveWebhookSecretAction(
      testAwsAccount.id,
      "invalid-secret"
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Invalid webhook secret format");
    }
  });

  it("should return error for webhook secret that is too short", async () => {
    const result = await saveWebhookSecretAction(
      testAwsAccount.id,
      "abc123" // Too short
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Invalid webhook secret format");
    }
  });

  it("should successfully save a valid webhook secret", async () => {
    const result = await saveWebhookSecretAction(
      testAwsAccount.id,
      validWebhookSecret
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

    const result = await removeWebhookSecretAction(testAwsAccount2.id);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("must be logged in");
    }
  });

  it("should return error when account does not exist", async () => {
    const result = await removeWebhookSecretAction("non-existent-account");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("AWS account not found");
    }
  });

  it("should return error when user is a regular member", async () => {
    currentMockUserId = testMemberUser.id;

    const result = await removeWebhookSecretAction(testAwsAccount2.id);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("don't have permission");
    }
  });

  it("should successfully remove webhook secret as owner", async () => {
    const result = await removeWebhookSecretAction(testAwsAccount2.id);

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

    const result = await removeWebhookSecretAction(testAwsAccount2.id);

    expect(result.success).toBe(true);
  });
});
