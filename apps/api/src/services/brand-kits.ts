/**
 * Brand kit reads and writes for the public API.
 *
 * Lifted from `apps/web/src/app/api/[orgSlug]/brand-kits/route.ts`,
 * `[id]/route.ts` (GET, PUT, DELETE) and `[id]/default/route.ts`. The Next
 * handlers are Next-only (`headers()`, `requireRoutePermission`, the session
 * from `auth.api.getSession`), so the query and audit logic is copied here
 * instead of imported. Behaviour (first kit becomes default, set-default clears
 * the others, delete promotes a remaining kit, audit actions and metadata,
 * create/update field defaults) matches the handlers.
 *
 * Deliberate differences, all validation the handlers do not do:
 * - PATCH refuses a blank name (the handler would store "").
 * - socialLinks entries need a non-empty platform and url.
 *
 * Every query is scoped by `organizationId`, including lookups by id.
 */

import { auditLog, brandKit, db, user } from "@wraps/db";
import { and, desc, eq } from "drizzle-orm";

export type BrandKitRow = typeof brandKit.$inferSelect;

export type ServiceFailure = {
  ok: false;
  status: 400 | 404;
  error: string;
};

export type ServiceResult<T> = { ok: true; value: T } | ServiceFailure;

/** The person behind the request. Mutations are audited against this. */
export type BrandKitActor = {
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
};

export type SocialLink = { platform: string; url: string };

/** Fields the create and PATCH bodies may carry. */
export type BrandKitFields = {
  name?: string;
  logoUrl?: string | null;
  primaryColor?: string;
  secondaryColor?: string;
  backgroundColor?: string;
  textColor?: string;
  fontFamily?: string;
  headingFontFamily?: string | null;
  buttonStyle?: string;
  buttonRadius?: string;
  companyName?: string | null;
  companyAddress?: string | null;
  socialLinks?: SocialLink[];
  sourceDomain?: string | null;
};

export type CreateBrandKitInput = BrandKitFields & {
  autoExtracted?: boolean;
  isDefault?: boolean;
};

const NOT_FOUND = "Brand kit not found";

function fail(status: ServiceFailure["status"], error: string): ServiceFailure {
  return { ok: false, status, error };
}

async function actorEmail(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row?.email ?? null;
}

function auditValues(
  organizationId: string,
  actor: BrandKitActor,
  email: string | null,
  entry: {
    action: string;
    resourceId: string;
    metadata: Record<string, unknown>;
  }
) {
  return {
    organizationId,
    userId: actor.userId,
    actorEmail: email,
    action: entry.action,
    resource: "brand_kit",
    resourceId: entry.resourceId,
    metadata: entry.metadata,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  };
}

/**
 * Returns the reason a socialLinks array is unusable, or null. The handler
 * stores whatever it is given; an entry with a blank platform or url is not
 * a link an agent can use, so it is refused with a named 400.
 */
export function socialLinksError(
  links: SocialLink[] | undefined
): string | null {
  if (!links) {
    return null;
  }
  for (const link of links) {
    if (link.platform.trim().length === 0 || link.url.trim().length === 0) {
      return "socialLinks entries need a non-empty platform and url";
    }
  }
  return null;
}

/**
 * Every kit in the org, default first, then most recently updated. The
 * handler is unpaginated and so is this: the dashboard shows the full set.
 */
export function listBrandKitsForOrg(
  organizationId: string
): Promise<BrandKitRow[]> {
  return db.query.brandKit.findMany({
    where: eq(brandKit.organizationId, organizationId),
    orderBy: [desc(brandKit.isDefault), desc(brandKit.updatedAt)],
  });
}

export async function getBrandKitForOrg(
  organizationId: string,
  kitId: string
): Promise<BrandKitRow | null> {
  const kit = await db.query.brandKit.findFirst({
    where: and(
      eq(brandKit.id, kitId),
      eq(brandKit.organizationId, organizationId)
    ),
  });
  return kit ?? null;
}

/**
 * Creates a kit. The first kit in the org is always the default. Otherwise
 * the new kit is the default only when `isDefault` is true, which clears the
 * previous default in the same transaction as the insert and the audit row.
 */
export async function createBrandKitForOrg(
  organizationId: string,
  actor: BrandKitActor,
  data: CreateBrandKitInput
): Promise<ServiceResult<BrandKitRow>> {
  const linkError = socialLinksError(data.socialLinks);
  if (linkError) {
    return fail(400, linkError);
  }

  const existing = await db.query.brandKit.findFirst({
    where: eq(brandKit.organizationId, organizationId),
  });
  const isDefault = !existing || data.isDefault === true;
  const email = await actorEmail(actor.userId);

  const created = await db.transaction(async (tx) => {
    if (isDefault) {
      await tx
        .update(brandKit)
        .set({ isDefault: false })
        .where(eq(brandKit.organizationId, organizationId));
    }

    const [r] = await tx
      .insert(brandKit)
      .values({
        organizationId,
        name: data.name?.trim() || "Untitled Brand Kit",
        logoUrl: data.logoUrl || null,
        primaryColor: data.primaryColor || "#5046e5",
        secondaryColor: data.secondaryColor || "#6366f1",
        backgroundColor: data.backgroundColor || "#ffffff",
        textColor: data.textColor || "#1f2937",
        fontFamily: data.fontFamily || "system-ui, sans-serif",
        headingFontFamily: data.headingFontFamily || null,
        buttonStyle: data.buttonStyle || "rounded",
        buttonRadius: data.buttonRadius || "4px",
        companyName: data.companyName || null,
        companyAddress: data.companyAddress || null,
        socialLinks: data.socialLinks || [],
        sourceDomain: data.sourceDomain || null,
        autoExtracted: data.autoExtracted,
        isDefault,
      })
      .returning();

    await tx.insert(auditLog).values(
      auditValues(organizationId, actor, email, {
        action: "brand_kit.created",
        resourceId: r.id,
        metadata: { brandKitId: r.id, name: r.name },
      })
    );
    return r;
  });

  return { ok: true, value: created };
}

