import { awsAccount, db } from "@wraps/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testOrganization, testUser, testUserNoAccess } from "./setup";

// Mock next/headers
vi.mock("next/headers", () => ({
  headers: () => new Headers(),
}));

// Mock Better-Auth session
const mockSession = (userId: string | null): any => ({
  user: userId
    ? { id: userId, email: "test@example.com", name: "Test" }
    : undefined,
  session: userId
    ? {
        id: "session-123",
        createdAt: new Date(),
        updatedAt: new Date(),
        userId,
        expiresAt: new Date(Date.now() + 86_400_000), // 24 hours from now
        token: "test-token",
      }
    : undefined,
});

// Mock AWS STS Client
const mockAssumeRole = vi.fn();
vi.mock("@aws-sdk/client-sts", () => ({
  // biome-ignore lint/complexity/useArrowFunction: vi.fn requires function expression for constructors
  STSClient: vi.fn(function () {
    return {
      send: mockAssumeRole,
    };
  }),
  // biome-ignore lint/complexity/useArrowFunction: vi.fn requires function expression for constructors
  AssumeRoleCommand: vi.fn(function (params) {
    return params;
  }),
}));

// Mock the auth module
vi.mock("@wraps/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => mockSession(testUser.id)),
    },
  },
}));

// Mock organization helper
vi.mock("@/lib/organization", () => ({
  getOrganizationWithMembership: vi.fn(async (slug: string, userId: string) => {
    if (slug === testOrganization.slug && userId === testUser.id) {
      return {
        id: testOrganization.id,
        name: testOrganization.name,
        slug: testOrganization.slug,
      };
    }
    return null;
  }),
}));

