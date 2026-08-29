import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

type GenerateObjectFn = typeof import("ai").generateObject;

const { mockGenerateObject, hoisted } = vi.hoisted(() => ({
  mockGenerateObject: vi.fn(),
  hoisted: { actualGenerateObject: undefined as unknown },
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  hoisted.actualGenerateObject = actual.generateObject;
  return {
    ...actual,
    generateObject: (...args: Parameters<GenerateObjectFn>) =>
      mockGenerateObject(...args),
  };
});

const { generateGroundedCopy } = await import("../grounded-copy");

const testSchema = z.object({
  title: z.string(),
  description: z.string(),
});

const FALLBACK = {
  title: "Static fallback title",
  description: "Static fallback description",
};

describe("generateGroundedCopy", () => {
  let originalProvider: string | undefined;

  beforeEach(() => {
    originalProvider = process.env.WRAPS_AI_PROVIDER;
    process.env.WRAPS_AI_PROVIDER = "noop";
    mockGenerateObject.mockReset();
    mockGenerateObject.mockImplementation(
      hoisted.actualGenerateObject as GenerateObjectFn
    );
  });

  afterEach(() => {
    if (originalProvider === undefined) {
      delete process.env.WRAPS_AI_PROVIDER;
    } else {
      process.env.WRAPS_AI_PROVIDER = originalProvider;
    }
    vi.useRealTimers();
  });

  it("falls back when the provider cannot generate", async () => {
    const result = await generateGroundedCopy({
      schema: testSchema,
      system: "You write short dashboard copy.",
      facts: { current: 5 },
      fallback: FALLBACK,
    });

    expect(result).toEqual({ value: FALLBACK, generated: false });
  });

  it("falls back when the model returns a shape the schema rejects", async () => {
    mockGenerateObject.mockRejectedValueOnce(
      new Error("AI_NoObjectGeneratedError: response did not match schema")
    );

    const result = await generateGroundedCopy({
      schema: testSchema,
      system: "You write short dashboard copy.",
      facts: { current: 5 },
      fallback: FALLBACK,
    });

    expect(result).toEqual({ value: FALLBACK, generated: false });
  });

  it("returns the generated value and reports usage on success", async () => {
    const onUsage = vi.fn();
    const generated = {
      title: "Bounce rate at 6.0%",
      description: "This is above the 5% threshold. Clean your list.",
    };
    mockGenerateObject.mockResolvedValueOnce({
      object: generated,
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    });

    const result = await generateGroundedCopy({
      schema: testSchema,
      system: "You write short dashboard copy.",
      facts: { current: 6 },
      fallback: FALLBACK,
      onUsage,
    });

    expect(result).toEqual({ value: generated, generated: true });
    expect(onUsage).toHaveBeenCalledOnce();
    expect(onUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
      })
    );
  });

  it("falls back when generation exceeds the timeout", async () => {
    vi.useFakeTimers();
    mockGenerateObject.mockImplementationOnce(() => new Promise(() => {}));

    const promise = generateGroundedCopy({
      schema: testSchema,
      system: "You write short dashboard copy.",
      facts: { current: 5 },
      fallback: FALLBACK,
    });

    await vi.advanceTimersByTimeAsync(6000);
    const result = await promise;

    expect(result).toEqual({ value: FALLBACK, generated: false });
  });
});
