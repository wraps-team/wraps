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

// POST /api/[orgSlug]/brand-kits/[id]/default - Set brand kit as default
export async function POST(_request: Request, context: RouteContext) {
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

    // Check if brand kit exists
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

    // Unset current default
    await db
      .update(brandKit)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(brandKit.organizationId, orgWithMembership.id));

    // Set new default
    const [updated] = await db
      .update(brandKit)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(
        and(
          eq(brandKit.id, id),
          eq(brandKit.organizationId, orgWithMembership.id)
        )
      )
      .returning();

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error setting default brand kit:", error);
    return NextResponse.json(
      { error: "Failed to set default brand kit" },
      { status: 500 }
    );
  }
}
