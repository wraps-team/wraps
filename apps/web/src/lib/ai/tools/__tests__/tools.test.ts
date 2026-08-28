import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";

vi.mock("@/lib/setup-status", () => ({
  getSetupStatus: vi.fn(() =>
    Promise.resolve({
      setupStatus: {
        hasAwsAccount: true,
        hasAnyAwsAccounts: true,
        hasPlatformConnection: true,
        hasVerifiedDomain: true,
        hasSentEmail: true,
        hasTemplate: true,
        hasBroadcast: false,
        hasContact: true,
        hasWorkflow: false,
        verifiedDomains: ["example.com"],
        awsRegion: "us-east-1",
        emailCount: 42,
        sandboxStatus: true,
        awsAccountId: "111122223333",
        domainCount: 1,
      },
      awsAccount: {
        id: "acct-1",
        webhookSecret: "SUPER-SECRET-VALUE",
        features: {},
      },
    })
  ),
}));

const getRecentActivityFromPostgresMock = vi.fn();
vi.mock("@/lib/analytics-fallback", () => ({
  getEmailMetricsFromPostgres: vi.fn(() => Promise.resolve(new Map())),
  getRecentActivityFromPostgres: (organizationId: string, limit: number) =>
    getRecentActivityFromPostgresMock(organizationId, limit),
}));

const { ASSISTANT_TOOLS } = await import("../definitions");
const { buildAssistantTools } = await import("../index");

const TEST_CTX = { organizationId: "org-1", orgSlug: "org-1" };

describe("ASSISTANT_TOOLS", () => {
  it("no tool accepts an organization id as input", () => {
    for (const def of ASSISTANT_TOOLS) {
      const shape = (def.inputSchema as z.ZodObject<z.ZodRawShape>).shape;
      const keys = Object.keys(shape ?? {});
      for (const key of keys) {
        expect(key).not.toMatch(/^(organization|org)(id)?$/i);
      }
    }
  });

  it("get_setup_status never returns the webhook secret", async () => {
    const def = ASSISTANT_TOOLS.find((t) => t.name === "get_setup_status");
    expect(def).toBeDefined();
    const result = await def!.execute({}, TEST_CTX);
    expect(JSON.stringify(result)).not.toContain("SUPER-SECRET-VALUE");
    expect(result).not.toHaveProperty("webhookSecret");
  });

  it("list_recent_sends drops metadata and ids", async () => {
    getRecentActivityFromPostgresMock.mockResolvedValueOnce([
      {
        id: "row-1",
        messageId: "msg-1",
        subject: "Welcome",
        eventType: "delivered",
        timestamp: 1_700_000_000_000,
        sentAt: 1_700_000_000_000,
        timestampFormatted: "2023-11-14 12:00",
        metadata: { recipient: "person@example.com" },
      },
    ]);
    const def = ASSISTANT_TOOLS.find((t) => t.name === "list_recent_sends");
    expect(def).toBeDefined();
    const result = (await def!.execute({ limit: 10 }, TEST_CTX)) as Record<
      string,
      unknown
    >[];
    expect(Object.keys(result[0]).sort()).toEqual(
      ["eventType", "subject", "timestampFormatted"].sort()
    );
    expect(JSON.stringify(result)).not.toContain("person@example.com");
  });

  it("a role with no permissions gets no tools", () => {
    const tools = buildAssistantTools({ ctx: TEST_CTX, userRole: "nobody" });
    expect(tools).toEqual({});
  });

  it("the read-only role gets all three tools", () => {
    const tools = buildAssistantTools({
      ctx: TEST_CTX,
      userRole: "read-only",
    });
    expect(Object.keys(tools).sort()).toEqual(
      ["get_email_metrics", "get_setup_status", "list_recent_sends"].sort()
    );
  });

  it("get_email_metrics rejects an out-of-range window", () => {
    const def = ASSISTANT_TOOLS.find((t) => t.name === "get_email_metrics");
    expect(def).toBeDefined();
    expect(def!.inputSchema.safeParse({ days: 400 }).success).toBe(false);
  });
});
