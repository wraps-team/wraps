import { auth } from "@wraps/auth";
import { db, reusableBlock } from "@wraps/db";
import { and, desc, eq, or } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getOrganizationWithMembership } from "@/lib/organization";

type RouteContext = {
  params: Promise<{
    orgSlug: string;
  }>;
};

// GET /api/[orgSlug]/blocks - List all blocks
export async function GET(request: Request, context: RouteContext) {
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

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");

    // Build query conditions - include org blocks and public blocks
    const conditions = [
      or(
        eq(reusableBlock.organizationId, orgWithMembership.id),
        eq(reusableBlock.isPublic, true)
      ),
    ];

    if (category && category !== "all") {
      conditions.push(eq(reusableBlock.category, category));
    }

    const blocks = await db.query.reusableBlock.findMany({
      where: and(...conditions),
      orderBy: [desc(reusableBlock.usageCount), desc(reusableBlock.updatedAt)],
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

    return NextResponse.json(blocks);
  } catch (error) {
    console.error("Error fetching blocks:", error);
    return NextResponse.json(
      { error: "Failed to fetch blocks" },
      { status: 500 }
    );
  }
}

// POST /api/[orgSlug]/blocks - Create new block
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

    const { name, content, category, description } = await request.json();

    if (!name || typeof name !== "string") {
      return NextResponse.json(
        { error: "Block name is required" },
        { status: 400 }
      );
    }

    if (!content) {
      return NextResponse.json(
        { error: "Block content is required" },
        { status: 400 }
      );
    }

    // Create block
    const [newBlock] = await db
      .insert(reusableBlock)
      .values({
        organizationId: orgWithMembership.id,
        name: name.trim(),
        description: description?.trim() || null,
        category: category || "custom",
        content,
        createdBy: session.user.id,
      })
      .returning();

    return NextResponse.json(newBlock, { status: 201 });
  } catch (error) {
    console.error("Error creating block:", error);
    return NextResponse.json(
      { error: "Failed to create block" },
      { status: 500 }
    );
  }
}
