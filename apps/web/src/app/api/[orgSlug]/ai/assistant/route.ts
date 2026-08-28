import { getAIModel, isProviderConfigError } from "@wraps/ai";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAIRequest } from "@/app/api/shared/ai-request";
import { aiEnv } from "@/lib/ai/env";
import { buildAssistantTools } from "@/lib/ai/tools";
import { createRequestLogger } from "@/lib/logger";
import { trackAiRequest } from "@/lib/usage/ai-usage";

const ROUTE_PATH = "/api/[orgSlug]/ai/assistant";

const bodySchema = z.object({
  messages: z.array(z.unknown()),
});

const ASSISTANT_SYSTEM_PROMPT = `You are the Wraps dashboard assistant. You answer questions about this specific Wraps organization's account state: its AWS setup, sending domains, SES sandbox status, and recent email activity.

You have read-only tools that can look up this organization's own data. You cannot change anything — you cannot deploy infrastructure, send email, or modify settings. When a question needs account data, call the appropriate tool rather than guessing or inventing numbers. If no tool can answer a question, say so plainly instead of making something up.`;

type RouteContext = {
  params: Promise<{
    orgSlug: string;
  }>;
};

// POST /api/[orgSlug]/ai/assistant - Read-only assistant chat over the org's own account state
export async function POST(request: Request, context: RouteContext) {
  try {
    const gated = await resolveAIRequest(context, {
      resource: "events",
      permissions: ["read"],
      path: ROUTE_PATH,
    });
    if (!gated.ok) return gated.response;
    const { orgSlug, org, userId, log } = gated;

    const rawBody = await request.json();
    const parsed = bodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const modelMessages = convertToModelMessages(
      parsed.data.messages as UIMessage[]
    );

    const {
      model,
      modelId: MODEL_ID,
      providerOptions,
    } = await getAIModel({ reasoning: { effort: "medium" } }, aiEnv());

    const tools = buildAssistantTools({
      ctx: { organizationId: org.id, orgSlug },
      userRole: org.userRole,
    });

    const result = streamText({
      model,
      system: ASSISTANT_SYSTEM_PROMPT,
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(5),
      maxOutputTokens: 4000,
      providerOptions,
      onFinish: async ({ totalUsage }) => {
        try {
          await trackAiRequest({
            organizationId: org.id,
            userId,
            featureType: "ai_assistant",
            inputTokens: totalUsage.inputTokens,
            cachedInputTokens: totalUsage.cachedInputTokens,
            outputTokens: totalUsage.outputTokens,
            totalTokens: totalUsage.totalTokens,
            model: MODEL_ID,
          });
        } catch (err) {
          log.error({ err }, "Failed to track AI assistant usage");
        }
      },
    });

    return result.toUIMessageStreamResponse({ sendReasoning: true });
  } catch (error) {
    const log = createRequestLogger({
      path: ROUTE_PATH,
      method: "POST",
      orgSlug: (await context.params).orgSlug,
    });
    if (isProviderConfigError(error)) {
      // Operator-facing detail goes to the log, never to the response.
      log.error(
        { err: error, issues: error.issues },
        "AI provider is not configured for this deployment"
      );
      return NextResponse.json(
        { error: "AI is not configured for this deployment." },
        { status: 503 }
      );
    }
    log.error({ err: error }, "Error in AI assistant route");
    return NextResponse.json(
      { error: "Failed to process assistant request" },
      { status: 500 }
    );
  }
}
