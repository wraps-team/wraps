"use server";

import { auth } from "@wraps/auth";
import { db } from "@wraps/db";
import { organization } from "@wraps/db/schema/auth";
import { revalidatePath } from "next/cache";
import {
  type CreateOrganizationInput,
  createOrganizationSchema,
} from "@/lib/forms/create-organization";
import { generateSlug } from "@/lib/organization";

export type CreateOrganizationResult =
  | {
      success: true;
      organization: {
        id: string;
        name: string;
        slug: string;
      };
    }
  | {
      success: false;
      error: string;
      field?: string;
    };

export async function createOrganizationAction(
  data: CreateOrganizationInput
): Promise<CreateOrganizationResult> {
  try {
    // 1. Get session
    const session = await auth.api.getSession({
      headers: await import("next/headers").then((mod) => mod.headers()),
    });

    if (!session?.user) {
      return {
        success: false,
        error: "You must be logged in to create an organization",
      };
    }

    // 2. Validate input
    const validationResult = createOrganizationSchema.safeParse(data);
    if (!validationResult.success) {
      const firstError = validationResult.error.issues[0];
      return {
        success: false,
        error: firstError.message,
        field: firstError.path[0]?.toString(),
      };
    }

    const { name, slug: customSlug } = validationResult.data;

    // 3. Generate slug if not provided
    const slug = customSlug || generateSlug(name);

    // 4. Check if slug already exists
    const existingOrg = await db.query.organization.findFirst({
      where: (orgs, { eq }) => eq(orgs.slug, slug),
    });

    if (existingOrg) {
      return {
        success: false,
        error: "An organization with this slug already exists",
        field: "slug",
      };
    }

    // 5. Create organization in database
    const [newOrg] = await db
      .insert(organization)
      .values({
        id: crypto.randomUUID(),
        name,
        slug,
        createdAt: new Date(),
      })
      .returning();

    if (!newOrg) {
      return {
        success: false,
        error: "Failed to create organization",
      };
    }

    // 6. Create membership for the creator as owner
    const { member } = await import("@wraps/db/schema/auth");
    await db.insert(member).values({
      id: crypto.randomUUID(),
      organizationId: newOrg.id,
      userId: session.user.id,
      role: "owner",
      createdAt: new Date(),
    });

    // 7. Set as active organization
    const { session: sessionTable } = await import("@wraps/db/schema/auth");
    const { eq } = await import("drizzle-orm");
    await db
      .update(sessionTable)
      .set({ activeOrganizationId: newOrg.id })
      .where(eq(sessionTable.userId, session.user.id));

    // 8. Revalidate paths
    revalidatePath("/dashboard");
    revalidatePath(`/${slug}`);

    // 9. Return success
    return {
      success: true,
      organization: {
        id: newOrg.id,
        name: newOrg.name,
        slug,
      },
    };
  } catch (error) {
    console.error("Error creating organization:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
}
