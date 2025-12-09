import { auth } from "@wraps/auth";
import { db, template, templateVersion } from "@wraps/db";
import { and, desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getOrganizationWithMembership } from "@/lib/organization";

type RouteContext = {
  params: Promise<{
    orgSlug: string;
    id: string;
    versionId: string;
  }>;
};

// GET /api/[orgSlug]/templates/[id]/versions/[versionId] - Get single version
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { orgSlug, id, versionId } = await context.params;

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

    // Verify template exists and belongs to org
    const existingTemplate = await db.query.template.findFirst({
      where: and(
        eq(template.id, id),
        eq(template.organizationId, orgWithMembership.id)
      ),
      columns: { id: true },
    });

    if (!existingTemplate) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    // Get version
    const version = await db.query.templateVersion.findFirst({
      where: and(
        eq(templateVersion.id, versionId),
        eq(templateVersion.templateId, id)
      ),
      with: {
        createdByUser: {
          columns: {
            id: true,
            name: true,
            image: true,
          },
        },
      },
    });

    if (!version) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }

    return NextResponse.json(version);
  } catch (error) {
    console.error("Error fetching version:", error);
    return NextResponse.json(
      { error: "Failed to fetch version" },
      { status: 500 }
    );
  }
}

// POST /api/[orgSlug]/templates/[id]/versions/[versionId] - Restore to this version
export async function POST(_request: Request, context: RouteContext) {
  try {
    const { orgSlug, id, versionId } = await context.params;

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

    // Get version to restore
    const versionToRestore = await db.query.templateVersion.findFirst({
      where: and(
        eq(templateVersion.id, versionId),
        eq(templateVersion.templateId, id)
      ),
    });

    if (!versionToRestore) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }

    // Verify template belongs to org
    const existingTemplate = await db.query.template.findFirst({
      where: and(
        eq(template.id, id),
        eq(template.organizationId, orgWithMembership.id)
      ),
    });

    if (!existingTemplate) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    // Get the latest version number for creating a new version
    const versions = await db.query.templateVersion.findMany({
      where: eq(templateVersion.templateId, id),
      orderBy: [desc(templateVersion.version)],
      limit: 1,
    });

    const nextVersion = versions[0] ? versions[0].version + 1 : 1;

    // Create a new version with current content before restoring (backup)
    await db.insert(templateVersion).values({
      templateId: id,
      content: existingTemplate.content,
      version: nextVersion,
      createdBy: session.user.id,
      changeNote: `Backup before restoring to v${versionToRestore.version}`,
    });

    // Update template with restored content
    const [updated] = await db
      .update(template)
      .set({
        content: versionToRestore.content,
        updatedAt: new Date(),
        lastEditedBy: session.user.id,
      })
      .where(
        and(
          eq(template.id, id),
          eq(template.organizationId, orgWithMembership.id)
        )
      )
      .returning();

    // Create a version for the restore
    await db.insert(templateVersion).values({
      templateId: id,
      content: versionToRestore.content,
      version: nextVersion + 1,
      createdBy: session.user.id,
      changeNote: `Restored from v${versionToRestore.version}`,
    });

    return NextResponse.json({
      success: true,
      template: updated,
      restoredFromVersion: versionToRestore.version,
    });
  } catch (error) {
    console.error("Error restoring version:", error);
    return NextResponse.json(
      { error: "Failed to restore version" },
      { status: 500 }
    );
  }
}
