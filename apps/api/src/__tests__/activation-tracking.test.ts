import { beforeEach, describe, expect, it, vi } from "vitest";

type MockRow = Record<string, unknown>;

const {
  mockCapture,
  mockGroupIdentify,
  mockPlatformPost,
  mockSelectResults,
  mockInsertResults,
} = vi.hoisted(() => ({
  mockCapture: vi.fn(),
  mockGroupIdentify: vi.fn(),
  mockPlatformPost: vi.fn(),
  mockSelectResults: [] as MockRow[][],
  mockInsertResults: [] as MockRow[][],
}));

vi.mock("@wraps/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => {
          const result = mockSelectResults.shift() ?? [];

          return {
            limit: vi.fn(() => Promise.resolve(result)),
            then(
              resolve: (value: MockRow[]) => unknown,
              reject?: (reason: unknown) => unknown
            ) {
              return Promise.resolve(result).then(resolve, reject);
            },
          };
        }),
      })),
    })),
    // Atomic claim used by trackFirstEmailSent / trackFirstEmailDelivered.
    // The returned array's length decides whether this caller won the claim.
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoUpdate: vi.fn(() => ({
          returning: vi.fn(() =>
            Promise.resolve(mockInsertResults.shift() ?? [])
          ),
        })),
      })),
    })),
  },
  messageSend: {
    organizationId: "message_send.organization_id",
    status: "message_send.status",
  },
  organizationExtension: {
    organizationId: "organization_extension.organization_id",
    activationScore: "organization_extension.activation_score",
  },
  template: {
    organizationId: "template.organization_id",
  },
  user: {
    id: "user.id",
    email: "user.email",
  },
  workflow: {
    organizationId: "workflow.organization_id",
  },
  and: vi.fn((...conditions: unknown[]) => conditions),
  count: vi.fn(() => "count"),
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
}));

vi.mock("@wraps.dev/client", () => ({
  createPlatformClient: vi.fn(() => ({
    POST: mockPlatformPost,
  })),
}));

vi.mock("../lib/posthog", () => ({
  getPostHogClient: vi.fn(() => ({
    capture: mockCapture,
    groupIdentify: mockGroupIdentify,
  })),
}));

