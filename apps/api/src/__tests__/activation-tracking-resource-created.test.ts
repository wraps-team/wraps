import { beforeEach, describe, expect, it, vi } from "vitest";

type EventBody = {
  name: string;
  contactEmail: string;
  properties: Record<string, unknown>;
};

type EventPostRequest = {
  body: EventBody;
};

const postedEvents: EventBody[] = [];
let resourceCount = 1;
let ownerEmail: string | null = null;
let fallbackMemberEmail: string | null = null;
let memberQueryCount = 0;

const memberTable = {
  organizationId: "member.organizationId",
  role: "member.role",
  userId: "member.userId",
};
const userTable = {
  id: "user.id",
  email: "user.email",
};
const templateTable = {
  organizationId: "template.organizationId",
};
const workflowTable = {
  organizationId: "workflow.organizationId",
};

vi.mock("@wraps.dev/client", () => ({
  createPlatformClient: vi.fn(() => ({
    POST: vi.fn(async (_path: string, request: EventPostRequest) => {
      postedEvents.push(request.body);
      return { error: null };
    }),
  })),
}));

vi.mock("drizzle-orm", () => ({
  and: (...conditions: unknown[]) => ({ conditions }),
  count: () => "__count__",
  eq: (left: unknown, right: unknown) => ({ left, right }),
}));

vi.mock("../lib/posthog", () => ({
  getPostHogClient: () => ({
    capture: vi.fn(),
    groupIdentify: vi.fn(),
  }),
}));

vi.mock("../lib/logger", () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@wraps/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => {
        if (table === templateTable || table === workflowTable) {
          return {
            where: vi.fn(async () => [{ count: resourceCount }]),
          };
        }

        if (table === memberTable) {
          return {
            innerJoin: vi.fn(() => ({
              where: vi.fn(() => ({
                limit: vi.fn(async () => {
                  memberQueryCount += 1;

                  if (memberQueryCount === 1) {
                    return ownerEmail ? [{ email: ownerEmail }] : [];
                  }

                  return fallbackMemberEmail
                    ? [{ email: fallbackMemberEmail }]
                    : [];
                }),
              })),
            })),
          };
        }

        return {
          where: vi.fn(async () => []),
        };
      }),
    })),
  },
  member: memberTable,
  messageSend: {
    organizationId: "messageSend.organizationId",
    status: "messageSend.status",
  },
  organizationExtension: {
    activationScore: "organizationExtension.activationScore",
    organizationId: "organizationExtension.organizationId",
  },
  template: templateTable,
  user: userTable,
  workflow: workflowTable,
}));

describe("trackFirstResourceCreated", () => {
  beforeEach(() => {
    postedEvents.length = 0;
    resourceCount = 1;
    ownerEmail = null;
    fallbackMemberEmail = null;
    memberQueryCount = 0;
    process.env.WRAPS_API_KEY = "test-api-key";
  });

  it("emits activation event using owner contact email", async () => {
    ownerEmail = "owner@example.com";

    const { trackFirstResourceCreated } = await import(
      "../lib/activation-tracking"
    );

    await trackFirstResourceCreated("org-1", "template", "cli");

    expect(postedEvents.length).toBe(1);
    expect(postedEvents[0]).toMatchObject({
      name: "activation.first_template",
      contactEmail: "owner@example.com",
      properties: {
        organization_id: "org-1",
        resource: "template",
        source: "cli",
      },
    });
    expect(postedEvents[0].contactEmail).not.toBe("org-1");
  });

  it("falls back to any org member email when owner is missing", async () => {
    fallbackMemberEmail = "member@example.com";

    const { trackFirstResourceCreated } = await import(
      "../lib/activation-tracking"
    );

    await trackFirstResourceCreated("org-2", "workflow", "cli");

    expect(postedEvents.length).toBe(1);
    expect(postedEvents[0]).toMatchObject({
      name: "activation.first_automation",
      contactEmail: "member@example.com",
      properties: {
        organization_id: "org-2",
        resource: "workflow",
        source: "cli",
      },
    });
  });
});
