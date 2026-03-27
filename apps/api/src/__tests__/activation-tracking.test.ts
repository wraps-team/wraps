import { beforeEach, describe, expect, it, vi } from "vitest";

type MockRow = Record<string, unknown>;

const {
  mockCapture,
  mockGroupIdentify,
  mockPlatformPost,
  mockSelectResults,
} = vi.hoisted(() => ({
  mockCapture: vi.fn(),
  mockGroupIdentify: vi.fn(),
  mockPlatformPost: vi.fn(),
  mockSelectResults: [] as MockRow[][],
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
    error: vi.fn(),
  },
}));

const { trackFirstEmailDelivered, trackFirstResourceCreated } = await import(
  "../lib/activation-tracking"
);

function queueSelectResults(...results: MockRow[][]) {
  mockSelectResults.push(...results);
}

describe("activation tracking", () => {
  beforeEach(() => {
    mockSelectResults.length = 0;
    mockCapture.mockReset();
    mockGroupIdentify.mockReset();
    mockPlatformPost.mockReset();
    mockPlatformPost.mockResolvedValue({ error: null });
    process.env.WRAPS_API_KEY = "wraps_test_key";
  });

  it("tracks first SDK delivery when no platform sends exist", async () => {
    queueSelectResults([{ activationScore: 0 }], [{ count: 0 }]);

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

  it("skips platform delivery tracking when sent records already exist", async () => {
    queueSelectResults([{ activationScore: 0 }], [{ count: 4 }]);

    await trackFirstEmailDelivered("org-platform", "platform");

    expect(mockCapture).not.toHaveBeenCalled();
    expect(mockGroupIdentify).not.toHaveBeenCalled();
  });

  it("emits first template activation with CLI source", async () => {
    queueSelectResults([{ count: 1 }]);

    await trackFirstResourceCreated("org-template", "template", "cli");

    expect(mockCapture).toHaveBeenCalledWith({
      distinctId: "org-template",
      event: "activation_first_template",
      properties: {
        organization_id: "org-template",
        resource: "template",
        source: "cli",
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
    expect(mockPlatformPost).toHaveBeenCalledWith("/v1/events/", {
      body: {
        name: "activation.first_template",
        contactEmail: "org-template",
        properties: {
          organization_id: "org-template",
          resource: "template",
          source: "cli",
        },
      },
    });
  });

  it("emits first workflow activation with dashboard source", async () => {
    queueSelectResults([{ count: 1 }]);

    await trackFirstResourceCreated("org-workflow", "workflow", "dashboard");

    expect(mockCapture).toHaveBeenCalledWith({
      distinctId: "org-workflow",
      event: "activation_first_automation",
      properties: {
        organization_id: "org-workflow",
        resource: "workflow",
        source: "dashboard",
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
    expect(mockPlatformPost).toHaveBeenCalledWith("/v1/events/", {
      body: {
        name: "activation.first_automation",
        contactEmail: "org-workflow",
        properties: {
          organization_id: "org-workflow",
          resource: "workflow",
          source: "dashboard",
        },
      },
    });
  });

  it("does not emit resource activation after the first resource", async () => {
    queueSelectResults([{ count: 2 }]);

    await trackFirstResourceCreated("org-repeat", "template", "cli");

    expect(mockCapture).not.toHaveBeenCalled();
    expect(mockGroupIdentify).not.toHaveBeenCalled();
    expect(mockPlatformPost).not.toHaveBeenCalled();
  });
});
