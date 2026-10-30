/**
 * Brand Kit Routes
 *
 * CRUD for brand kits, plus setting the org's default kit. Lifted from the
 * dashboard's Next route handlers under `apps/web/src/app/api/[orgSlug]/brand-kits`.
 *
 * GET    /v1/brand-kits              - List every brand kit (unpaginated)
 * GET    /v1/brand-kits/:id          - Get a single brand kit
 * POST   /v1/brand-kits              - Create a brand kit
 * PATCH  /v1/brand-kits/:id          - Partially update a brand kit
 * DELETE /v1/brand-kits/:id          - Delete a brand kit (requires confirm=true)
 * POST   /v1/brand-kits/:id/default  - Make a brand kit the org's default
 *
 * Reads need membership only, as the handlers do. Writes need `templates:write`,
 * the same pair the dashboard handlers check.
 *
 * Not built: `extract` (server-side fetch of a URL) and `from-template`.
 */

import { t } from "elysia";
import { requirePermission } from "../lib/require-permission";
import { createAuthenticatedRoutes, getAuth } from "../middleware/auth";
import {
  type BrandKitActor,
  type BrandKitRow,
  createBrandKitForOrg,
  deleteBrandKitForOrg,
  getBrandKitForOrg,
  listBrandKitsForOrg,
  setDefaultBrandKitForOrg,
  updateBrandKitForOrg,
} from "../services/brand-kits";

const errorResponse = t.Object({ error: t.String() });

const nullableString = t.Union([t.String(), t.Null()]);

const socialLinkSchema = t.Object({
  platform: t.String(),
  url: t.String(),
});

const brandKitSchema = t.Object({
  id: t.String(),
  organizationId: t.String(),
  name: t.String(),
  logoUrl: nullableString,
  primaryColor: t.String(),
  secondaryColor: t.String(),
  backgroundColor: t.String(),
  textColor: t.String(),
  fontFamily: t.String(),
  headingFontFamily: nullableString,
  buttonStyle: t.String({
    description: "Dashboard values: rounded, square or pill.",
  }),
  buttonRadius: t.String(),
  companyName: nullableString,
  companyAddress: nullableString,
  socialLinks: t.Array(socialLinkSchema),
  sourceDomain: nullableString,
  autoExtracted: t.Boolean(),
  isDefault: t.Boolean({
    description: "True for exactly one kit per organization, when any exist.",
  }),
  createdAt: t.String(),
  updatedAt: t.String(),
});

/** Fields shared by create and PATCH. Every one is optional on the wire. */
const brandFields = {
  name: t.Optional(t.String()),
  logoUrl: t.Optional(nullableString),
  primaryColor: t.Optional(t.String()),
  secondaryColor: t.Optional(t.String()),
  backgroundColor: t.Optional(t.String()),
  textColor: t.Optional(t.String()),
  fontFamily: t.Optional(t.String()),
  headingFontFamily: t.Optional(nullableString),
  buttonStyle: t.Optional(t.String()),
  buttonRadius: t.Optional(t.String()),
  companyName: t.Optional(nullableString),
  companyAddress: t.Optional(nullableString),
  socialLinks: t.Optional(t.Array(socialLinkSchema)),
  sourceDomain: t.Optional(nullableString),
};

const createBody = t.Object({
  ...brandFields,
  autoExtracted: t.Optional(t.Boolean()),
  isDefault: t.Optional(
    t.Boolean({
      description:
        "The first kit in an organization is always the default. Otherwise pass true to make this kit the default.",
    })
  ),
});

// PATCH cannot set autoExtracted or isDefault; use POST /:id/default for that.
const patchBody = t.Object(brandFields);

function toBrandKitResponse(row: BrandKitRow) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    logoUrl: row.logoUrl,
    primaryColor: row.primaryColor,
    secondaryColor: row.secondaryColor,
    backgroundColor: row.backgroundColor,
    textColor: row.textColor,
    fontFamily: row.fontFamily,
    headingFontFamily: row.headingFontFamily,
    buttonStyle: row.buttonStyle,
    buttonRadius: row.buttonRadius,
    companyName: row.companyName,
    companyAddress: row.companyAddress,
    socialLinks: row.socialLinks ?? [],
    sourceDomain: row.sourceDomain,
    autoExtracted: row.autoExtracted,
    isDefault: row.isDefault,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function actorFrom(ctx: { request: Request }, userId: string): BrandKitActor {
  const forwarded = ctx.request.headers.get("x-forwarded-for");
  return {
    userId,
    ipAddress: forwarded ? forwarded.split(",")[0].trim() : null,
    userAgent: ctx.request.headers.get("user-agent"),
  };
}

const PERMISSION_RESOURCE = "templates" as const;

