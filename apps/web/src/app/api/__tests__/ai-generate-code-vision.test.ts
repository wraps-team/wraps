import { resetAIProviderCache } from "@wraps/ai";
import { aiUsageMonthly, db } from "@wraps/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testMemberOwner, testOrganization, testUser } from "./setup";

vi.mock("next/headers", () => ({ headers: () => new Headers() }));

vi.mock("@wraps/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(() =>
        Promise.resolve({
          user: { id: testUser.id, email: "test@example.com", name: "Test" },
          session: { id: "session-123", userId: testUser.id },
        })
      ),
    },
  },
}));

vi.mock("@/lib/organization", () => ({
  getOrganizationWithMembership: vi.fn((slug: string) =>
    Promise.resolve(
      slug === testOrganization.slug
        ? {
            id: testOrganization.id,
            name: testOrganization.name,
            slug: testOrganization.slug,
            userRole: testMemberOwner.role,
          }
        : null
    )
  ),
  getOrganizationPlanId: vi.fn(() => Promise.resolve("scale")),
}));

type StreamTextArgs = {
  messages?: { role: string; content: unknown }[];
  providerOptions?: unknown;
};

const streamTextMock = vi.fn((_options: StreamTextArgs) => ({
  toUIMessageStreamResponse: () => new Response(null, { status: 200 }),
}));

vi.mock("ai", () => ({
  // A real user message is required, otherwise the route finds no message to
  // attach the image to and the branch under test never runs.
  convertToModelMessages: vi.fn(() => [
    { role: "user", content: "make it pop" },
  ]),
  streamText: (options: StreamTextArgs) => streamTextMock(options),
}));

vi.mock("@ai-sdk/gateway", () => ({
  gateway: vi.fn((id: string) => ({ id })),
}));

type PromptArgs = { hasImageReference?: boolean };

const buildPromptMock = vi.fn((_args: PromptArgs) => "system prompt");
vi.mock("@/lib/ai/react-email-system-prompt", () => ({
  buildReactEmailSystemPrompt: (args: PromptArgs) => buildPromptMock(args),
}));

vi.mock("@/lib/ai/image-utils", () => ({
  fetchAndProcessImage: vi.fn(() =>
    Promise.resolve({ base64: "AAAA", mediaType: "image/png" })
  ),
}));

const IMAGE_REQUEST = {
  messages: [
    { id: "m1", role: "user", parts: [{ type: "text", text: "make it pop" }] },
  ],
  imageBase64: "AAAA",
  imageMediaType: "image/png",
};

function postWithImage() {
  return import("../[orgSlug]/emails/templates/ai/generate-code/route").then(
    ({ POST }) =>
      POST(
        new Request(
          `http://localhost/api/${testOrganization.slug}/emails/templates/ai/generate-code`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(IMAGE_REQUEST),
          }
        ),
        { params: Promise.resolve({ orgSlug: testOrganization.slug }) }
      )
  );
}

/** The options streamText actually received. */
function lastStreamTextArgs(): StreamTextArgs | undefined {
  return streamTextMock.mock.calls.at(-1)?.[0];
}

/** The content parts sent for the last user message. */
function sentUserContent(): unknown {
  return lastStreamTextArgs()?.messages?.at(-1)?.content;
}

function promptGotImageReference(): boolean {
  return buildPromptMock.mock.calls.at(-1)?.[0]?.hasImageReference === true;
}

describe("generate-code — image handling degrades on models without vision", () => {
  beforeEach(async () => {
    resetAIProviderCache();
    streamTextMock.mockClear();
    buildPromptMock.mockClear();
    await db
      .delete(aiUsageMonthly)
      .where(eq(aiUsageMonthly.organizationId, testOrganization.id));
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await db
      .delete(aiUsageMonthly)
      .where(eq(aiUsageMonthly.organizationId, testOrganization.id));
  });

  it("sends the image when the configured model supports vision", async () => {
    vi.stubEnv("AI_MODEL", "anthropic/claude-sonnet-4");

    const response = await postWithImage();
    expect(response.status).toBe(200);

    const content = sentUserContent();
    expect(Array.isArray(content)).toBe(true);
    expect(content).toContainEqual(
      expect.objectContaining({ type: "file", mediaType: "image/png" })
    );
    expect(promptGotImageReference()).toBe(true);
  });

  it("drops the image instead of failing when the model has no vision", async () => {
    // Grok has no vision. Sending an image part would be rejected upstream, so
    // the route degrades: no image, and the prompt is told not to reference one.
    vi.stubEnv("AI_MODEL", "xai/grok-code-fast-1");

    const response = await postWithImage();
    expect(response.status).toBe(200);

    const content = sentUserContent();
    expect(JSON.stringify(content)).not.toContain('"type":"image"');
    expect(promptGotImageReference()).toBe(false);
  });

  it("passes the resolved providerOptions through to streamText", async () => {
    vi.stubEnv("AI_MODEL", "anthropic/claude-sonnet-4");

    await postWithImage();

    expect(lastStreamTextArgs()?.providerOptions).toEqual({
      gateway: { zeroDataRetention: true },
      anthropic: { thinking: { type: "enabled", budgetTokens: 10_000 } },
    });
  });

  it("sends no anthropic options when the model is not anthropic", async () => {
    vi.stubEnv("AI_MODEL", "xai/grok-code-fast-1");

    await postWithImage();

    expect(lastStreamTextArgs()?.providerOptions).toEqual({
      gateway: { zeroDataRetention: true },
    });
  });
});