describe("AWS Validation API - POST /api/[orgSlug]/aws/validate", () => {
  beforeEach(async () => {
    // Clean up any existing test AWS accounts
    await db
      .delete(awsAccount)
      .where(eq(awsAccount.organizationId, testOrganization.id));

    // Reset mocks
    mockAssumeRole.mockReset();
  });

  it("should validate and save valid AWS role connection", async () => {
    // Mock successful role assumption
    mockAssumeRole.mockResolvedValueOnce({
      Credentials: {
        AccessKeyId: "AKIAIOSFODNN7EXAMPLE",
        SecretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        SessionToken: "token",
        Expiration: new Date(),
      },
    });

    const { POST } = await import("../[orgSlug]/aws/validate/route");

    const requestBody = {
      roleArn: "arn:aws:iam::123456789012:role/wraps-console-access",
      externalId: "unique-external-id-123",
    };

    const request = new Request(
      "http://localhost/api/onboarding-test-org/aws/validate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      }
    );

    const context = {
      params: Promise.resolve({ orgSlug: testOrganization.slug }),
    };

    const response = await POST(request, context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.accountId).toBe("123456789012");
    expect(data.roleName).toBe("wraps-console-access");

    // Verify AWS account was saved to database
    const savedAccount = await db.query.awsAccount.findFirst({
      where: eq(awsAccount.externalId, requestBody.externalId),
    });

    expect(savedAccount).toBeTruthy();
    expect(savedAccount?.accountId).toBe("123456789012");
    expect(savedAccount?.roleArn).toBe(requestBody.roleArn);
    expect(savedAccount?.isVerified).toBe(true);
    expect(savedAccount?.organizationId).toBe(testOrganization.id);
  });

  it("should reject invalid role ARN format", async () => {
    const { POST } = await import("../[orgSlug]/aws/validate/route");

    const requestBody = {
      roleArn: "invalid-arn",
      externalId: "external-id",
    };

    const request = new Request(
      "http://localhost/api/onboarding-test-org/aws/validate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      }
    );

    const context = {
      params: Promise.resolve({ orgSlug: testOrganization.slug }),
    };

    const response = await POST(request, context);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid IAM Role ARN format");
  });

  it("should handle AWS access denied errors", async () => {
    // Mock access denied error
    const accessDeniedError = new Error("Access Denied");
    accessDeniedError.name = "AccessDenied";
    mockAssumeRole.mockRejectedValueOnce(accessDeniedError);

    const { POST } = await import("../[orgSlug]/aws/validate/route");

    const requestBody = {
      roleArn: "arn:aws:iam::123456789012:role/wraps-console-access",
      externalId: "wrong-external-id",
    };

    const request = new Request(
      "http://localhost/api/onboarding-test-org/aws/validate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      }
    );

    const context = {
      params: Promise.resolve({ orgSlug: testOrganization.slug }),
    };

    const response = await POST(request, context);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Access denied");
    expect(data.error).toContain("External ID");
  });

  it("should update existing AWS account connection", async () => {
    // Create an existing account first
    const existingAccount = await db
      .insert(awsAccount)
      .values({
        organizationId: testOrganization.id,
        name: "Old Connection",
        accountId: "999999999999",
        region: "us-east-1",
        roleArn: "arn:aws:iam::999999999999:role/old-role",
        externalId: "existing-external-id",
        isVerified: false,
        createdBy: testUser.id,
      })
      .returning();

    // Mock successful role assumption
    mockAssumeRole.mockResolvedValueOnce({
      Credentials: {
        AccessKeyId: "AKIAIOSFODNN7EXAMPLE",
        SecretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        SessionToken: "token",
        Expiration: new Date(),
      },
    });

    const { POST } = await import("../[orgSlug]/aws/validate/route");

    const requestBody = {
      roleArn: "arn:aws:iam::123456789012:role/new-role",
      externalId: existingAccount[0].externalId, // Same external ID
    };

    const request = new Request(
      "http://localhost/api/onboarding-test-org/aws/validate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      }
    );

    const context = {
      params: Promise.resolve({ orgSlug: testOrganization.slug }),
    };

    const response = await POST(request, context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);

    // Verify account was updated, not created
    const accounts = await db
      .select()
      .from(awsAccount)
      .where(eq(awsAccount.externalId, existingAccount[0].externalId));

    expect(accounts.length).toBe(1);
    expect(accounts[0].roleArn).toBe(requestBody.roleArn);
    expect(accounts[0].accountId).toBe("123456789012");
    expect(accounts[0].isVerified).toBe(true);
  });

  it("should return 400 for missing required fields", async () => {
    const { POST } = await import("../[orgSlug]/aws/validate/route");

    const requestBody = {
      roleArn: "arn:aws:iam::123456789012:role/test",
      // Missing externalId
    };

    const request = new Request(
      "http://localhost/api/onboarding-test-org/aws/validate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      }
    );

    const context = {
      params: Promise.resolve({ orgSlug: testOrganization.slug }),
    };

    const response = await POST(request, context);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("required");
  });

  it("should return 401 for unauthenticated requests", async () => {
    const { auth } = await import("@wraps/auth");
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(mockSession(null));

    const { POST } = await import("../[orgSlug]/aws/validate/route");

    const requestBody = {
      roleArn: "arn:aws:iam::123456789012:role/test",
      externalId: "external-id",
    };

    const request = new Request(
      "http://localhost/api/onboarding-test-org/aws/validate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      }
    );

    const context = {
      params: Promise.resolve({ orgSlug: testOrganization.slug }),
    };

    const response = await POST(request, context);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 403 for non-member access", async () => {
    const { auth } = await import("@wraps/auth");
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(
      mockSession(testUserNoAccess.id)
    );

    const { POST } = await import("../[orgSlug]/aws/validate/route");

    const requestBody = {
      roleArn: "arn:aws:iam::123456789012:role/test",
      externalId: "external-id",
    };

    const request = new Request(
      "http://localhost/api/onboarding-test-org/aws/validate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      }
    );

    const context = {
      params: Promise.resolve({ orgSlug: testOrganization.slug }),
    };

    const response = await POST(request, context);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("Forbidden");
  });
});
