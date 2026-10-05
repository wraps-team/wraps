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
  (_path: string, options?: { params?: { query?: { search?: string } } }) =>
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

const mockTrack = vi.fn(() =>
  Promise.resolve({
    success: true,
    contactCreated: false,
    workflowsTriggered: 0,
    executionsResumed: 0,
  })
);

vi.mock("@wraps.dev/client", () => ({
  createPlatformClient: vi.fn(() => ({
    GET: mockGet,
    POST: mockPost,
    PATCH: mockPatch,
    track: mockTrack,
  })),
}));

// Mock database — return count=1 so activation events fire.
// Typed as unknown[] since different queries return different shapes
// (count queries return { count }, feature queries return { features }).
const mockDbWhere = vi.fn(
  (): Promise<unknown[]> => Promise.resolve([{ count: 1 }])
);
const mockDbInsertOnConflict = vi.fn(() => Promise.resolve());
// Drives the atomic first-email claim: non-empty array = this caller won.
// Defaults to "won" so first-email tests fire; override per-test to simulate
// an already-tracked org.
const mockClaimResult = vi.fn((): unknown[] => [{ organizationId: "org" }]);
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
        // Supports updateActivationScore (awaited, no returning) AND
        // claimFirstEmailTracked (.returning() decides who won the claim).
        onConflictDoUpdate: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve(mockClaimResult())),
          then: (
            resolve: (value: unknown) => unknown,
            reject?: (reason: unknown) => unknown
          ) => mockDbInsertOnConflict().then(resolve, reject),
        })),
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
  batchSend: { organizationId: "organizationId", status: "status" },
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
  ne: vi.fn(),
  isNull: vi.fn(),
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
    let trackResolved = false;
    mockTrack.mockImplementation(
      () =>
        new Promise((resolve) => {
          // Simulate a short async delay like a real HTTP call
          setTimeout(() => {
            trackResolved = true;
            resolve({
              success: true,
              contactCreated: false,
              workflowsTriggered: 0,
              executionsResumed: 0,
            });
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
    expect(trackResolved).toBe(true);
  });

  it("trackDomainVerified should await emit() so the HTTP call completes", async () => {
    let trackResolved = false;
    mockTrack.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            trackResolved = true;
            resolve({
              success: true,
              contactCreated: false,
              workflowsTriggered: 0,
              executionsResumed: 0,
            });
          }, 10);
        })
    );

    // Mock first db.select call to return features for countVerifiedDomains
    // (1 domain = first domain), then fall through to default for count queries
    mockDbWhere.mockResolvedValueOnce([
      {
        features: {
          email: {
            identities: [{ type: "DOMAIN", identity: "example.com" }],
          },
        },
      },
    ]);

    await trackDomainVerified("user@example.com", "org-123", {
      domain: "example.com",
    });

    expect(trackResolved).toBe(true);
  });

  it("trackFirstEmailSent should await emit() so the HTTP call completes", async () => {
    let trackResolved = false;
    mockTrack.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            trackResolved = true;
            resolve({
              success: true,
              contactCreated: false,
              workflowsTriggered: 0,
              executionsResumed: 0,
            });
          }, 10);
        })
    );

    await trackFirstEmailSent("user@example.com", "org-123", {
      channel: "email",
      source: "broadcast",
    });

    expect(trackResolved).toBe(true);
  });

  it("trackFirstEmailSent does not emit once the org is already tracked", async () => {
    // Regression: the activation_first_email_sent milestone must fire at most
    // once per org. A lost claim means another path already tracked it.
    mockClaimResult.mockReturnValueOnce([]);

    await trackFirstEmailSent("user@example.com", "org-123", {
      channel: "email",
      source: "broadcast",
    });

    expect(mockTrack).not.toHaveBeenCalledWith(
      "activation.first_email_sent",
      expect.anything()
    );
  });

  it("trackContactCreated should await emit() so the HTTP call completes", async () => {
    let trackResolved = false;
    mockTrack.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            trackResolved = true;
            resolve({
              success: true,
              contactCreated: false,
              workflowsTriggered: 0,
              executionsResumed: 0,
            });
          }, 10);
        })
    );

    await trackContactCreated("user@example.com", "org-123");

    expect(trackResolved).toBe(true);
  });

  it("trackApiKeyCreated should await emit() so the HTTP call completes", async () => {
    let trackResolved = false;
    mockTrack.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            trackResolved = true;
            resolve({
              success: true,
              contactCreated: false,
              workflowsTriggered: 0,
              executionsResumed: 0,
            });
          }, 10);
        })
    );

    await trackApiKeyCreated("user@example.com", "org-123");

    expect(trackResolved).toBe(true);
  });

  it("trackBroadcastCreated should await emit() so the HTTP call completes", async () => {
    let trackResolved = false;
    mockTrack.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            trackResolved = true;
            resolve({
              success: true,
              contactCreated: false,
              workflowsTriggered: 0,
              executionsResumed: 0,
            });
          }, 10);
        })
    );

    await trackBroadcastCreated("user@example.com", "org-123", {
      channel: "email",
      recipientCount: 10,
    });

    expect(trackResolved).toBe(true);
  });

  it("trackTemplateCreated should await emit() so the HTTP call completes", async () => {
    let trackResolved = false;
    mockTrack.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            trackResolved = true;
            resolve({
              success: true,
              contactCreated: false,
              workflowsTriggered: 0,
              executionsResumed: 0,
            });
          }, 10);
        })
    );

    await trackTemplateCreated("user@example.com", "org-123");

    expect(trackResolved).toBe(true);
  });

  it("trackTemplatePublished should await emit() so the HTTP call completes", async () => {
    let trackResolved = false;
    mockTrack.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            trackResolved = true;
            resolve({
              success: true,
              contactCreated: false,
              workflowsTriggered: 0,
              executionsResumed: 0,
            });
          }, 10);
        })
    );

    await trackTemplatePublished("user@example.com", "org-123");

    expect(trackResolved).toBe(true);
  });

  it("trackContactsImported should await emit() so the HTTP call completes", async () => {
    let trackResolved = false;
    mockTrack.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            trackResolved = true;
            resolve({
              success: true,
              contactCreated: false,
              workflowsTriggered: 0,
              executionsResumed: 0,
            });
          }, 10);
        })
    );

    await trackContactsImported("user@example.com", "org-123", { count: 50 });

    expect(trackResolved).toBe(true);
  });

  it("trackWorkflowCreated should await emit() so the HTTP call completes", async () => {
    let trackResolved = false;
    mockTrack.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            trackResolved = true;
            resolve({
              success: true,
              contactCreated: false,
              workflowsTriggered: 0,
              executionsResumed: 0,
            });
          }, 10);
        })
    );

    await trackWorkflowCreated("user@example.com", "org-123");

    expect(trackResolved).toBe(true);
  });

  it("emit() should be called with correct event name and contact email", async () => {
    await trackAwsConnected("user@example.com", "org-123", {
      region: "us-east-1",
      accountId: "123456789012",
    });

    // Should be called for both the regular event AND the activation event (count === 1)
    expect(mockTrack).toHaveBeenCalledWith("aws_account.connected", {
      contactEmail: "user@example.com",
      properties: expect.objectContaining({
        organization_id: "org-123",
      }),
    });

    expect(mockTrack).toHaveBeenCalledWith("activation.aws_connected", {
      contactEmail: "user@example.com",
      properties: expect.objectContaining({
        organization_id: "org-123",
      }),
    });
  });

  // ─── trackTeammateInvited ─────────────────────────────────────────────────

  it("trackTeammateInvited should await emit() so the HTTP call completes", async () => {
    let trackResolved = false;
    mockTrack.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            trackResolved = true;
            resolve({
              success: true,
              contactCreated: false,
              workflowsTriggered: 0,
              executionsResumed: 0,
            });
          }, 10);
        })
    );

    await trackTeammateInvited("user@example.com", "org-123", {
      invitedEmail: "colleague@example.com",
      role: "member",
    });

    expect(trackResolved).toBe(true);
  });

  it("trackTeammateInvited should emit activation event on first invitation", async () => {
    await trackTeammateInvited("user@example.com", "org-123", {
      invitedEmail: "colleague@example.com",
      role: "member",
    });

    expect(mockTrack).toHaveBeenCalledWith("teammate.invited", {
      contactEmail: "user@example.com",
      properties: expect.objectContaining({
        organization_id: "org-123",
        invited_email: "colleague@example.com",
      }),
    });

    expect(mockTrack).toHaveBeenCalledWith("activation.teammate_invited", {
      contactEmail: "user@example.com",
      properties: expect.objectContaining({
        organization_id: "org-123",
      }),
    });
  });

  // ─── trackOnboardingPathChosen ────────────────────────────────────────────

  it("trackOnboardingPathChosen should emit event with path", async () => {
    await trackOnboardingPathChosen("user@example.com", "org-123", {
      path: "start_building",
    });

    expect(mockTrack).toHaveBeenCalledWith("onboarding.path_chosen", {
      contactEmail: "user@example.com",
      properties: expect.objectContaining({
        organization_id: "org-123",
        path: "start_building",
      }),
    });
  });

  // ─── trackOnboardingCompleted ────────────────────────────────────────────

  it("trackOnboardingCompleted should PATCH contact properties BEFORE emitting event", async () => {
    const callOrder: string[] = [];
    mockPatch.mockImplementation(() => {
      callOrder.push("PATCH");
      return Promise.resolve({ data: { success: true }, error: null });
    });
    mockTrack.mockImplementation(() => {
      callOrder.push("track");
      return Promise.resolve({
        success: true,
        contactCreated: false,
        workflowsTriggered: 0,
        executionsResumed: 0,
      });
    });

    await trackOnboardingCompleted("user@example.com", "org-123", {
      path: "start_building",
    });

    // PATCH must happen before track so the workflow engine can read the path
    // when it evaluates the gate condition on the onboarding.completed event
    expect(callOrder.indexOf("PATCH")).toBeLessThan(callOrder.indexOf("track"));

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
    expect(mockTrack).toHaveBeenCalledWith("onboarding.completed", {
      contactEmail: "user@example.com",
      createIfMissing: true,
      properties: expect.objectContaining({
        organization_id: "org-123",
        path: "start_building",
      }),
    });
  });

  it("trackOnboardingCompleted should work without path (backward compat)", async () => {
    await trackOnboardingCompleted("user@example.com", "org-123");

    expect(mockTrack).toHaveBeenCalledWith("onboarding.completed", {
      contactEmail: "user@example.com",
      createIfMissing: true,
      properties: {
        organization_id: "org-123",
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

  it("trackAwsConnected should still PATCH hasConnectedAws on a later AWS account", async () => {
    // The first account may have come through a path that never tracked it,
    // so every connect sets the flag, not just the first.
    mockPatch.mockResolvedValue({ data: { success: true }, error: null });
    mockDbWhere.mockResolvedValueOnce([{ count: 2 }]);

    await trackAwsConnected("user@example.com", "org-123", {
      region: "us-east-1",
      accountId: "123456789012",
    });

    expect(mockPatch).toHaveBeenCalledWith(
      "/v1/contacts/{id}",
      expect.objectContaining({
        body: {
          properties: expect.objectContaining({ hasConnectedAws: true }),
        },
      })
    );
  });

  it("trackDomainVerified should PATCH hasDomainVerified on first domain", async () => {
    mockPatch.mockResolvedValue({ data: { success: true }, error: null });

    // Mock countVerifiedDomains: 1 domain = first domain
    mockDbWhere.mockResolvedValueOnce([
      {
        features: {
          email: {
            identities: [{ type: "DOMAIN", identity: "example.com" }],
          },
        },
      },
    ]);

    await trackDomainVerified("user@example.com", "org-123", {
      domain: "example.com",
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

  it("trackDomainVerified should NOT emit activation event on second domain", async () => {
    mockPatch.mockResolvedValue({ data: { success: true }, error: null });

    // Mock countVerifiedDomains: 2 domains = not first
    mockDbWhere.mockResolvedValueOnce([
      {
        features: {
          email: {
            identities: [
              { type: "DOMAIN", identity: "example.com" },
              { type: "DOMAIN", identity: "mail.example.com" },
            ],
          },
        },
      },
    ]);

    await trackDomainVerified("user@example.com", "org-123", {
      domain: "mail.example.com",
    });

    // Should emit domain.verified but NOT activation.domain_verified
    expect(mockTrack).toHaveBeenCalledWith("domain.verified", {
      contactEmail: "user@example.com",
      properties: expect.objectContaining({
        organization_id: "org-123",
        domain: "mail.example.com",
      }),
    });
    expect(mockTrack).not.toHaveBeenCalledWith(
      "activation.domain_verified",
      expect.anything()
    );
  });

  it("trackFirstEmailSent should PATCH hasSentEmail on first email", async () => {
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
    mockPatch.mockResolvedValue({ data: { success: true }, error: null });

    await trackWorkflowCreated("user@example.com", "org-123");

    expect(mockTrack).toHaveBeenCalledWith("activation.first_automation", {
      contactEmail: "user@example.com",
      properties: expect.objectContaining({
        organization_id: "org-123",
      }),
    });
  });

  it("trackWorkflowCreated should PATCH hasCreatedWorkflow", async () => {
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

describe("activation-tracking: template variable props on first-milestone events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRAPS_API_KEY = "test-wraps-api-key";
    mockDbWhere.mockResolvedValue([{ count: 1 }]);
  });

  it("activation.first_contact includes contactName from first/last name", async () => {
    await trackContactCreated(
      "user@example.com",
      "org-123",
      {},
      { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com" }
    );

    expect(mockTrack).toHaveBeenCalledWith("activation.first_contact", {
      contactEmail: "user@example.com",
      properties: expect.objectContaining({
        organization_id: "org-123",
        contactName: "Ada Lovelace",
      }),
    });
  });

  it("activation.first_contact falls back to email local-part for contactName", async () => {
    await trackContactCreated(
      "user@example.com",
      "org-123",
      {},
      { email: "ada.l@example.com" }
    );

    expect(mockTrack).toHaveBeenCalledWith("activation.first_contact", {
      contactEmail: "user@example.com",
      properties: expect.objectContaining({ contactName: "ada.l" }),
    });
  });

  it("activation.first_contact omits contactName when no contact info given", async () => {
    await trackContactCreated("user@example.com", "org-123");

    const call = mockTrack.mock.calls.find(
      ([event]: unknown[]) => event === "activation.first_contact"
    ) as unknown as [string, { properties: Record<string, unknown> }];
    expect(call).toBeDefined();
    expect(call[1].properties.contactName).toBeUndefined();
  });

  it("activation.first_contact from imports includes contactName from first imported contact", async () => {
    await trackContactsImported("user@example.com", "org-123", {
      count: 5,
      firstContact: { email: "first.import@example.com" },
    });

    expect(mockTrack).toHaveBeenCalledWith("activation.first_contact", {
      contactEmail: "user@example.com",
      properties: expect.objectContaining({ contactName: "first.import" }),
    });
  });

  it("activation.first_automation includes workflowName", async () => {
    await trackWorkflowCreated("user@example.com", "org-123", {
      workflowName: "Welcome Sequence",
    });

    expect(mockTrack).toHaveBeenCalledWith("activation.first_automation", {
      contactEmail: "user@example.com",
      properties: expect.objectContaining({
        organization_id: "org-123",
        workflowName: "Welcome Sequence",
      }),
    });
  });

  it("activation.first_template includes templateName", async () => {
    await trackTemplateCreated("user@example.com", "org-123", {
      templateName: "Welcome Email",
    });

    expect(mockTrack).toHaveBeenCalledWith("activation.first_template", {
      contactEmail: "user@example.com",
      properties: expect.objectContaining({
        organization_id: "org-123",
        templateName: "Welcome Email",
      }),
    });
  });

  it("template.published includes templateName", async () => {
    await trackTemplatePublished("user@example.com", "org-123", {
      templateName: "Welcome Email",
    });

    expect(mockTrack).toHaveBeenCalledWith("template.published", {
      contactEmail: "user@example.com",
      properties: expect.objectContaining({
        organization_id: "org-123",
        templateName: "Welcome Email",
      }),
    });
  });

  it("activation.first_broadcast includes stringified recipientCount and templateName", async () => {
    // First db call: countBatchSends → 1, second: template name lookup
    mockDbWhere
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce([{ name: "Product Launch" }]);

    await trackBroadcastCreated("user@example.com", "org-123", {
      channel: "email",
      recipientCount: 1240,
      templateId: "tpl-1",
    });

    expect(mockTrack).toHaveBeenCalledWith("activation.first_broadcast", {
      contactEmail: "user@example.com",
      properties: expect.objectContaining({
        organization_id: "org-123",
        channel: "email",
        recipientCount: "1240",
        templateName: "Product Launch",
      }),
    });
  });

  it("activation.first_broadcast omits templateName when no templateId given", async () => {
    await trackBroadcastCreated("user@example.com", "org-123", {
      channel: "email",
      recipientCount: 10,
    });

    const call = mockTrack.mock.calls.find(
      ([event]: unknown[]) => event === "activation.first_broadcast"
    ) as unknown as [string, { properties: Record<string, unknown> }];
    expect(call).toBeDefined();
    expect(call[1].properties.recipientCount).toBe("10");
    expect(call[1].properties.templateName).toBeUndefined();
  });
});
