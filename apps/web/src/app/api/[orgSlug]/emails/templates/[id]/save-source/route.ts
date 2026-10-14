import { createHash } from "node:crypto";
import { auth } from "@wraps/auth";
import { auditLog, db, template, templateVersion } from "@wraps/db";
import { and, desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRoutePermission } from "@/app/api/shared/route-permission";
import { auditLogEntry, getAuditContext } from "@/lib/audit";
import { createRequestLogger } from "@/lib/logger";
import { getOrganizationWithMembership } from "@/lib/organization";

const saveSourceSchema = z
  .object({
    source: z.string().min(1),
    compiledHtml: z.string().min(1),
    compiledText: z.string().optional().default(""),
    variables: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .default([]),
    testData: z.record(z.string(), z.unknown()).optional().default({}),
  })
  .strict();

type RouteContext = {
  params: Promise<{
    orgSlug: string;
    id: string;
  }>;
};

// POST /api/[orgSlug]/emails/templates/[id]/save-source - Save edited source + compiled output
export async function POST(request: Request, context: RouteContext) {
  const { orgSlug, id } = await context.params;
  const log = createRequestLogger({
    path: `/api/${orgSlug}/emails/templates/${id}/save-source`,
    method: "POST",
    orgSlug,
  });

  try {
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

    const denied = requireRoutePermission(
      orgWithMembership.userRole,
      "templates",
      ["write"]
    );
    if (denied) return denied;

    // Verify template exists and is a code template
    const existing = await db.query.template.findFirst({
      where: and(
        eq(template.id, id),
        eq(template.organizationId, orgWithMembership.id)
      ),
      columns: { id: true, sourceFormat: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    if (existing.sourceFormat !== "react-email") {
      return NextResponse.json(
        { error: "Only react-email templates can be saved via this endpoint" },
        { status: 400 }
      );
    }

    const rawBody = await request.json();
    const parsed = saveSourceSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { source, compiledHtml, compiledText, variables, testData } =
      parsed.data;

    // Reject oversized testData payloads (DoS protection — the column is
    // jsonb with no built-in size limit and the schema accepts any shape).
    const TEST_DATA_MAX_BYTES = 64 * 1024;
    if (JSON.stringify(testData).length > TEST_DATA_MAX_BYTES) {
      return NextResponse.json(
        { error: "testData exceeds the 64KB limit" },
        { status: 413 }
      );
    }

    // Compute source hash
    const sourceHash = createHash("sha256").update(source).digest("hex");

    const auditCtx = await getAuditContext();

    // Update template, version and audit row in one transaction
    const now = new Date();
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(template)
        .set({
          source,
          sourceHash,
          compiledHtml,
          compiledText,
          variables: variables as Record<string, unknown>[],
          testData,
          lastEditedFrom: "dashboard",
          lastEditedBy: session.user.id,
          updatedAt: now,
        })
        .where(
          and(
            eq(template.id, id),
            eq(template.organizationId, orgWithMembership.id)
          )
        )
        .returning();

      if (!row) return;

      // Auto-create version if source changed from last version
      const latestVersion = await tx.query.templateVersion.findFirst({
        where: eq(templateVersion.templateId, id),
        orderBy: [desc(templateVersion.version)],
        columns: { version: true, source: true },
      });

      if (!latestVersion || latestVersion.source !== source) {
        const nextVersion = latestVersion ? latestVersion.version + 1 : 1;
        await tx.insert(templateVersion).values({
          templateId: id,
          content: row.content,
          source,
          compiledHtml,
          version: nextVersion,
          createdBy: session.user.id,
          changeNote: null,
        });
      }

      await tx.insert(auditLog).values(
        auditLogEntry(auditCtx, {
          organizationId: orgWithMembership.id,
          actorId: session.user.id,
          actorEmail: session.user.email,
          action: "template.updated",
          resource: "template",
          resourceId: id,
          metadata: { templateId: id, name: row.name, via: "code-editor" },
        })
      );

      return row;
    });

    if (!updated) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      template: updated,
    });
  } catch (error) {
    log.error({ err: error }, "Failed to save template source");
    return NextResponse.json(
      { error: "Failed to save template source" },
      { status: 500 }
    );
  }
}
