"use server";

import { z } from "zod";
import { generateGroundedCopy } from "@/lib/ai/grounded-copy";
import { checkAiUsageLimit, trackAiRequest } from "@/lib/usage/ai-usage";
import { orgAction } from "./shared/org-action";

const nextStepKind = z.enum([
  "connect_aws",
  "connect_platform",
  "verify_domain",
  "leave_sandbox",
  "first_send",
  "done",
]);

/**
 * The security boundary for this action: every field is a number, a boolean,
 * or a member of a closed enum. No free text from the client ever reaches the
 * prompt — no domain names, email addresses, or org name. The step itself is
 * already chosen by `selectNextStep`; this only supplies the facts a model
 * needs to phrase it.
 */
const nextStepFacts = z.object({
  kind: nextStepKind,
  sandbox: z.boolean(),
  verifiedDomainCount: z.number().int().min(0).max(1000),
  emailCount: z.number().int().min(0).max(1_000_000_000),
  hasTemplate: z.boolean(),
  hasContact: z.boolean(),
});

const nextStepCopy = z.object({
  title: z.string().min(3).max(70),
  description: z.string().min(10).max(240),
});

export type NextStepCopy = z.infer<typeof nextStepCopy>;

const SYSTEM_PROMPT = `You are writing a title and one or two sentences for a card at the top of the setup dashboard for an AWS SES email/SMS sending platform.

The next step has already been chosen for this customer — do not suggest a different one. Restate only the facts given; never invent a metric, number, or claim about the customer's AWS account beyond what is provided.

If "sandbox" is true, be explicit that sends currently reach only verified recipients and the AWS mailbox simulator — not arbitrary recipients.

Output a JSON object with "title" (a short headline, under 70 characters) and "description" (one or two sentences, under 240 characters).`;

/**
 * Explain the single selected next-best-action for this org's setup
 * dashboard, grounded in the facts the caller already established. Which
 * step to show is deterministic (`selectNextStep`) — this only phrases it.
 */
export const explainNextStep = orgAction(
  {
    name: "explainNextStep",
    resource: "awsAccounts",
    permission: ["read"],
    orgId: (organizationId: string, _rawFacts: unknown) => organizationId,
    onError: "Could not generate a next step",
  },
  async (ctx, organizationId: string, rawFacts: unknown) => {
    const parsed = nextStepFacts.safeParse(rawFacts);
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

    const { value: copy } = await generateGroundedCopy<NextStepCopy | null>({
      schema: nextStepCopy,
      system: SYSTEM_PROMPT,
      facts: parsed.data,
      fallback: null,
      onUsage: (generationUsage) => {
        trackingPromise = trackAiRequest({
          organizationId,
          userId: ctx.access.userId,
          featureType: "ai_next_step",
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
