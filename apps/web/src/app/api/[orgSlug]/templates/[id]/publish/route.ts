import { render } from "@react-email/render";
import type { JSONContent } from "@tiptap/core";
import { auth } from "@wraps/auth";
import { awsAccount, brandKit, db, template } from "@wraps/db";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getOrAssumeRole } from "@/lib/aws/credential-cache";
import {
  deleteSESTemplate,
  generateSESTemplateName,
  upsertSESTemplate,
} from "@/lib/aws/ses-templates";
import { getOrganizationWithMembership } from "@/lib/organization";
import { tiptapToReactEmail } from "@/lib/serializers/tiptap-to-react-email";

type RouteContext = {
  params: Promise<{
    orgSlug: string;
    id: string;
  }>;
};

// POST /api/[orgSlug]/templates/[id]/publish - Publish template to SES
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

    // Parse optional request body for brand kit selection
    let brandKitId: string | undefined;
    try {
      const body = await request.json();
      brandKitId = body.brandKitId;
    } catch {
      // No body provided, that's fine
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

    // Validate subject is set
    if (!templateData.subject) {
      return NextResponse.json(
        {
          error:
            "Template subject is required for publishing. Please set a subject line.",
        },
        { status: 400 }
      );
    }

    // Get the organization's AWS account
    const customerAwsAccount = await db.query.awsAccount.findFirst({
      where: eq(awsAccount.organizationId, orgWithMembership.id),
    });

    if (!customerAwsAccount) {
      return NextResponse.json(
        {
          error:
            "No AWS account connected. Please connect an AWS account first.",
        },
        { status: 400 }
      );
    }

    // Get credentials for the customer's AWS account
    const credentials = await getOrAssumeRole({
      roleArn: customerAwsAccount.roleArn,
      externalId: customerAwsAccount.externalId,
      region: customerAwsAccount.region,
    });

    // Fetch brand kit (use specified one or default for org)
    let selectedBrandKit = null;
    if (brandKitId) {
      selectedBrandKit = await db.query.brandKit.findFirst({
        where: and(
          eq(brandKit.id, brandKitId),
          eq(brandKit.organizationId, orgWithMembership.id)
        ),
      });
    } else {
      selectedBrandKit = await db.query.brandKit.findFirst({
        where: and(
          eq(brandKit.organizationId, orgWithMembership.id),
          eq(brandKit.isDefault, true)
        ),
      });
    }

    // Convert TipTap content to React Email component
    // Note: For SES templates, we keep variables as {{variableName}} for SES to substitute
    const emailComponent = tiptapToReactEmail(
      templateData.content as JSONContent,
      {}, // Empty data - keep variables as placeholders
      {
        brandKit: selectedBrandKit
          ? {
              primaryColor: selectedBrandKit.primaryColor,
              secondaryColor: selectedBrandKit.secondaryColor,
              backgroundColor: selectedBrandKit.backgroundColor,
              textColor: selectedBrandKit.textColor,
              fontFamily: selectedBrandKit.fontFamily,
              headingFontFamily:
                selectedBrandKit.headingFontFamily ?? undefined,
              buttonRadius: selectedBrandKit.buttonRadius,
            }
          : undefined,
      }
    );

    // Render to HTML
    const html = await render(emailComponent);

    // Generate plain text version
    const text = html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Generate SES template name
    const sesTemplateName = generateSESTemplateName(
      templateData.id,
      templateData.name
    );

    // Create or update SES template
    await upsertSESTemplate(credentials, customerAwsAccount.region, {
      templateName: sesTemplateName,
      subject: templateData.subject,
      htmlPart: html,
      textPart: text,
    });

    // Update template in our database
    const now = new Date();
    await db
      .update(template)
      .set({
        status: "PUBLISHED",
        sesTemplateName,
        publishedAt: now,
        compiledHtml: html,
        compiledText: text,
        updatedAt: now,
      })
      .where(eq(template.id, id));

    return NextResponse.json({
      success: true,
      sesTemplateName,
      publishedAt: now.toISOString(),
      message: `Template published to SES as "${sesTemplateName}"`,
    });
  } catch (error) {
    console.error("Error publishing template:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to publish template",
      },
      { status: 500 }
    );
  }
}

// DELETE /api/[orgSlug]/templates/[id]/publish - Unpublish template from SES
export async function DELETE(_request: Request, context: RouteContext) {
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

    if (!templateData.sesTemplateName) {
      return NextResponse.json(
        { error: "Template is not published to SES" },
        { status: 400 }
      );
    }

    // Get the organization's AWS account
    const customerAwsAccount = await db.query.awsAccount.findFirst({
      where: eq(awsAccount.organizationId, orgWithMembership.id),
    });

    if (!customerAwsAccount) {
      return NextResponse.json(
        { error: "No AWS account connected" },
        { status: 400 }
      );
    }

    // Get credentials for the customer's AWS account
    const credentials = await getOrAssumeRole({
      roleArn: customerAwsAccount.roleArn,
      externalId: customerAwsAccount.externalId,
      region: customerAwsAccount.region,
    });

    // Delete SES template
    await deleteSESTemplate(
      credentials,
      customerAwsAccount.region,
      templateData.sesTemplateName
    );

    // Update template in our database
    await db
      .update(template)
      .set({
        status: "DRAFT",
        sesTemplateName: null,
        publishedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(template.id, id));

    return NextResponse.json({
      success: true,
      message: "Template unpublished from SES",
    });
  } catch (error) {
    console.error("Error unpublishing template:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to unpublish template",
      },
      { status: 500 }
    );
  }
}
