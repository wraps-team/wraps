import { db, organizationExtension } from "@wraps/db";
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

describe("Onboarding API - GET /api/[orgSlug]/onboarding/status", () => {
  beforeEach(async () => {
    // Reset onboarding status before each test
    await db
      .update(organizationExtension)
      .set({
        onboardingCompleted: false,
        onboardingCompletedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(organizationExtension.organizationId, testOrganization.id));
  });

  it("should return onboarding status for authorized user", async () => {
    const { GET } = await import("../[orgSlug]/onboarding/status/route");

    const request = new Request(
      "http://localhost/api/onboarding-test-org/onboarding/status"
    );
    const context = {
      params: Promise.resolve({ orgSlug: testOrganization.slug }),
    };

    const response = await GET(request, context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      completed: false,
      hasAwsAccount: false,
      awsAccountCount: 0,
    });
  });

  it("should return completed status when onboarding is done", async () => {
    // Mark onboarding as completed
    const completedAt = new Date();
    await db
      .update(organizationExtension)
      .set({
        onboardingCompleted: true,
        onboardingCompletedAt: completedAt,
      })
      .where(eq(organizationExtension.organizationId, testOrganization.id));

    const { GET } = await import("../[orgSlug]/onboarding/status/route");

    const request = new Request(
      "http://localhost/api/onboarding-test-org/onboarding/status"
    );
    const context = {
      params: Promise.resolve({ orgSlug: testOrganization.slug }),
    };

    const response = await GET(request, context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.completed).toBe(true);
    expect(data.completedAt).toBeTruthy();
  });

  it("should return 401 for unauthenticated requests", async () => {
    const { auth } = await import("@wraps/auth");
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(mockSession(null));

    const { GET } = await import("../[orgSlug]/onboarding/status/route");

    const request = new Request(
      "http://localhost/api/onboarding-test-org/onboarding/status"
    );
    const context = {
      params: Promise.resolve({ orgSlug: testOrganization.slug }),
    };

    const response = await GET(request, context);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 403 for non-member access", async () => {
    const { auth } = await import("@wraps/auth");
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(
      mockSession(testUserNoAccess.id)
    );

    const { GET } = await import("../[orgSlug]/onboarding/status/route");

    const request = new Request(
      "http://localhost/api/onboarding-test-org/onboarding/status"
    );
    const context = {
      params: Promise.resolve({ orgSlug: testOrganization.slug }),
    };

    const response = await GET(request, context);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("Forbidden");
  });
});

describe("Onboarding API - POST /api/[orgSlug]/onboarding/complete", () => {
  beforeEach(async () => {
    // Reset onboarding status before each test
    await db
      .update(organizationExtension)
      .set({
        onboardingCompleted: false,
        onboardingCompletedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(organizationExtension.organizationId, testOrganization.id));
  });

  it("should mark onboarding as complete", async () => {
    const { POST } = await import("../[orgSlug]/onboarding/complete/route");

    const request = new Request(
      "http://localhost/api/onboarding-test-org/onboarding/complete",
      {
        method: "POST",
      }
    );
    const context = {
      params: Promise.resolve({ orgSlug: testOrganization.slug }),
    };

    const response = await POST(request, context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toBe("Onboarding completed successfully");

    // Verify database was updated
    const extension = await db.query.organizationExtension.findFirst({
      where: eq(organizationExtension.organizationId, testOrganization.id),
    });

    expect(extension?.onboardingCompleted).toBe(true);
    expect(extension?.onboardingCompletedAt).toBeInstanceOf(Date);
  });

  it("should create extension if it doesn't exist", async () => {
    // Delete the extension first
    await db
      .delete(organizationExtension)
      .where(eq(organizationExtension.organizationId, testOrganization.id));

    const { POST } = await import("../[orgSlug]/onboarding/complete/route");

    const request = new Request(
      "http://localhost/api/onboarding-test-org/onboarding/complete",
      {
        method: "POST",
      }
    );
    const context = {
      params: Promise.resolve({ orgSlug: testOrganization.slug }),
    };

    const response = await POST(request, context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);

    // Verify extension was created
    const extension = await db.query.organizationExtension.findFirst({
      where: eq(organizationExtension.organizationId, testOrganization.id),
    });

    expect(extension).toBeTruthy();
    expect(extension?.onboardingCompleted).toBe(true);
  });

  it("should return 401 for unauthenticated requests", async () => {
    const { auth } = await import("@wraps/auth");
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(mockSession(null));

    const { POST } = await import("../[orgSlug]/onboarding/complete/route");

    const request = new Request(
      "http://localhost/api/onboarding-test-org/onboarding/complete",
      {
        method: "POST",
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

    const { POST } = await import("../[orgSlug]/onboarding/complete/route");

    const request = new Request(
      "http://localhost/api/onboarding-test-org/onboarding/complete",
      {
        method: "POST",
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