/**
 * Partial update: only the fields present in `data` change. `updatedAt` is
 * always bumped, as the handler's PUT does. Default status is not changed
 * here; use `setDefaultBrandKitForOrg`.
 */
export async function updateBrandKitForOrg(
  organizationId: string,
  actor: BrandKitActor,
  kitId: string,
  data: BrandKitFields
): Promise<ServiceResult<BrandKitRow>> {
  if (data.name !== undefined && data.name.trim().length === 0) {
    return fail(400, "Brand kit name cannot be empty");
  }
  const linkError = socialLinksError(data.socialLinks);
  if (linkError) {
    return fail(400, linkError);
  }

  const patch: Partial<typeof brandKit.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (data.name !== undefined) patch.name = data.name.trim();
  if (data.logoUrl !== undefined) patch.logoUrl = data.logoUrl || null;
  if (data.primaryColor !== undefined) patch.primaryColor = data.primaryColor;
  if (data.secondaryColor !== undefined) {
    patch.secondaryColor = data.secondaryColor;
  }
  if (data.backgroundColor !== undefined) {
    patch.backgroundColor = data.backgroundColor;
  }
  if (data.textColor !== undefined) patch.textColor = data.textColor;
  if (data.fontFamily !== undefined) patch.fontFamily = data.fontFamily;
  if (data.headingFontFamily !== undefined) {
    patch.headingFontFamily = data.headingFontFamily || null;
  }
  if (data.buttonStyle !== undefined) patch.buttonStyle = data.buttonStyle;
  if (data.buttonRadius !== undefined) patch.buttonRadius = data.buttonRadius;
  if (data.companyName !== undefined) {
    patch.companyName = data.companyName || null;
  }
  if (data.companyAddress !== undefined) {
    patch.companyAddress = data.companyAddress || null;
  }
  if (data.socialLinks !== undefined) patch.socialLinks = data.socialLinks;
  if (data.sourceDomain !== undefined) {
    patch.sourceDomain = data.sourceDomain || null;
  }

  const email = await actorEmail(actor.userId);
  const updated = await db.transaction(async (tx) => {
    const [r] = await tx
      .update(brandKit)
      .set(patch)
      .where(
        and(eq(brandKit.id, kitId), eq(brandKit.organizationId, organizationId))
      )
      .returning();
    if (!r) {
      return null;
    }
    await tx.insert(auditLog).values(
      auditValues(organizationId, actor, email, {
        action: "brand_kit.updated",
        resourceId: r.id,
        metadata: { brandKitId: r.id, name: r.name },
      })
    );
    return r;
  });

  if (!updated) {
    return fail(404, NOT_FOUND);
  }
  return { ok: true, value: updated };
}

/**
 * Deletes a kit. If it was the default, another kit in the org (whichever the
 * database returns first, as the handler does) is promoted. Templates that
 * used the kit keep their row: `template.brand_kit_id` is `ON DELETE SET NULL`.
 */
export async function deleteBrandKitForOrg(
  organizationId: string,
  actor: BrandKitActor,
  kitId: string
): Promise<ServiceResult<{ id: string }>> {
  const kit = await getBrandKitForOrg(organizationId, kitId);
  if (!kit) {
    return fail(404, NOT_FOUND);
  }
  const email = await actorEmail(actor.userId);

  await db.transaction(async (tx) => {
    await tx
      .delete(brandKit)
      .where(
        and(eq(brandKit.id, kitId), eq(brandKit.organizationId, organizationId))
      );

    if (kit.isDefault) {
      const remaining = await tx.query.brandKit.findFirst({
        where: eq(brandKit.organizationId, organizationId),
      });
      if (remaining) {
        await tx
          .update(brandKit)
          .set({ isDefault: true })
          .where(
            and(
              eq(brandKit.id, remaining.id),
              eq(brandKit.organizationId, organizationId)
            )
          );
      }
    }

    await tx.insert(auditLog).values(
      auditValues(organizationId, actor, email, {
        action: "brand_kit.deleted",
        resourceId: kitId,
        metadata: { brandKitId: kitId, name: kit.name },
      })
    );
  });

  return { ok: true, value: { id: kitId } };
}

/** Makes one kit the org's only default, in one transaction with the audit row. */
export async function setDefaultBrandKitForOrg(
  organizationId: string,
  actor: BrandKitActor,
  kitId: string
): Promise<ServiceResult<BrandKitRow>> {
  const kit = await getBrandKitForOrg(organizationId, kitId);
  if (!kit) {
    return fail(404, NOT_FOUND);
  }
  const email = await actorEmail(actor.userId);

  const updated = await db.transaction(async (tx) => {
    await tx
      .update(brandKit)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(brandKit.organizationId, organizationId));

    const [r] = await tx
      .update(brandKit)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(
        and(eq(brandKit.id, kitId), eq(brandKit.organizationId, organizationId))
      )
      .returning();

    await tx.insert(auditLog).values(
      auditValues(organizationId, actor, email, {
        action: "brand_kit.set_default",
        resourceId: kitId,
        metadata: { brandKitId: kitId, name: kit.name },
      })
    );
    return r ?? null;
  });

  if (!updated) {
    return fail(404, NOT_FOUND);
  }
  return { ok: true, value: updated };
}
