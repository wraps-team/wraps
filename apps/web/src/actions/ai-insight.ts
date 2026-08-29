"use server";

import { z } from "zod";
import { generateGroundedCopy } from "@/lib/ai/grounded-copy";
import { checkAiUsageLimit, trackAiRequest } from "@/lib/usage/ai-usage";
import { orgAction } from "./shared/org-action";

const insightKind = z.enum([
  "bounce_rate",
  "complaint_rate",
  "delivery_rate_drop",
  "volume_drop",
  "event_limit",
]);

/**
 * The security boundary for this action: every field is a number or a member
 * of a closed enum. No free text from the client ever reaches the prompt.
 */
const insightFacts = z.object({
  kind: insightKind,
  severity: z.enum(["warning", "critical"]),
  current: z.number().finite().min(0).max(1_000_000_000),
  /**
   * Null for the three static-threshold insights (bounce_rate,
   * complaint_rate, event_limit): they compare against a fixed threshold, not
   * against a previous period. Making this a required number would force the
   * caller to send a placeholder 0, and the model would faithfully report
   * "up from 0%" — a fabricated claim, which is the one failure mode this
   * whole design exists to prevent.
   */
  previous: z.number().finite().min(0).max(1_000_000_000).nullable(),
  windowDays: z.number().int().min(1).max(90),
  sandbox: z.boolean(),
  verifiedDomainCount: z.number().int().min(0).max(1000),
});

const insightCopy = z.object({
  title: z.string().min(3).max(80),
  description: z.string().min(10).max(220),
});

export type InsightCopy = z.infer<typeof insightCopy>;

const SYSTEM_PROMPT = `You are writing two sentences for a card on a dashboard for an AWS SES email/SMS sending platform.

The facts you are given are already verified — restate them, do not recalculate them. Never invent a metric, number, or trend that is not present in the facts.

When "previous" is null there is no prior-period figure available — do not describe a change, a trend, or a direction. Only describe the current value against its threshold.

If "sandbox" is true, the AWS account is in the SES sandbox: say what that implies for this metric (e.g. sends are capped and limited to verified recipients).

Recommend exactly one concrete next action the user can take.

Output a JSON object with "title" (a short headline, under 80 characters) and "description" (one or two sentences, under 220 characters).`;

/**
 * Explain a single detected insight in plain language, grounded in the facts
 * the caller already established. Detection stays deterministic — this only
 * phrases a fact that was already true.
 */
export const explainInsight = orgAction(
  {
    name: "explainInsight",
    resource: "broadcasts",
    permission: ["read"],
    orgId: (organizationId: string, _rawFacts: unknown) => organizationId,
    onError: "Could not generate an explanation",
  },
  async (ctx, organizationId: string, rawFacts: unknown) => {
    const parsed = insightFacts.safeParse(rawFacts);
    if (!parsed.success) {
      return { success: true as const, copy: null };
    }

    const usage = await checkAiUsageLimit(organizationId);
    if (!usage.allowed) {
      return { success: true as const, copy: null };
    }

    // `onUsage` fires synchronously (see `generateGroundedCopy`'s contract),
    // so the tracking write is kicked off there but captured here and awaited
    // before this action returns — the write must be persisted, not left to
    // race the response.
    let trackingPromise: Promise<number> | undefined;

    const { value: copy } = await generateGroundedCopy<InsightCopy | null>({
      schema: insightCopy,
      system: SYSTEM_PROMPT,
      facts: parsed.data,
      fallback: null,
      onUsage: (generationUsage) => {
        trackingPromise = trackAiRequest({
          organizationId,
          userId: ctx.access.userId,
          featureType: "ai_insight",
          inputTokens: generationUsage.inputTokens,
          outputTokens: generationUsage.outputTokens,
          totalTokens: generationUsage.totalTokens,
          model: generationUsage.model,
        });
      },
    });

    if (trackingPromise) {
      await trackingPromise;
    }

    return { success: true as const, copy };
  }
);
