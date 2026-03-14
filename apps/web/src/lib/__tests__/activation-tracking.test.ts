import { beforeEach, describe, expect, it, vi } from "vitest";

// Undo the global mock from vitest setup so we can test the real module
vi.unmock("@/lib/activation-tracking");

// ─── Mocks ──────────────────────────────────────────────────────────────────

// Mock PostHog (not the focus of this test)
vi.mock("../posthog-server", () => ({
  getPostHogClient: vi.fn(() => ({
    capture: vi.fn(),
    flush: vi.fn(),
    shutdown: vi.fn(),
  })),
}));

// Track whether POST/PATCH/GET were called and completed
const mockPost = vi.fn(() =>
  Promise.resolve({ data: { success: true }, error: null })
);
const mockPatch = vi.fn(() =>
  Promise.resolve({ data: { success: true }, error: null })
);
const mockGet = vi.fn(
  (
    _path: string,
    options?: { params?: { query?: { search?: string } } }
  ) =>
    Promise.resolve({
      data: {
        contacts: [
          {
            id: options?.params?.query?.search ?? "user@example.com",
            email: options?.params?.query?.search ?? "user@example.com",
            properties: {},
          },
        ],
      },
      error: null,
    })
);

vi.mock("@wraps.dev/client", () => ({
  createPlatformClient: vi.fn(() => ({
    GET: mockGet,
    POST: mockPost,
    PATCH: mockPatch,
  })),
}));

// Mock database — return count=1 so activation events fire
const mockDbWhere = vi.fn(() => Promise.resolve([{ count: 1 }]));
const mockDbInsertOnConflict = vi.fn(() => Promise.resolve());
const mockFindManyAwsAccounts = vi.fn(() =>
  Promise.resolve([
    {
      isVerified: true,
      features: {
        email: {
          identities: [{ type: "DOMAIN", identity: "example.com" }],
        },
      },
    },
  ])
);
vi.mock("@wraps/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: mockDbWhere,
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoUpdate: mockDbInsertOnConflict,
      })),
    })),
    query: {
      awsAccount: {
        findMany: () => mockFindManyAwsAccounts(),
      },
    },
  },
  awsAccount: { organizationId: "organizationId", isVerified: "isVerified" },
  contact: { organizationId: "organizationId" },
  template: { organizationId: "organizationId" },
  batchSend: { organizationId: "organizationId" },
  apiKey: { organizationId: "organizationId" },
  messageSend: { organizationId: "organizationId", status: "status" },
  invitation: { organizationId: "organizationId", status: "status" },
  workflow: { organizationId: "organizationId" },
  organizationExtension: { organizationId: "organizationId" },
}));

// Mock setup-status for computeActivationScore
const mockGetSetupStatus = vi.fn((_orgId: string) =>
  Promise.resolve({
    setupStatus: {
      hasAwsAccount: true,
      hasVerifiedDomain: true,
      hasSentEmail: false,
      hasTemplate: true,
      hasBroadcast: false,
      hasWorkflow: false,
      hasPlatformConnection: false,
      verifiedDomains: [],
      awsRegion: null,
      emailCount: 0,
      sandboxStatus: null,
      awsAccountId: null,
      domainCount: 0,
    },
    awsAccount: null,
  })
);
vi.mock("../setup-status", () => ({
  getSetupStatus: (orgId: string) => mockGetSetupStatus(orgId),
}));

vi.mock("drizzle-orm", () => ({
  count: vi.fn(),
  eq: vi.fn(),
  and: vi.fn(),
}));

