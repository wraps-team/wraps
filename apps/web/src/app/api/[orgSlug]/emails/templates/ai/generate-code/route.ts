import { getAIModel, isProviderConfigError } from "@wraps/ai";
import {
  aiConversation,
  brandKit,
  db,
  template,
  templateVariable,
} from "@wraps/db";
import {
  convertToModelMessages,
  streamText,
  type UIMessage,
  type UserContent,
} from "ai";
import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { resolveAIRequest } from "@/app/api/shared/ai-request";
import { aiEnv } from "@/lib/ai/env";
import { generateCodeBodySchema } from "@/lib/ai/generate-code-schema";
import { fetchAndProcessImage } from "@/lib/ai/image-utils";
import { buildReactEmailSystemPrompt } from "@/lib/ai/react-email-system-prompt";
import { createRequestLogger } from "@/lib/logger";
import { trackAiRequest } from "@/lib/usage/ai-usage";

const ROUTE_PATH = "/api/[orgSlug]/emails/templates/ai/generate-code";

type RouteContext = {
  params: Promise<{
    orgSlug: string;
  }>;
};

// POST /api/[orgSlug]/emails/templates/ai/generate-code - Generate React Email TSX with AI
export async function POST(request: Request, context: RouteContext) {
  try {
    const gated = await resolveAIRequest(context, {
      resource: "templates",
      permissions: ["write"],
      path: ROUTE_PATH,
    });
    if (!gated.ok) return gated.response;
    const { orgSlug, org: orgWithMembership, userId, log } = gated;

    const rawBody = await request.json();

    const parsed = generateCodeBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const {
      messages,
      templateId,
      conversationId,
      brandKitId,
      existingSource,
      imageUrl,
      imageBase64,
      imageMediaType,
    } = parsed.data as {
      messages: UIMessage[];
      templateId?: string;
      conversationId?: string;
      brandKitId?: string;
      existingSource?: string;
      imageUrl?: string;
      imageBase64?: string;
      imageMediaType?: string;
    };

    // Convert UI messages to model messages for the AI SDK
    const modelMessages = await convertToModelMessages(messages);

    // Resolved before the image block and the system prompt because both
    // depend on whether the configured provider can actually see images.
    const {
      model,
      modelId: MODEL_ID,
      providerOptions,
      capabilities,
    } = await getAIModel({ reasoning: { effort: "medium" } }, aiEnv());

    const requestedImage = Boolean(imageUrl || (imageBase64 && imageMediaType));
    const canUseImage = requestedImage && capabilities.has("vision");

    if (requestedImage && !canUseImage) {
      // Degrade rather than fail: drop the image and tell the prompt not to
      // reference one, mirroring how a failed image fetch is handled below.
      log.warn(
        { event: "ai.image_dropped_no_vision", model: MODEL_ID },
        "Configured model has no vision capability; generating without the image"
      );
    }

    const hasImage = canUseImage;
    if (hasImage) {
      try {
        let base64: string;
        let mediaType: string;

        if (imageBase64 && imageMediaType) {
          base64 = imageBase64;
          mediaType = imageMediaType;
        } else {
          const processedImage = await fetchAndProcessImage(imageUrl!);
          base64 = processedImage.base64;
          mediaType = processedImage.mediaType;
        }

        let lastUserIndex = -1;
        for (let i = modelMessages.length - 1; i >= 0; i--) {
          if (modelMessages[i].role === "user") {
            lastUserIndex = i;
            break;
          }
        }
        if (lastUserIndex !== -1) {
          const lastUserMsg = modelMessages[lastUserIndex];
          const existingText =
            typeof lastUserMsg.content === "string"
              ? lastUserMsg.content
              : Array.isArray(lastUserMsg.content)
                ? lastUserMsg.content
                    .filter(
                      (p): p is { type: "text"; text: string } =>
                        p.type === "text"
                    )
                    .map((p) => p.text)
                    .join("")
                : "";

          const newContent: UserContent = [
            {
              type: "file",
              data: base64,
              mediaType,
            },
            {
              type: "text",
              text: existingText,
            },
          ];

          modelMessages[lastUserIndex] = {
            role: "user" as const,
            content: newContent,
          };
        }
      } catch (imageError) {
        log.warn(
          { err: imageError },
          "Failed to process image, continuing without it"
        );
      }
    }

    // Load brand kit
    let kit = null;
    if (brandKitId) {
      kit = await db.query.brandKit.findFirst({
        where: and(
          eq(brandKit.id, brandKitId),
          eq(brandKit.organizationId, orgWithMembership.id)
        ),
      });
    } else {
      kit = await db.query.brandKit.findFirst({
        where: and(
          eq(brandKit.organizationId, orgWithMembership.id),
          eq(brandKit.isDefault, true)
        ),
      });
    }

    // Load available variables
    const variables = await db.query.templateVariable.findMany({
      where: eq(templateVariable.organizationId, orgWithMembership.id),
    });

    // Build system prompt for React Email TSX generation
    const systemPrompt = buildReactEmailSystemPrompt({
      brandKit: kit || undefined,
      availableVariables: variables.map((v) => ({
        name: v.name,
        label: v.label,
        type: v.type,
      })),
      existingSource,
      hasImageReference: !!hasImage,
    });

    const result = streamText({
      model,
      instructions: systemPrompt,
      messages: modelMessages,
      maxOutputTokens: 16_000,
      providerOptions,
      onEnd: async ({ text, usage }) => {
        // Append assistant response so full conversation is saved
        const messagesWithResponse: UIMessage[] = [
          ...messages,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            parts: [{ type: "text", text }],
          },
        ];

        // Await both tracking operations to ensure they complete before the
        // serverless function terminates
        const results = await Promise.allSettled([
          trackAiRequest({
            organizationId: orgWithMembership.id,
            userId,
            featureType: "ai_chat",
            templateId,
            inputTokens: usage?.inputTokens,
            cachedInputTokens: usage.inputTokenDetails.cacheReadTokens,
            outputTokens: usage?.outputTokens,
            totalTokens: usage?.totalTokens,
            model: MODEL_ID,
          }),
          trackConversation({
            organizationId: orgWithMembership.id,
            templateId,
            conversationId,
            messages: messagesWithResponse,
            userId,
          }),
        ]);

        for (const result of results) {
          if (result.status === "rejected") {
            log.error(
              { err: result.reason },
              "Failed to track AI usage or conversation"
            );
          }
        }
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
    log.error({ err: error }, "Error generating AI code content");
    return NextResponse.json(
      { error: "Failed to generate content" },
      { status: 500 }
    );
  }
}

// Upsert conversation — update existing or create new, link to template
async function trackConversation(data: {
  organizationId: string;
  templateId?: string;
  conversationId?: string;
  messages: UIMessage[];
  userId: string;
}): Promise<void> {
  const log = createRequestLogger({
    path: "/api/[orgSlug]/emails/templates/ai/generate-code",
    method: "POST",
    orgSlug: "system",
  });

  try {
    const simplifiedMessages = data.messages.map((m) => ({
      role: m.role,
      content: m.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join(""),
    }));

    if (data.conversationId) {
      // Update existing conversation
      await db
        .update(aiConversation)
        .set({
          messages: simplifiedMessages,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(aiConversation.id, data.conversationId),
            eq(aiConversation.organizationId, data.organizationId)
          )
        );
    } else {
      // Insert new conversation and link to template in a transaction
      // to prevent orphaned conversations from concurrent first messages
      await db.transaction(async (tx) => {
        // Re-check if template already has a conversation (race guard)
        if (data.templateId) {
          const existing = await tx.query.template.findFirst({
            where: and(
              eq(template.id, data.templateId),
              eq(template.organizationId, data.organizationId)
            ),
            columns: { aiConversationId: true },
          });

          if (existing?.aiConversationId) {
            // Another request already created a conversation — update it instead
            await tx
              .update(aiConversation)
              .set({
                messages: simplifiedMessages,
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(aiConversation.id, existing.aiConversationId),
                  eq(aiConversation.organizationId, data.organizationId)
                )
              );
            return;
          }
        }

        const [row] = await tx
          .insert(aiConversation)
          .values({
            organizationId: data.organizationId,
            templateId: data.templateId || null,
            messages: simplifiedMessages,
            createdBy: data.userId,
          })
          .returning({ id: aiConversation.id });

        if (row && data.templateId) {
          // Use raw SQL with WHERE ... IS NULL for atomic claim
          await tx.execute(
            sql`UPDATE ${template}
                SET ai_conversation_id = ${row.id}
                WHERE id = ${data.templateId}
                  AND organization_id = ${data.organizationId}
                  AND ai_conversation_id IS NULL`
          );
        }
      });
    }
  } catch (error) {
    log.error({ err: error }, "Failed to track AI conversation");
  }
}
