import { gateway } from "@ai-sdk/gateway";
import type { JSONContent } from "@tiptap/core";
import { auth } from "@wraps/auth";
import { aiConversation, brandKit, db, templateVariable } from "@wraps/db";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { extractTipTapJson, validateTipTapJson } from "@/lib/ai/validator";
import { getOrganizationWithMembership } from "@/lib/organization";

type RouteContext = {
  params: Promise<{
    orgSlug: string;
  }>;
};

// POST /api/[orgSlug]/templates/ai/generate - Generate template content with AI
export async function POST(request: Request, context: RouteContext) {
  try {
    const { orgSlug } = await context.params;

    // Authenticate user
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify organization membership
    const orgWithMembership = await getOrganizationWithMembership(
      orgSlug,
      session.user.id
    );

    if (!orgWithMembership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const {
      messages,
      templateId,
      brandKitId,
      existingContent,
    }: {
      messages: UIMessage[];
      templateId?: string;
      brandKitId?: string;
      existingContent?: JSONContent;
    } = await request.json();

    if (!(messages && Array.isArray(messages)) || messages.length === 0) {
      return NextResponse.json(
        { error: "Messages are required" },
        { status: 400 }
      );
    }

    // Convert UI messages to model messages for the AI SDK
    const modelMessages = convertToModelMessages(messages);

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
      // Get default brand kit
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

    // Build system prompt
    const systemPrompt = buildSystemPrompt({
      brandKit: kit || undefined,
      availableVariables: variables.map((v) => ({
        name: v.name,
        label: v.label,
        type: v.type,
      })),
      existingContent: existingContent
        ? JSON.stringify(existingContent)
        : undefined,
    });

    // Stream the response
    const result = streamText({
      model: gateway("xai/grok-code-fast-1"),
      system: systemPrompt,
      messages: modelMessages,
      maxOutputTokens: 4096,
      temperature: 0.7,
      onFinish: async ({ text }) => {
        // Validate final output
        const json = extractTipTapJson(text);
        if (json) {
          const validation = validateTipTapJson(json);
          if (!validation.valid) {
            console.warn("AI output validation issues:", validation.errors);
          }
        }

        // Track conversation in database (async)
        trackConversation({
          organizationId: orgWithMembership.id,
          templateId,
          messages,
          userId: session.user.id,
        }).catch(console.error);
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("Error generating AI content:", error);
    return NextResponse.json(
      { error: "Failed to generate content" },
      { status: 500 }
    );
  }
}

// Track conversation for history and analytics
async function trackConversation(data: {
  organizationId: string;
  templateId?: string;
  messages: UIMessage[];
  userId: string;
}): Promise<void> {
  try {
    // Convert UIMessages to a simpler format for storage
    const simplifiedMessages = data.messages.map((m) => ({
      role: m.role,
      content: m.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join(""),
    }));

    await db.insert(aiConversation).values({
      organizationId: data.organizationId,
      templateId: data.templateId || null,
      messages: simplifiedMessages,
      createdBy: data.userId,
    });
  } catch (error) {
    console.error("Failed to track AI conversation:", error);
  }
}
