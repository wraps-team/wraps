import { beforeEach, describe, expect, it, vi } from "vitest";

const TEST_ORG = {
  id: "test-assistant-org-1",
  name: "Assistant Test Org",
  slug: "assistant-test-org",
  userRole: "owner",
};

vi.mock("next/headers", () => ({ headers: () => new Headers() }));

vi.mock("@wraps/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(() =>
        Promise.resolve({
          user: { id: "test-user-1", email: "test@example.com", name: "Test" },
          session: { id: "session-123", userId: "test-user-1" },
        })
      ),
    },
  },
}));

vi.mock("@/lib/organization", () => ({
  getOrganizationWithMembership: vi.fn((slug: string) =>
    Promise.resolve(
      slug === TEST_ORG.slug
        ? {
            id: TEST_ORG.id,
            name: TEST_ORG.name,
            slug: TEST_ORG.slug,
            userRole: TEST_ORG.userRole,
          }
        : null
    )
  ),
}));

const trackAiRequestMock = vi.fn((_data: unknown) => Promise.resolve(1));

vi.mock("@/lib/usage/ai-usage", () => ({
  checkAiUsageLimit: vi.fn(() =>
    Promise.resolve({ allowed: true, current: 0, limit: 500, planId: "scale" })
  ),
  trackAiRequest: (data: unknown) => trackAiRequestMock(data),
}));

const getAIModelMock = vi.fn(() =>
  Promise.resolve({
    model: { id: "test-model" },
    modelId: "anthropic/claude-sonnet-4",
    providerOptions: undefined,
  })
);

vi.mock("@wraps/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@wraps/ai")>();
  return { ...actual, getAIModel: () => getAIModelMock() };
});

type StreamTextArgs = {
  tools?: Record<string, unknown>;
  stopWhen?: unknown;
  onFinish?: (result: {
    totalUsage: {
      inputTokens?: number;
      cachedInputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    };
    usage: {
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    };
  }) => Promise<void> | void;
};

const streamTextMock = vi.fn((_options: StreamTextArgs) => ({
  toUIMessageStreamResponse: () => new Response(null, { status: 200 }),
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    convertToModelMessages: vi.fn(() => [{ role: "user", content: "hi" }]),
    streamText: (options: StreamTextArgs) => streamTextMock(options),
  };
});

function postAssistant() {
  return import("../[orgSlug]/ai/assistant/route").then(({ POST }) =>
    POST(
      new Request(`http://localhost/api/${TEST_ORG.slug}/ai/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { id: "m1", role: "user", parts: [{ type: "text", text: "hi" }] },
          ],
        }),
      }),
      { params: Promise.resolve({ orgSlug: TEST_ORG.slug }) }
    )
  );
}

function lastStreamTextArgs(): StreamTextArgs | undefined {
  return streamTextMock.mock.calls.at(-1)?.[0];
}

describe("assistant route", () => {
  beforeEach(() => {
    streamTextMock.mockClear();
    trackAiRequestMock.mockClear();
    getAIModelMock.mockClear();
  });

  it("offers exactly the read-only tools to the model", async () => {
    const response = await postAssistant();
    expect(response.status).toBe(200);

    const tools = lastStreamTextArgs()?.tools ?? {};
    expect(Object.keys(tools).sort()).toEqual(
      ["get_email_metrics", "get_setup_status", "list_recent_sends"].sort()
    );
  });

  it("bounds the tool loop at five steps", async () => {
    await postAssistant();

    const stopWhen = lastStreamTextArgs()?.stopWhen as (o: {
      steps: unknown[];
    }) => boolean;
    expect(await stopWhen({ steps: new Array(4) })).toBe(false);
    expect(await stopWhen({ steps: new Array(5) })).toBe(true);
  });

  it("records total usage across every step, not the last step's", async () => {
    await postAssistant();

    const onFinish = lastStreamTextArgs()?.onFinish;
    expect(onFinish).toBeDefined();
    await onFinish!({
      totalUsage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    });

    expect(trackAiRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        totalTokens: 120,
        featureType: "ai_assistant",
      })
    );
  });

  it("returns 503 when the AI provider is unconfigured", async () => {
    getAIModelMock.mockRejectedValueOnce(
      Object.assign(new Error("ai: no provider configured"), {
        kind: "provider-config",
        domain: "ai",
        issues: [{ message: "AI_GATEWAY_API_KEY is not set" }],
      })
    );

    const response = await postAssistant();
    expect(response.status).toBe(503);

    const body = JSON.stringify(await response.json());
    expect(body).not.toContain("AI_GATEWAY_API_KEY");
    expect(body).not.toContain("no provider configured");
  });
});
