import { getAIModel, isProviderConfigError } from "@wraps/ai";
import { db, segment, template, topic } from "@wraps/db";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { resolveAIRequest } from "@/app/api/shared/ai-request";
import { buildWorkflowSystemPrompt } from "@/lib/ai/(ee)/workflow-system-prompt";
import { aiEnv } from "@/lib/ai/env";
import { createRequestLogger } from "@/lib/logger";
import { trackAiRequest } from "@/lib/usage/ai-usage";

const ROUTE_PATH = "/api/[orgSlug]/workflows/ai/generate";

type RouteContext = {
  params: Promise<{
    orgSlug: string;
  }>;
};

// POST /api/[orgSlug]/workflows/ai/generate - Generate workflow with AI
export async function POST(request: Request, context: RouteContext) {
  try {
    const gated = await resolveAIRequest(context, {
      resource: "workflows",
      permissions: ["write"],
      path: ROUTE_PATH,
    });
    if (!gated.ok) return gated.response;
    const { orgSlug, org: orgWithMembership, userId, log } = gated;

    const {
      messages,
      workflowId,
      existingWorkflow,
    }: {
      messages: UIMessage[];
      workflowId?: string;
      existingWorkflow?: {
        name: string;
        steps: unknown[];
        transitions: unknown[];
      };
    } = await request.json();

    if (!(messages && Array.isArray(messages)) || messages.length === 0) {
      return NextResponse.json(
        { error: "Messages are required" },
        { status: 400 }
      );
    }

    // Convert UI messages to model messages for the AI SDK
    const modelMessages = await convertToModelMessages(messages);

    // Fetch organization context for the AI
    const [templates, segments, topics] = await Promise.all([
      db.query.template.findMany({
        where: eq(template.organizationId, orgWithMembership.id),
        columns: {
          id: true,
          name: true,
          description: true,
          emailType: true,
        },
        orderBy: (t, { desc }) => [desc(t.updatedAt)],
        limit: 50, // Limit to avoid bloating the prompt
      }),
      db.query.segment.findMany({
        where: eq(segment.organizationId, orgWithMembership.id),
        columns: {
          id: true,
          name: true,
          description: true,
          memberCount: true,
        },
        orderBy: (s, { asc }) => [asc(s.name)],
        limit: 50,
      }),
      db.query.topic.findMany({
        where: eq(topic.organizationId, orgWithMembership.id),
        columns: {
          id: true,
          name: true,
          description: true,
        },
        orderBy: (t, { asc }) => [asc(t.name)],
        limit: 50,
      }),
    ]);

    // Build system prompt with organization context and existing workflow
    // existingWorkflow is sent from the client (like Template AI with editor.getJSON())
    const systemPrompt = buildWorkflowSystemPrompt({
      templates: templates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        emailType: t.emailType,
      })),
      segments: segments.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        memberCount: s.memberCount,
      })),
      topics: topics.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
      })),
      // Pass existing workflow for incremental updates (sent from client)
      existingWorkflow,
    });

    // No reasoning requested: this route never enabled extended thinking, and
    // A2 is a refactor. providerOptions resolves to undefined today but is
    // wired through so enabling it later is a one-line change here.
    const {
      model,
      modelId: MODEL_ID,
      providerOptions,
    } = await getAIModel({}, aiEnv());

    const result = streamText({
      model,
      instructions: systemPrompt,
      messages: modelMessages,
      maxOutputTokens: 8000,
      providerOptions,
      onEnd: async ({ usage }) => {
        // Awaited, not fire-and-forget: the serverless function can be frozen
        // the moment the stream ends, dropping an un-awaited write.
        await trackAiRequest({
          organizationId: orgWithMembership.id,
          userId,
          featureType: "workflow_ai",
          templateId: workflowId, // Repurpose field for workflowId
          inputTokens: usage?.inputTokens,
          cachedInputTokens: usage.inputTokenDetails.cacheReadTokens,
          outputTokens: usage?.outputTokens,
          totalTokens: usage?.totalTokens,
          model: MODEL_ID,
        }).catch((error) => {
          log.error({ err: error }, "Failed to track AI request");
        });
      },
    });

    // Stream with reasoning parts included
    return result.toUIMessageStreamResponse({
      sendReasoning: true,
    });
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
        { error: "AI generation is not configured for this deployment." },
        { status: 503 }
      );
    }
    log.error({ err: error }, "Error generating AI workflow");
    return NextResponse.json(
      { error: "Failed to generate workflow" },
      { status: 500 }
    );
  }
}