vi.mock("../lib/logger", () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const {
  trackFirstEmailSent,
  trackFirstEmailDelivered,
  trackFirstResourceCreated,
} = await import("../lib/activation-tracking");

function queueSelectResults(...results: MockRow[][]) {
  mockSelectResults.push(...results);
}

/**
 * Queue the result of the first-email claim. The helper reads the flag first,
 * then attempts the atomic upsert only when it's still null.
 * - won: flag read returns null → upsert wins.
 * - lost: flag read returns a timestamp → short-circuits before any upsert.
 */
function queueClaim(won: boolean) {
  if (won) {
    mockSelectResults.push([{ trackedAt: null }]);
    mockInsertResults.push([{ organizationId: "claimed" }]);
  } else {
    mockSelectResults.push([{ trackedAt: new Date() }]);
  }
}

describe("activation tracking", () => {
  beforeEach(() => {
    mockSelectResults.length = 0;
    mockInsertResults.length = 0;
    mockCapture.mockReset();
    mockGroupIdentify.mockReset();
    mockPlatformPost.mockReset();
    mockPlatformPost.mockResolvedValue({ error: null });
    process.env.WRAPS_API_KEY = "wraps_test_key";
  });

  it("fires first_email_sent exactly once when the claim is won", async () => {
    queueClaim(true);

    await trackFirstEmailSent(
      "org-1",
      { channel: "email", source: "workflow" },
      "contact@example.com"
    );

    expect(mockCapture).toHaveBeenCalledWith({
      distinctId: "org-1",
      event: "activation_first_email_sent",
      properties: {
        organization_id: "org-1",
        channel: "email",
        source: "workflow",
      },
      groups: { organization: "org-1" },
    });
    expect(mockGroupIdentify).toHaveBeenCalledWith({
      groupType: "organization",
      groupKey: "org-1",
      properties: { activation_first_email_sent: true },
    });
    expect(mockPlatformPost).toHaveBeenCalledWith("/v1/events/", {
      body: {
        name: "activation.first_email_sent",
        contactEmail: "contact@example.com",
        properties: {
          organization_id: "org-1",
          channel: "email",
          source: "workflow",
        },
      },
    });
  });

  it("does not re-fire first_email_sent once the org is already tracked", async () => {
    // Regression: the old count-window re-fired on every workflow run because
    // workflow sends never land as status='sent'. The claim must lose here.
    queueClaim(false);

    await trackFirstEmailSent("org-1", {
      channel: "email",
      source: "workflow",
    });

    expect(mockCapture).not.toHaveBeenCalled();
    expect(mockGroupIdentify).not.toHaveBeenCalled();
    expect(mockPlatformPost).not.toHaveBeenCalled();
  });

  it("tracks first SDK delivery when the org has not been tracked yet", async () => {
    queueClaim(true);

    await trackFirstEmailDelivered("org-sdk", "sdk");

    expect(mockCapture).toHaveBeenCalledWith({
      distinctId: "org-sdk",
      event: "activation_first_email_sent",
      properties: {
        organization_id: "org-sdk",
        channel: "email",
        source: "sdk",
      },
      groups: { organization: "org-sdk" },
    });
    expect(mockGroupIdentify).toHaveBeenCalledWith({
      groupType: "organization",
      groupKey: "org-sdk",
      properties: {
        activation_first_email_sent: true,
        activation_email_source: "sdk",
      },
    });
  });

  it("skips delivery tracking when the org was already tracked", async () => {
    queueClaim(false);

    await trackFirstEmailDelivered("org-platform", "platform");

    expect(mockCapture).not.toHaveBeenCalled();
    expect(mockGroupIdentify).not.toHaveBeenCalled();
  });

  it("emits first template activation with CLI source", async () => {
    queueSelectResults([{ count: 1 }]);

    await trackFirstResourceCreated(
      "org-template",
      "template",
      "cli",
      null,
      "welcome-email"
    );

    expect(mockCapture).toHaveBeenCalledWith({
      distinctId: "org-template",
      event: "activation_first_template",
      properties: {
        organization_id: "org-template",
        resource: "template",
        source: "cli",
        templateName: "welcome-email",
      },
      groups: { organization: "org-template" },
    });
    expect(mockGroupIdentify).toHaveBeenCalledWith({
      groupType: "organization",
      groupKey: "org-template",
      properties: {
        activation_first_template: true,
        activation_first_template_source: "cli",
      },
    });
    // No userId provided → emit() is skipped (no userEmail to resolve)
    expect(mockPlatformPost).not.toHaveBeenCalled();
  });

  it("emits first workflow activation with dashboard source", async () => {
    queueSelectResults([{ count: 1 }]);

    await trackFirstResourceCreated(
      "org-workflow",
      "workflow",
      "dashboard",
      null,
      "Welcome Sequence"
    );

    expect(mockCapture).toHaveBeenCalledWith({
      distinctId: "org-workflow",
      event: "activation_first_automation",
      properties: {
        organization_id: "org-workflow",
        resource: "workflow",
        source: "dashboard",
        workflowName: "Welcome Sequence",
      },
      groups: { organization: "org-workflow" },
    });
    expect(mockGroupIdentify).toHaveBeenCalledWith({
      groupType: "organization",
      groupKey: "org-workflow",
      properties: {
        activation_first_automation: true,
        activation_first_automation_source: "dashboard",
      },
    });
    // No userId provided → emit() is skipped (no userEmail to resolve)
    expect(mockPlatformPost).not.toHaveBeenCalled();
  });

  it("includes resource name in the platform event when userId resolves to an email", async () => {
    queueSelectResults([{ count: 1 }], [{ email: "owner@example.com" }]);

    await trackFirstResourceCreated(
      "org-named",
      "template",
      "cli",
      "user-1",
      "welcome-email"
    );

    expect(mockPlatformPost).toHaveBeenCalledWith("/v1/events/", {
      body: {
        name: "activation.first_template",
        contactEmail: "owner@example.com",
        properties: {
          organization_id: "org-named",
          resource: "template",
          source: "cli",
          templateName: "welcome-email",
        },
      },
    });
  });

  it("omits resource name props when no name is provided", async () => {
    queueSelectResults([{ count: 1 }]);

    await trackFirstResourceCreated("org-noname", "workflow", "cli");

    expect(mockCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "activation_first_automation",
        properties: {
          organization_id: "org-noname",
          resource: "workflow",
          source: "cli",
        },
      })
    );
  });

  it("does not emit resource activation after the first resource", async () => {
    queueSelectResults([{ count: 2 }]);

    await trackFirstResourceCreated("org-repeat", "template", "cli");

    expect(mockCapture).not.toHaveBeenCalled();
    expect(mockGroupIdentify).not.toHaveBeenCalled();
    expect(mockPlatformPost).not.toHaveBeenCalled();
  });
});
