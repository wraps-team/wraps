import { getAIModel } from "@wraps/ai";
import { generateObject } from "ai";
import type { z } from "zod";
import { aiEnv } from "@/lib/ai/env";
import { logger, serializeError } from "@/lib/logger";

/** A slow provider must not hold a server action open indefinitely. */
const GENERATION_TIMEOUT_MS = 6000;

/**
 * Generate short UI copy from facts the caller has ALREADY established, with a
 * static fallback.
 *
 * The contract, and the reason this is a helper rather than an inline call:
 *  - The caller decides WHAT is true. The model only phrases it.
 *  - `facts` must be JSON of numbers, booleans, and closed-enum strings. Free
 *    user text must never be routed through here — see the caller-side schema.
 *  - Every failure path returns `fallback`: no provider configured, provider
 *    throws, schema mismatch, timeout. A missing model must degrade to the
 *    copy the product shipped with, never to an error or an empty string.
 */
export async function generateGroundedCopy<T>(args: {
  schema: z.ZodType<T>;
  system: string;
  facts: Record<string, number | boolean | string | null>;
  fallback: T;
  onUsage?: (usage: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    model: string;
  }) => void;
}): Promise<{ value: T; generated: boolean }> {
  const { schema, system, facts, fallback, onUsage } = args;

  try {
    const { model, modelId, providerOptions } = await getAIModel(
      { reasoning: { effort: "low" } },
      aiEnv()
    );

    const generation = generateObject({
      model,
      schema,
      system,
      prompt: JSON.stringify(facts),
      maxOutputTokens: 300,
      providerOptions,
    });

    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error("generateGroundedCopy timed out"));
      }, GENERATION_TIMEOUT_MS);
    });

    const result = await Promise.race([generation, timeout]);

    onUsage?.({
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
      totalTokens: result.usage?.totalTokens,
      model: modelId,
    });

    return { value: result.object, generated: true };
  } catch (error) {
    logger.warn(
      { event: "ai.grounded_copy_failed", err: serializeError(error) },
      "Falling back to static copy"
    );
    return { value: fallback, generated: false };
  }
}
