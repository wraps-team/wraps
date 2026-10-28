/**
 * API Keys Routes
 *
 * Lists, creates and revokes the organization's API keys. Session-only: a
 * request authenticated with an API key is refused with 403 on every verb.
 * A key cannot mint or revoke keys, so a leaked key cannot replace itself.
 * Sign in with `wraps auth login` (a device-flow session) to use these routes.
 *
 * GET    /v1/api-keys       - List keys (never the secret or its hash)
 * POST   /v1/api-keys       - Create a key; the secret is returned once
 * DELETE /v1/api-keys/:id   - Revoke a key (requires confirm=true)
 *
 * Lifted from apps/web/src/actions/api-keys.ts. See services/api-keys.ts.
 */

import { notifyOrg } from "@wraps/auth/notify";
import { t } from "elysia";
import { log } from "../lib/logger";
import { requirePermission } from "../lib/require-permission";
import { createAuthenticatedRoutes, getAuth } from "../middleware/auth";
import {
  API_KEY_PERMISSIONS,
  auditContextFromRequest,
  createApiKeyForApi,
  findApiKeyActor,
  findOrgSlug,
  listApiKeysForApi,
  revokeApiKeyForApi,
} from "../services/api-keys";

const API_KEYS_SESSION_ONLY =
  "API keys cannot manage API keys. Sign in with `wraps auth login` and retry.";

/**
 * Session-only gate (N0 section 14b). Returns the 403 body when the request was
 * authenticated with an API key, otherwise null. Every handler calls it before
 * the permission and confirm checks.
 */
function rejectApiKeyCaller(ctx: unknown): { error: string } | null {
  if (getAuth(ctx).apiKeyId === null) {
    return null;
  }
  (ctx as { set: { status: number } }).set.status = 403;
  return { error: API_KEYS_SESSION_ONLY };
}

const errorResponse = t.Object({ error: t.String() });

const permissionSchema = t.Union(
  API_KEY_PERMISSIONS.map((permission) => t.Literal(permission))
);

const apiKeySchema = t.Object({
  id: t.String(),
  name: t.String(),
  prefix: t.String({
    description:
      "Display prefix only, for example wraps_live_abcdefgh... The full key is never shown again after creation.",
  }),
  permissions: t.Array(t.String()),
  lastUsedAt: t.Union([t.String(), t.Null()]),
  expiresAt: t.Union([t.String(), t.Null()]),
  createdAt: t.String(),
  createdBy: t.Union([
    t.Object({ id: t.String(), name: t.String(), email: t.String() }),
    t.Null(),
  ]),
});

async function notifyOwnersAndAdmins(args: {
  organizationId: string;
  actorId: string;
  type: "api_key.created" | "api_key.revoked";
  title: string;
  body: string;
  apiKeyId: string;
  data: Record<string, unknown>;
}): Promise<void> {
  try {
    const slug = await findOrgSlug(args.organizationId);
    await notifyOrg({
      organizationId: args.organizationId,
      roles: ["owner", "admin"],
      excludeUserIds: [args.actorId],
      type: args.type,
      title: args.title,
      body: args.body,
      href: slug ? `/${slug}/settings/api-keys` : undefined,
      data: { apiKeyId: args.apiKeyId, ...args.data },
    });
  } catch (notifyError) {
    // Matches the dashboard action: a failed notification never fails the write.
    log.error("API key notification failed", notifyError, {
      organizationId: args.organizationId,
    });
  }
}

