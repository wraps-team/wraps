import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCreatePlatformClient,
  mockDbSelect,
  mockPlatformPost,
  mockPosthogCapture,
  mockPosthogGroupIdentify,
  queuedSelectRows,
} = vi.hoisted(() => ({
  mockCreatePlatformClient: vi.fn(),
  mockDbSelect: vi.fn(),
  mockPlatformPost: vi.fn(),
  mockPosthogCapture: vi.fn(),
  mockPosthogGroupIdentify: vi.fn(),
  queuedSelectRows: [] as unknown[][],
}));

vi.mock("@wraps/db", () => ({
  db: {
    select: mockDbSelect,
  },
  messageSend: {
    organizationId: "messageSend.organizationId",
    status: "messageSend.status",
  },
  organizationExtension: {
    activationScore: "organizationExtension.activationScore",
    organizationId: "organizationExtension.organizationId",
  },
  template: {
    organizationId: "template.organizationId",
  },
  workflow: {
    organizationId: "workflow.organizationId",
  },
}));

vi.mock("@wraps.dev/client", () => ({
  createPlatformClient: mockCreatePlatformClient,
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  count: vi.fn(() => "count"),
  eq: vi.fn(),
}));

vi.mock("../lib/logger", () => ({
  log: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("../lib/posthog", () => ({
  getPostHogClient: vi.fn(() => ({
    capture: mockPosthogCapture,
    groupIdentify: mockPosthogGroupIdentify,
  })),
}));

const { trackFirstEmailDelivered, trackFirstResourceCreated } = await import(
  "../lib/activation-tracking"
);

const originalWrapsApiKey = process.env.WRAPS_API_KEY;

function createWhereResult(rows: unknown[]) {
  return Object.assign(Promise.resolve(rows), {
    limit: vi.fn(() => Promise.resolve(rows)),
  });
}

function queueSelectResults(...rows: unknown[][]) {
  queuedSelectRows.push(...rows);
}

beforeEach(() => {
  vi.clearAllMocks();
  queuedSelectRows.length = 0;
  process.env.WRAPS_API_KEY = "test-wraps-api-key";

  mockDbSelect.mockImplementation(() => {
    const rows = queuedSelectRows.shift() ?? [];

    return {
      from: vi.fn(() => ({
        where: vi.fn(() => createWhereResult(rows)),
      })),
    };
  });

  mockCreatePlatformClient.mockReturnValue({
    POST: mockPlatformPost,
  });
  mockPlatformPost.mockResolvedValue({ error: null });
});

afterEach(() => {
  if (originalWrapsApiKey === undefined) {
    delete process.env.WRAPS_API_KEY;
    return;
  }

  process.env.WRAPS_API_KEY = originalWrapsApiKey;
});

describe("trackFirstResourceCreated", () => {
  it("emits activation events for the first CLI template", async () => {
    queueSelectResults([{ count: 1 }]);

    await trackFirstResourceCreated("org-template", "template", "cli");

    expect(mockPosthogCapture).toHaveBeenCalledWith({
      distinctId: "org-template",
      event: "activation_first_template",
      properties: {
        organization_id: "org-template",
        resource: "template",
        source: "cli",
      },
      groups: { organization: "org-template" },
    });
    expect(mockPosthogGroupIdentify).toHaveBeenCalledWith({
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

  it("emits workflow-specific activation events for the first dashboard workflow", async () => {
    queueSelectResults([{ count: 1 }]);

    await trackFirstResourceCreated("org-workflow", "workflow", "dashboard");

    expect(mockPosthogCapture).toHaveBeenCalledWith({
      distinctId: "org-workflow",
      event: "activation_first_automation",
      properties: {
        organization_id: "org-workflow",
        resource: "workflow",
        source: "dashboard",
      },
      groups: { organization: "org-workflow" },
    });
    expect(mockPosthogGroupIdentify).toHaveBeenCalledWith({
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

  it("skips activation when the resource count is not the first one", async () => {
    queueSelectResults([{ count: 2 }]);

    await trackFirstResourceCreated("org-repeat", "template", "cli");

    expect(mockPosthogCapture).not.toHaveBeenCalled();
    expect(mockPosthogGroupIdentify).not.toHaveBeenCalled();
    expect(mockCreatePlatformClient).not.toHaveBeenCalled();
    expect(mockPlatformPost).not.toHaveBeenCalled();
  });
});

describe("trackFirstEmailDelivered", () => {
  it("tracks the first SDK delivery when the org is not yet activated", async () => {
    queueSelectResults([{ activationScore: 6 }], [{ count: 0 }]);

    await trackFirstEmailDelivered("org-sdk", "sdk");

    expect(mockPosthogCapture).toHaveBeenCalledWith({
      distinctId: "org-sdk",
      event: "activation_first_email_sent",
      properties: {
        organization_id: "org-sdk",
        channel: "email",
        source: "sdk",
      },
      groups: { organization: "org-sdk" },
    });
    expect(mockPosthogGroupIdentify).toHaveBeenCalledWith({
      groupType: "organization",
      groupKey: "org-sdk",
      properties: {
        activation_first_email_sent: true,
        activation_email_source: "sdk",
      },
    });
    expect(mockPlatformPost).not.toHaveBeenCalled();
  });

  it("skips platform delivery tracking when sent message records already exist", async () => {
    queueSelectResults([{ activationScore: 0 }], [{ count: 1 }]);

    await trackFirstEmailDelivered("org-platform", "platform");

    expect(mockPosthogCapture).not.toHaveBeenCalled();
    expect(mockPosthogGroupIdentify).not.toHaveBeenCalled();
  });

  it("skips delivery tracking when the org is already activated", async () => {
    queueSelectResults([{ activationScore: 7 }]);

    await trackFirstEmailDelivered("org-activated", "sdk");

    expect(mockPosthogCapture).not.toHaveBeenCalled();
    expect(mockPosthogGroupIdentify).not.toHaveBeenCalled();
  });
});
