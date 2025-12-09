import { auth } from "@wraps/auth";
import { brandKit, db } from "@wraps/db";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
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
    console.error("Error fetching brand kit:", error);
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

    const body = await request.json();

    const [updated] = await db
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

    if (!updated) {
      return NextResponse.json(
        { error: "Brand kit not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating brand kit:", error);
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

    // Delete the brand kit
    await db
      .delete(brandKit)
      .where(
        and(
          eq(brandKit.id, id),
          eq(brandKit.organizationId, orgWithMembership.id)
        )
      );

    // If we deleted the default, promote another kit to default
    if (kit.isDefault) {
      const remainingKit = await db.query.brandKit.findFirst({
        where: eq(brandKit.organizationId, orgWithMembership.id),
      });

      if (remainingKit) {
        await db
          .update(brandKit)
          .set({ isDefault: true })
          .where(eq(brandKit.id, remainingKit.id));
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting brand kit:", error);
    return NextResponse.json(
      { error: "Failed to delete brand kit" },
      { status: 500 }
    );
  }
}