export const apiKeysRoutes = createAuthenticatedRoutes("/v1/api-keys")
  .get(
    "/",
    async (ctx) => {
      const denied = rejectApiKeyCaller(ctx);
      if (denied) {
        return denied;
      }

      const gate = await requirePermission(ctx, "apiKeys", ["read"]);
      if (!gate.ok) {
        return gate.body;
      }

      const apiKeys = await listApiKeysForApi(getAuth(ctx).organizationId);
      return { apiKeys };
    },
    {
      response: {
        200: t.Object({ apiKeys: t.Array(apiKeySchema) }),
        403: errorResponse,
      },
      detail: {
        tags: ["api-keys"],
        summary: "List API keys",
        description:
          "Lists the organization's API keys. Returns metadata only: the secret and its hash are never returned. Requires a dashboard or device-login session; API keys cannot call this route.",
      },
    }
  )
  .post(
    "/",
    async (ctx) => {
      const { body, set, request } = ctx;
      const denied = rejectApiKeyCaller(ctx);
      if (denied) {
        return denied;
      }

      const gate = await requirePermission(ctx, "apiKeys", ["write"]);
      if (!gate.ok) {
        return gate.body;
      }

      const name = body.name.trim();
      if (name.length < 1) {
        set.status = 400;
        return { error: "API key name is required" };
      }

      const { organizationId } = getAuth(ctx);
      const actor = await findApiKeyActor(gate.userId);
      if (!actor) {
        set.status = 403;
        return { error: "You don't have permission to perform this action" };
      }

      const type = body.type ?? "live";
      const created = await createApiKeyForApi({
        organizationId,
        actor,
        name,
        type,
        permissions: body.permissions,
        expiresInDays: body.expiresInDays,
        request: auditContextFromRequest(request),
      });

      await notifyOwnersAndAdmins({
        organizationId,
        actorId: actor.id,
        type: "api_key.created",
        title: `API key "${name}" created`,
        body: `${actor.name || actor.email} created a new ${type} API key (${created.apiKey.prefix}…).`,
        apiKeyId: created.apiKey.id,
        data: { prefix: created.apiKey.prefix },
      });

      set.status = 201;
      return { apiKey: created.apiKey, secretKey: created.secretKey };
    },
    {
      body: t.Object({
        name: t.String({ maxLength: 200 }),
        type: t.Optional(
          t.Union([
            t.Literal("live"),
            t.Literal("test"),
            t.Literal("restricted"),
          ])
        ),
        permissions: t.Optional(
          t.Union([
            t.Array(permissionSchema),
            t.Literal("full"),
            t.Literal("readonly"),
          ])
        ),
        expiresInDays: t.Optional(t.Integer({ minimum: 1, maximum: 3650 })),
      }),
      response: {
        201: t.Object({
          apiKey: apiKeySchema,
          secretKey: t.String({
            description:
              "The full API key. It is returned only in this response and cannot be retrieved again. Store it now.",
          }),
        }),
        400: errorResponse,
        403: errorResponse,
      },
      detail: {
        tags: ["api-keys"],
        summary: "Create an API key",
        description:
          "Creates an API key for the organization and returns the full secret once, in secretKey. Only the hash is stored. Requires a dashboard or device-login session; API keys cannot call this route.",
      },
    }
  )
  .delete(
    "/:id",
    async (ctx) => {
      const { params, query, set, request } = ctx;
      const denied = rejectApiKeyCaller(ctx);
      if (denied) {
        return denied;
      }

      const gate = await requirePermission(ctx, "apiKeys", ["write"]);
      if (!gate.ok) {
        return gate.body;
      }

      if (query.confirm !== true) {
        set.status = 400;
        return {
          error:
            "Confirmation required: pass confirm=true to revoke this API key. Any request that uses it stops working immediately.",
        };
      }

      const { organizationId } = getAuth(ctx);
      const actor = await findApiKeyActor(gate.userId);
      if (!actor) {
        set.status = 403;
        return { error: "You don't have permission to perform this action" };
      }

      const revoked = await revokeApiKeyForApi({
        organizationId,
        actor,
        apiKeyId: params.id,
        request: auditContextFromRequest(request),
      });
      if (!revoked) {
        set.status = 404;
        return { error: "API key not found" };
      }

      await notifyOwnersAndAdmins({
        organizationId,
        actorId: actor.id,
        type: "api_key.revoked",
        title: `API key "${revoked.name}" revoked`,
        body: `${actor.name || actor.email} revoked this API key. Requests using it will now fail.`,
        apiKeyId: params.id,
        data: {},
      });

      return { success: true };
    },
    {
      params: t.Object({ id: t.String({ maxLength: 36 }) }),
      query: t.Object({
        confirm: t.Optional(
          t.Boolean({
            description:
              "Must be true. Revoking a key cannot be undone and breaks every integration that uses it.",
          })
        ),
      }),
      response: {
        200: t.Object({ success: t.Literal(true) }),
        400: errorResponse,
        403: errorResponse,
        404: errorResponse,
      },
      detail: {
        tags: ["api-keys"],
        summary: "Revoke an API key",
        description:
          "Permanently revokes an API key. Requests that use it fail immediately. Requires confirm=true. Requires a dashboard or device-login session; API keys cannot call this route.",
      },
    }
  );
