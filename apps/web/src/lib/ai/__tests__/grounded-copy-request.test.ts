import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const { mockGetAIModel, mockGenerateText } = vi.hoisted(() => ({
  mockGetAIModel: vi.fn(),
  mockGenerateText: vi.fn(),
}));

vi.mock("@wraps/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@wraps/ai")>();
  // Partial mock: keep DEPLOYMENT_MODE_ENV and the rest that `aiEnv()` reads.
  return { ...actual, getAIModel: mockGetAIModel };
});

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, generateText: mockGenerateText };
});

const { generateGroundedCopy } = await import("../grounded-copy");

const schema = z.object({ title: z.string(), description: z.string() });
const fallback = { title: "Static title", description: "Static description" };

const generated = {
  title: "Bounce rate at 6.0%",
  description: "This is above the 5% threshold.",
};

describe("generateGroundedCopy model request", () => {
  beforeEach(() => {
    mockGetAIModel.mockReset();
    mockGenerateText.mockReset();
    mockGetAIModel.mockResolvedValue({
      model: { modelId: "claude-haiku-5.5" },
      modelId: "claude-haiku-5.5",
      providerOptions: undefined,
    });
    mockGenerateText.mockResolvedValue({
      output: generated,
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    });
  });

  it("requests the model without reasoning so thinking cannot consume the output cap", async () => {
    await generateGroundedCopy({
      schema,
      system: "You write short dashboard copy.",
      facts: { current: 6 },
      fallback,
    });

    expect(mockGetAIModel).toHaveBeenCalledTimes(1);
    const [request] = mockGetAIModel.mock.calls[0];
    // `maxOutputTokens` is 300; reasoning tokens count against it and
    // truncated the JSON, so the request must not enable reasoning.
    expect(request).toEqual({ model: "claude-haiku-5.5" });
    expect(request).not.toHaveProperty("reasoning");
  });

  it("returns the parsed copy when the model answers within the cap", async () => {
    const result = await generateGroundedCopy({
      schema,
      system: "You write short dashboard copy.",
      facts: { current: 6 },
      fallback,
    });

    expect(result).toEqual({ value: generated, generated: true });
  });
});