// Import AFTER mocks
import {
  computeActivationScore,
  trackApiKeyCreated,
  trackAwsConnected,
  trackBroadcastCreated,
  trackContactCreated,
  trackContactsImported,
  trackDomainVerified,
  trackFirstEmailSent,
  trackOnboardingCompleted,
  trackOnboardingPathChosen,
  trackTeammateInvited,
  trackTemplateCreated,
  trackTemplatePublished,
  trackWorkflowCreated,
} from "../activation-tracking";

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("activation-tracking: emit() calls to Wraps platform", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRAPS_API_KEY = "test-wraps-api-key";
  });

  it("trackAwsConnected should await emit() so the HTTP call completes", async () => {
    // Track whether the POST promise was fully resolved before trackAwsConnected returns
    let postResolved = false;
    mockPost.mockImplementation(
      () =>
        new Promise((resolve) => {
          // Simulate a short async delay like a real HTTP call
          setTimeout(() => {
            postResolved = true;
            resolve({ data: { success: true }, error: null });
          }, 10);
        })
    );

    await trackAwsConnected("user@example.com", "org-123", {
      region: "us-east-1",
      accountId: "123456789012",
    });

    // BUG: emit() is not awaited inside trackAwsConnected, so the POST
    // promise is still pending when trackAwsConnected resolves.
    // This means the HTTP call to Wraps never completes in serverless
    // environments (Next.js server actions, Lambda, etc.)
    expect(postResolved).toBe(true);
  });

  it("trackDomainVerified should await emit() so the HTTP call completes", async () => {
    let postResolved = false;
    mockPost.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            postResolved = true;
            resolve({ data: { success: true }, error: null });
          }, 10);
        })
    );

    await trackDomainVerified("user@example.com", "org-123", {
      domain: "example.com",
      isFirstDomain: true,
    });

    expect(postResolved).toBe(true);
  });

  it("trackFirstEmailSent should await emit() so the HTTP call completes", async () => {
    let postResolved = false;
    mockPost.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            postResolved = true;
            resolve({ data: { success: true }, error: null });
          }, 10);
        })
    );

    await trackFirstEmailSent("user@example.com", "org-123", {
      channel: "email",
      source: "broadcast",
    });

    expect(postResolved).toBe(true);
  });

  it("trackContactCreated should await emit() so the HTTP call completes", async () => {
    let postResolved = false;
    mockPost.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            postResolved = true;
            resolve({ data: { success: true }, error: null });
          }, 10);
        })
    );

    await trackContactCreated("user@example.com", "org-123");

    expect(postResolved).toBe(true);
  });

  it("trackApiKeyCreated should await emit() so the HTTP call completes", async () => {
    let postResolved = false;
    mockPost.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            postResolved = true;
            resolve({ data: { success: true }, error: null });
          }, 10);
        })
    );

    await trackApiKeyCreated("user@example.com", "org-123");

    expect(postResolved).toBe(true);
  });

  it("trackBroadcastCreated should await emit() so the HTTP call completes", async () => {
    let postResolved = false;
    mockPost.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            postResolved = true;
            resolve({ data: { success: true }, error: null });
          }, 10);
        })
    );

    await trackBroadcastCreated("user@example.com", "org-123", {
      channel: "email",
      recipientCount: 10,
    });

    expect(postResolved).toBe(true);
  });

  it("trackTemplateCreated should await emit() so the HTTP call completes", async () => {
    let postResolved = false;
    mockPost.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            postResolved = true;
            resolve({ data: { success: true }, error: null });
          }, 10);
        })
    );

    await trackTemplateCreated("user@example.com", "org-123");

    expect(postResolved).toBe(true);
  });

  it("trackTemplatePublished should await emit() so the HTTP call completes", async () => {
    let postResolved = false;
    mockPost.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            postResolved = true;
            resolve({ data: { success: true }, error: null });
          }, 10);
        })
    );

    await trackTemplatePublished("user@example.com", "org-123");

    expect(postResolved).toBe(true);
  });

  it("trackContactsImported should await emit() so the HTTP call completes", async () => {
    let postResolved = false;
    mockPost.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            postResolved = true;
            resolve({ data: { success: true }, error: null });
          }, 10);
        })
    );

    await trackContactsImported("user@example.com", "org-123", { count: 50 });

    expect(postResolved).toBe(true);
  });

  it("trackWorkflowCreated should await emit() so the HTTP call completes", async () => {
    let postResolved = false;
    mockPost.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            postResolved = true;
            resolve({ data: { success: true }, error: null });
          }, 10);
        })
    );

    await trackWorkflowCreated("user@example.com", "org-123");

    expect(postResolved).toBe(true);
  });

  it("emit() should be called with correct event name and contact email", async () => {
    mockPost.mockResolvedValue({ data: { success: true }, error: null });

    await trackAwsConnected("user@example.com", "org-123", {
      region: "us-east-1",
      accountId: "123456789012",
    });

    // Should be called for both the regular event AND the activation event (count === 1)
    expect(mockPost).toHaveBeenCalledWith("/v1/events/", {
      body: {
        name: "aws_account.connected",
        contactEmail: "user@example.com",
        properties: expect.objectContaining({
          organization_id: "org-123",
        }),
      },
    });

    expect(mockPost).toHaveBeenCalledWith("/v1/events/", {
      body: {
        name: "activation.aws_connected",
        contactEmail: "user@example.com",
        properties: expect.objectContaining({
          organization_id: "org-123",
        }),
      },
    });
  });

  // ─── trackTeammateInvited ─────────────────────────────────────────────────

  it("trackTeammateInvited should await emit() so the HTTP call completes", async () => {
    let postResolved = false;
    mockPost.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            postResolved = true;
            resolve({ data: { success: true }, error: null });
          }, 10);
        })
    );

    await trackTeammateInvited("user@example.com", "org-123", {
      invitedEmail: "colleague@example.com",
      role: "member",
    });

    expect(postResolved).toBe(true);
  });

  it("trackTeammateInvited should emit activation event on first invitation", async () => {
    mockPost.mockResolvedValue({ data: { success: true }, error: null });

    await trackTeammateInvited("user@example.com", "org-123", {
      invitedEmail: "colleague@example.com",
      role: "member",
    });

    expect(mockPost).toHaveBeenCalledWith("/v1/events/", {
      body: {
        name: "teammate.invited",
        contactEmail: "user@example.com",
        properties: expect.objectContaining({
          organization_id: "org-123",
          invited_email: "colleague@example.com",
        }),
      },
    });

    expect(mockPost).toHaveBeenCalledWith("/v1/events/", {
      body: {
        name: "activation.teammate_invited",
        contactEmail: "user@example.com",
        properties: expect.objectContaining({
          organization_id: "org-123",
        }),
      },
    });
  });

  // ─── trackOnboardingPathChosen ────────────────────────────────────────────

  it("trackOnboardingPathChosen should emit event with path", async () => {
    mockPost.mockResolvedValue({ data: { success: true }, error: null });

    await trackOnboardingPathChosen("user@example.com", "org-123", {
      path: "start_building",
    });

    expect(mockPost).toHaveBeenCalledWith("/v1/events/", {
      body: {
        name: "onboarding.path_chosen",
        contactEmail: "user@example.com",
        properties: expect.objectContaining({
          organization_id: "org-123",
          path: "start_building",
        }),
      },
    });
  });

  // ─── trackOnboardingCompleted ────────────────────────────────────────────

  it("trackOnboardingCompleted should PATCH contact properties BEFORE emitting event", async () => {
    const callOrder: string[] = [];
    mockPatch.mockImplementation(() => {
      callOrder.push("PATCH");
      return Promise.resolve({ data: { success: true }, error: null });
    });
    mockPost.mockImplementation(() => {
      callOrder.push("POST");
      return Promise.resolve({ data: { success: true }, error: null });
    });

    await trackOnboardingCompleted("user@example.com", "org-123", {
      path: "start_building",
    });

    // PATCH must happen before POST so the workflow engine can read the path
    // when it evaluates the gate condition on the onboarding.completed event
    expect(callOrder.indexOf("PATCH")).toBeLessThan(callOrder.indexOf("POST"));

    // Should PATCH contact to store onboarding path in properties
    expect(mockPatch).toHaveBeenCalledWith(
      "/v1/contacts/{id}",
      expect.objectContaining({
        params: expect.objectContaining({
          path: expect.objectContaining({ id: "user@example.com" }),
        }),
        body: expect.objectContaining({
          properties: expect.objectContaining({
            onboardingPath: "start_building",
          }),
        }),
      })
    );

    // Should emit onboarding.completed event with path in properties
    expect(mockPost).toHaveBeenCalledWith("/v1/events/", {
      body: {
        name: "onboarding.completed",
        contactEmail: "user@example.com",
        createIfMissing: true,
        properties: expect.objectContaining({
          organization_id: "org-123",
          path: "start_building",
        }),
      },
    });
  });

  it("trackOnboardingCompleted should work without path (backward compat)", async () => {
    mockPost.mockResolvedValue({ data: { success: true }, error: null });

    await trackOnboardingCompleted("user@example.com", "org-123");

    expect(mockPost).toHaveBeenCalledWith("/v1/events/", {
      body: {
        name: "onboarding.completed",
        contactEmail: "user@example.com",
        createIfMissing: true,
        properties: {
          organization_id: "org-123",
        },
      },
    });

    // Should NOT patch contact when no path provided
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("trackOnboardingCompleted should resolve contact by email and PATCH using contact id", async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        contacts: [
          {
            id: "contact-123",
            email: "user@example.com",
            properties: { existingFlag: true },
          },
        ],
      },
      error: null,
    });
    mockPatch.mockResolvedValue({ data: { success: true }, error: null });
    mockPost.mockResolvedValue({ data: { success: true }, error: null });

    await trackOnboardingCompleted("user@example.com", "org-123", {
      path: "start_building",
    });

    expect(mockPatch).toHaveBeenCalledWith(
      "/v1/contacts/{id}",
      expect.objectContaining({
        params: { path: { id: "contact-123" } },
        body: {
          properties: expect.objectContaining({
            existingFlag: true,
            onboardingPath: "start_building",
          }),
        },
      })
    );
  });

  it("trackOnboardingCompleted should create contact when email is missing", async () => {
    mockGet.mockResolvedValueOnce({
      data: { contacts: [] },
      error: null,
    });
    mockPost.mockResolvedValue({ data: { success: true }, error: null });

    await trackOnboardingCompleted("user@example.com", "org-123", {
      path: "start_building",
    });

    expect(mockPost).toHaveBeenCalledWith("/v1/contacts/", {
      body: {
        email: "user@example.com",
        emailStatus: "active",
        properties: { onboardingPath: "start_building" },
      },
    });
  });

  // ─── Contact property hydration ──────────────────────────────────────────

  it("trackAwsConnected should PATCH hasConnectedAws on first AWS account", async () => {
    mockPost.mockResolvedValue({ data: { success: true }, error: null });
    mockPatch.mockResolvedValue({ data: { success: true }, error: null });

    await trackAwsConnected("user@example.com", "org-123", {
      region: "us-east-1",
      accountId: "123456789012",
    });

    expect(mockPatch).toHaveBeenCalledWith(
      "/v1/contacts/{id}",
      expect.objectContaining({
        params: { path: { id: "user@example.com" } },
        body: {
          properties: expect.objectContaining({ hasConnectedAws: true }),
        },
      })
    );
  });

  it("trackDomainVerified should PATCH hasDomainVerified on first domain", async () => {
    mockPost.mockResolvedValue({ data: { success: true }, error: null });
    mockPatch.mockResolvedValue({ data: { success: true }, error: null });

    await trackDomainVerified("user@example.com", "org-123", {
      domain: "example.com",
      isFirstDomain: true,
    });

    expect(mockPatch).toHaveBeenCalledWith(
      "/v1/contacts/{id}",
      expect.objectContaining({
        params: { path: { id: "user@example.com" } },
        body: {
          properties: expect.objectContaining({ hasDomainVerified: true }),
        },
      })
    );
  });

  it("trackFirstEmailSent should PATCH hasSentEmail on first email", async () => {
    mockPost.mockResolvedValue({ data: { success: true }, error: null });
    mockPatch.mockResolvedValue({ data: { success: true }, error: null });

    await trackFirstEmailSent("user@example.com", "org-123", {
      channel: "email",
      source: "broadcast",
    });

    expect(mockPatch).toHaveBeenCalledWith(
      "/v1/contacts/{id}",
      expect.objectContaining({
        params: { path: { id: "user@example.com" } },
        body: { properties: expect.objectContaining({ hasSentEmail: true }) },
      })
    );
  });

  it("trackTemplateCreated should PATCH hasCreatedTemplate on first template", async () => {
    mockPost.mockResolvedValue({ data: { success: true }, error: null });
    mockPatch.mockResolvedValue({ data: { success: true }, error: null });

    await trackTemplateCreated("user@example.com", "org-123");

    expect(mockPatch).toHaveBeenCalledWith(
      "/v1/contacts/{id}",
      expect.objectContaining({
        params: { path: { id: "user@example.com" } },
        body: {
          properties: expect.objectContaining({ hasCreatedTemplate: true }),
        },
      })
    );
  });

  it("trackWorkflowCreated should emit activation_first_automation on first workflow", async () => {
    mockPost.mockResolvedValue({ data: { success: true }, error: null });
    mockPatch.mockResolvedValue({ data: { success: true }, error: null });

    await trackWorkflowCreated("user@example.com", "org-123");

    expect(mockPost).toHaveBeenCalledWith("/v1/events/", {
      body: {
        name: "activation.first_automation",
        contactEmail: "user@example.com",
        properties: expect.objectContaining({
          organization_id: "org-123",
        }),
      },
    });
  });

  it("trackWorkflowCreated should PATCH hasCreatedWorkflow", async () => {
    mockPost.mockResolvedValue({ data: { success: true }, error: null });
    mockPatch.mockResolvedValue({ data: { success: true }, error: null });

    await trackWorkflowCreated("user@example.com", "org-123");

    expect(mockPatch).toHaveBeenCalledWith(
      "/v1/contacts/{id}",
      expect.objectContaining({
        params: { path: { id: "user@example.com" } },
        body: {
          properties: expect.objectContaining({ hasCreatedWorkflow: true }),
        },
      })
    );
  });

  it("trackBroadcastCreated should PATCH hasSentBroadcast on first broadcast", async () => {
    mockPost.mockResolvedValue({ data: { success: true }, error: null });
    mockPatch.mockResolvedValue({ data: { success: true }, error: null });

    await trackBroadcastCreated("user@example.com", "org-123", {
      channel: "email",
      recipientCount: 10,
    });

    expect(mockPatch).toHaveBeenCalledWith(
      "/v1/contacts/{id}",
      expect.objectContaining({
        params: { path: { id: "user@example.com" } },
        body: {
          properties: expect.objectContaining({ hasSentBroadcast: true }),
        },
      })
    );
  });

  it("updateActivationScore should PATCH activationScore on contact", async () => {
    mockPost.mockResolvedValue({ data: { success: true }, error: null });
    mockPatch.mockResolvedValue({ data: { success: true }, error: null });

    // trackAwsConnected calls updateActivationScore internally
    await trackAwsConnected("user@example.com", "org-123", {
      region: "us-east-1",
      accountId: "123456789012",
    });

    // Should have a PATCH call that includes activationScore
    expect(mockPatch).toHaveBeenCalledWith(
      "/v1/contacts/{id}",
      expect.objectContaining({
        params: { path: { id: "user@example.com" } },
        body: { properties: expect.objectContaining({ activationScore: 5 }) },
      })
    );
  });

  // ─── computeActivationScore ───────────────────────────────────────────────

  it("computeActivationScore should return score and milestones from setup status + counts", async () => {
    // Mock: 3 true milestones from setupStatus (hasAwsAccount, hasVerifiedDomain, hasTemplate)
    // Mock: count=1 for contacts and invitations (2 more true milestones)
    // Total expected: 5
    const { score, milestones } = await computeActivationScore("org-123");

    expect(score).toBe(5);
    expect(milestones).toEqual({
      hasTemplate: true,
      hasBroadcast: false,
      hasContact: true,
      hasTeammateInvited: true,
      hasAwsAccount: true,
      hasVerifiedDomain: true,
      hasSentEmail: false,
      hasAutomation: false,
    });
  });
});
