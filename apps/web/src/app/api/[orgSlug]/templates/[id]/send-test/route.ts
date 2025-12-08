import { render } from "@react-email/render";
import { auth } from "@wraps/auth";
import { db, template } from "@wraps/db";
import { WrapsEmail } from "@wraps.dev/email";
import type { JSONContent } from "@tiptap/core";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getOrganizationWithMembership } from "@/lib/organization";
import { tiptapToReactEmail } from "@/lib/serializers/tiptap-to-react-email";

type RouteContext = {
  params: Promise<{
    orgSlug: string;
    id: string;
  }>;
};

// POST /api/[orgSlug]/templates/[id]/send-test - Send test email
export async function POST(request: Request, context: RouteContext) {
  try {
    const { orgSlug, id } = await context.params;

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

    // Parse request body
    const body = await request.json();
    const {
      recipients,
      subject,
      testData = {},
      from,
      previewText,
    } = body as {
      recipients: string[];
      subject: string;
      testData?: Record<string, unknown>;
      from?: string;
      previewText?: string;
    };

    // Validate required fields
    if (!recipients || recipients.length === 0) {
      return NextResponse.json(
        { error: "At least one recipient is required" },
        { status: 400 }
      );
    }

    if (!subject) {
      return NextResponse.json(
        { error: "Subject is required" },
        { status: 400 }
      );
    }

    // Validate email format for all recipients
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = recipients.filter((email: string) => !emailRegex.test(email));
    if (invalidEmails.length > 0) {
      return NextResponse.json(
        { error: `Invalid email addresses: ${invalidEmails.join(", ")}` },
        { status: 400 }
      );
    }

    // Fetch template
    const templateData = await db.query.template.findFirst({
      where: and(
        eq(template.id, id),
        eq(template.organizationId, orgWithMembership.id)
      ),
    });

    if (!templateData) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    // Merge template's test data with provided test data
    const mergedTestData = {
      ...(templateData.testData as Record<string, unknown> || {}),
      ...testData,
    };

    // Convert TipTap content to React Email component
    const emailComponent = tiptapToReactEmail(
      templateData.content as JSONContent,
      mergedTestData,
      { previewText }
    );

    // Render to HTML
    const html = await render(emailComponent);

    // Generate plain text version (simple strip of HTML tags)
    const text = html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Initialize Wraps SDK
    // The SDK will use the organization's AWS credentials configured in Wraps
    const wraps = new WrapsEmail();

    // Determine sender address
    // Use provided 'from' or default to organization's verified domain
    const senderEmail = from || `test@${orgWithMembership.slug}.wraps.dev`;

    // Send to each recipient
    const results = await Promise.allSettled(
      recipients.map(async (recipient: string) => {
        const result = await wraps.send({
          from: senderEmail,
          to: recipient,
          subject,
          html,
          text,
        });
        return { recipient, messageId: result.messageId };
      })
    );

    // Process results
    const successful: string[] = [];
    const failed: { recipient: string; error: string }[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const recipient = recipients[i];

      if (result.status === "fulfilled") {
        successful.push(recipient);
      } else {
        failed.push({
          recipient,
          error: result.reason?.message || "Failed to send",
        });
      }
    }

    return NextResponse.json({
      success: failed.length === 0,
      sent: successful.length,
      failed: failed.length,
      details: {
        successful,
        failed,
      },
    });
  } catch (error) {
    console.error("Error sending test email:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to send test email",
      },
      { status: 500 }
    );
  }
}
