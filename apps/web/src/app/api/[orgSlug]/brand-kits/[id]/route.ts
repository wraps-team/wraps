import { auth } from "@wraps/auth";
import { auditLog, brandKit, db } from "@wraps/db";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { requireRoutePermission } from "@/app/api/shared/route-permission";
import { auditLogEntry, getAuditContext } from "@/lib/audit";
import { createRequestLogger } from "@/lib/logger";
import { getOrganizationWithMembership } from "@/lib/organization";

type RouteContext = {
  params: Promise<{
    orgSlug: string;
    id: string;
  }>;
};

// GET /api/[orgSlug]/brand-kits/[id] - Get single brand kit
export async function GET(_request: Request, context: RouteContext) {
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

    const kit = await db.query.brandKit.findFirst({
      where: and(
        eq(brandKit.id, id),
        eq(brandKit.organizationId, orgWithMembership.id)
      ),
    });

    if (!kit) {
      return NextResponse.json(
        { error: "Brand kit not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(kit);
  } catch (error) {
    const log = createRequestLogger({
      path: "/api/[orgSlug]/brand-kits/[id]",
      method: "GET",
    });
    log.error({ err: error }, "Error fetching brand kit");
    return NextResponse.json(
      { error: "Failed to fetch brand kit" },
      { status: 500 }
    );
  }
}

// PUT /api/[orgSlug]/brand-kits/[id] - Update brand kit
export async function PUT(request: Request, context: RouteContext) {
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

    const denied = requireRoutePermission(
      orgWithMembership.userRole,
      "templates",
      ["write"]
    );
    if (denied) return denied;

    const body = await request.json();

    const auditCtx = await getAuditContext();

    const [updated] = await db.transaction(async (tx) => {
      const [r] = await tx
        .update(brandKit)
        .set({
          ...(body.name !== undefined && { name: body.name.trim() }),
          ...(body.logoUrl !== undefined && { logoUrl: body.logoUrl || null }),
          ...(body.primaryColor !== undefined && {
            primaryColor: body.primaryColor,
          }),
          ...(body.secondaryColor !== undefined && {
            secondaryColor: body.secondaryColor,
          }),
          ...(body.backgroundColor !== undefined && {
            backgroundColor: body.backgroundColor,
          }),
          ...(body.textColor !== undefined && { textColor: body.textColor }),
          ...(body.fontFamily !== undefined && { fontFamily: body.fontFamily }),
          ...(body.headingFontFamily !== undefined && {
            headingFontFamily: body.headingFontFamily || null,
          }),
          ...(body.buttonStyle !== undefined && {
            buttonStyle: body.buttonStyle,
          }),
          ...(body.buttonRadius !== undefined && {
            buttonRadius: body.buttonRadius,
          }),
          ...(body.companyName !== undefined && {
            companyName: body.companyName || null,
          }),
          ...(body.companyAddress !== undefined && {
            companyAddress: body.companyAddress || null,
          }),
          ...(body.socialLinks !== undefined && {
            socialLinks: body.socialLinks,
          }),
          ...(body.sourceDomain !== undefined && {
            sourceDomain: body.sourceDomain || null,
          }),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(brandKit.id, id),
            eq(brandKit.organizationId, orgWithMembership.id)
          )
        )
        .returning();

      if (!r) return [r];

      await tx.insert(auditLog).values(
        auditLogEntry(auditCtx, {
          organizationId: orgWithMembership.id,
          actorId: session.user.id,
          actorEmail: session.user.email,
          action: "brand_kit.updated",
          resource: "brand_kit",
          resourceId: r.id,
          metadata: { brandKitId: r.id, name: r.name },
        })
      );

      return [r];
    });

    if (!updated) {
      return NextResponse.json(
        { error: "Brand kit not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(updated);
  } catch (error) {
    const log = createRequestLogger({
      path: "/api/[orgSlug]/brand-kits/[id]",
      method: "PUT",
    });
    log.error({ err: error }, "Error updating brand kit");
    return NextResponse.json(
      { error: "Failed to update brand kit" },
      { status: 500 }
    );
  }
}

// DELETE /api/[orgSlug]/brand-kits/[id] - Delete brand kit
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

    const denied = requireRoutePermission(
      orgWithMembership.userRole,
      "templates",
      ["write"]
    );
    if (denied) return denied;

    // Get the brand kit to delete
    const kit = await db.query.brandKit.findFirst({
      where: and(
        eq(brandKit.id, id),
        eq(brandKit.organizationId, orgWithMembership.id)
      ),
    });

    if (!kit) {
      return NextResponse.json(
        { error: "Brand kit not found" },
        { status: 404 }
      );
    }

    const auditCtx = await getAuditContext();

    // Delete brand kit, promote new default if needed, and write audit log in one transaction
    await db.transaction(async (tx) => {
      await tx
        .delete(brandKit)
        .where(
          and(
            eq(brandKit.id, id),
            eq(brandKit.organizationId, orgWithMembership.id)
          )
        );

      // If we deleted the default, promote another kit to default
      if (kit.isDefault) {
        const remainingKit = await tx.query.brandKit.findFirst({
          where: eq(brandKit.organizationId, orgWithMembership.id),
        });

        if (remainingKit) {
          await tx
            .update(brandKit)
            .set({ isDefault: true })
            .where(
              and(
                eq(brandKit.id, remainingKit.id),
                eq(brandKit.organizationId, orgWithMembership.id)
              )
            );
        }
      }

      await tx.insert(auditLog).values(
        auditLogEntry(auditCtx, {
          organizationId: orgWithMembership.id,
          actorId: session.user.id,
          actorEmail: session.user.email,
          action: "brand_kit.deleted",
          resource: "brand_kit",
          resourceId: id,
          metadata: { brandKitId: id, name: kit.name },
        })
      );
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const log = createRequestLogger({
      path: "/api/[orgSlug]/brand-kits/[id]",
      method: "DELETE",
    });
    log.error({ err: error }, "Error deleting brand kit");
    return NextResponse.json(
      { error: "Failed to delete brand kit" },
      { status: 500 }
    );
  }
}