export const brandKitsRoutes = createAuthenticatedRoutes("/v1/brand-kits")
  .get(
    "/",
    async (ctx) => {
      const authContext = getAuth(ctx);
      const rows = await listBrandKitsForOrg(authContext.organizationId);
      const brandKits = rows.map(toBrandKitResponse);
      return { brandKits, count: brandKits.length };
    },
    {
      response: {
        200: t.Object({
          brandKits: t.Array(brandKitSchema),
          count: t.Number({
            description:
              "Number of kits returned, which is every kit in the org.",
          }),
        }),
      },
      detail: {
        tags: ["brand-kits"],
        summary: "List brand kits",
        description:
          "Lists every brand kit in the organization in one response. Unpaginated: there is no limit or cursor, and `count` equals the number of kits returned. The default kit comes first, then the most recently updated.",
      },
    }
  )
  .get(
    "/:id",
    async (ctx) => {
      const { params, set } = ctx;
      const authContext = getAuth(ctx);

      const row = await getBrandKitForOrg(
        authContext.organizationId,
        params.id
      );
      if (!row) {
        set.status = 404;
        return { error: "Brand kit not found" };
      }
      return toBrandKitResponse(row);
    },
    {
      params: t.Object({ id: t.String({ maxLength: 36 }) }),
      response: {
        200: brandKitSchema,
        404: errorResponse,
      },
      detail: {
        tags: ["brand-kits"],
        summary: "Get a brand kit",
        description: "Returns a single brand kit in the organization.",
      },
    }
  )
  .post(
    "/",
    async (ctx) => {
      const { body, set } = ctx;
      const gate = await requirePermission(ctx, PERMISSION_RESOURCE, ["write"]);
      if (!gate.ok) {
        return gate.body;
      }
      const authContext = getAuth(ctx);

      const result = await createBrandKitForOrg(
        authContext.organizationId,
        actorFrom(ctx, gate.userId),
        body
      );
      if (!result.ok) {
        set.status = result.status;
        return { error: result.error };
      }

      set.status = 201;
      return toBrandKitResponse(result.value);
    },
    {
      body: createBody,
      response: {
        201: brandKitSchema,
        400: errorResponse,
        403: errorResponse,
      },
      detail: {
        tags: ["brand-kits"],
        summary: "Create a brand kit",
        description:
          "Creates a brand kit. A blank name becomes 'Untitled Brand Kit'. The first kit in the organization is the default; later kits become the default only when `isDefault` is true, which clears the previous default.",
      },
    }
  )
  .patch(
    "/:id",
    async (ctx) => {
      const { params, body, set } = ctx;
      const gate = await requirePermission(ctx, PERMISSION_RESOURCE, ["write"]);
      if (!gate.ok) {
        return gate.body;
      }
      const authContext = getAuth(ctx);

      const result = await updateBrandKitForOrg(
        authContext.organizationId,
        actorFrom(ctx, gate.userId),
        params.id,
        body
      );
      if (!result.ok) {
        set.status = result.status;
        return { error: result.error };
      }
      return toBrandKitResponse(result.value);
    },
    {
      params: t.Object({ id: t.String({ maxLength: 36 }) }),
      body: patchBody,
      response: {
        200: brandKitSchema,
        400: errorResponse,
        403: errorResponse,
        404: errorResponse,
      },
      detail: {
        tags: ["brand-kits"],
        summary: "Update a brand kit",
        description:
          "Partially updates a brand kit. Only the fields passed are changed. A blank name is refused with 400. To change the default, use POST /:id/default.",
      },
    }
  )
  .delete(
    "/:id",
    async (ctx) => {
      const { params, query, set } = ctx;
      const gate = await requirePermission(ctx, PERMISSION_RESOURCE, ["write"]);
      if (!gate.ok) {
        return gate.body;
      }

      if (query.confirm !== "true") {
        set.status = 400;
        return {
          error:
            "Confirmation required: pass confirm=true to delete this brand kit. If it is the default, another kit is promoted to default. Templates that used it lose the link.",
        };
      }

      const authContext = getAuth(ctx);
      const result = await deleteBrandKitForOrg(
        authContext.organizationId,
        actorFrom(ctx, gate.userId),
        params.id
      );
      if (!result.ok) {
        set.status = result.status;
        return { error: result.error };
      }
      return { success: true };
    },
    {
      params: t.Object({ id: t.String({ maxLength: 36 }) }),
      query: t.Object({
        confirm: t.Optional(
          t.String({
            description: "Must be the string `true` to delete. Required.",
          })
        ),
      }),
      response: {
        200: t.Object({ success: t.Boolean() }),
        400: errorResponse,
        403: errorResponse,
        404: errorResponse,
      },
      detail: {
        tags: ["brand-kits"],
        summary: "Delete a brand kit",
        description:
          "Deletes a brand kit. Destructive: requires `confirm=true` in the query string or the request is refused with 400. Deleting the default promotes another kit; templates that used the kit lose the link.",
      },
    }
  )
  .post(
    "/:id/default",
    async (ctx) => {
      const { params, set } = ctx;
      const gate = await requirePermission(ctx, PERMISSION_RESOURCE, ["write"]);
      if (!gate.ok) {
        return gate.body;
      }
      const authContext = getAuth(ctx);

      const result = await setDefaultBrandKitForOrg(
        authContext.organizationId,
        actorFrom(ctx, gate.userId),
        params.id
      );
      if (!result.ok) {
        set.status = result.status;
        return { error: result.error };
      }
      return toBrandKitResponse(result.value);
    },
    {
      params: t.Object({ id: t.String({ maxLength: 36 }) }),
      response: {
        200: brandKitSchema,
        403: errorResponse,
        404: errorResponse,
      },
      detail: {
        tags: ["brand-kits"],
        summary: "Set the default brand kit",
        description:
          "Makes this brand kit the organization's only default. The previous default is cleared in the same transaction.",
      },
    }
  );
