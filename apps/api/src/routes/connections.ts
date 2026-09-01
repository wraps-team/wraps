/**
 * Connections Routes
 *
 * AWS account connection management for authenticated CLI users.
 *
 * POST /v1/connections - Register or update a connection
 * GET /v1/connections - List connections for the organization
 * DELETE /v1/connections/:id - Disconnect (clear webhook secret)
 */

import { randomBytes } from "node:crypto";
import { CONSOLE_ACCESS_ROLE_NAME } from "@wraps/core";
import { and, awsAccount, db, eq, sqlExpr } from "@wraps/db";
import { count } from "drizzle-orm";
import { t } from "elysia";
import { log } from "../lib/logger";
import { isPlanId, type PlanId } from "../lib/plan-ids";
import { resolveApiUrl } from "../lib/urls";
import { createAuthenticatedRoutes, getAuth } from "../middleware/auth";

// Plan limits for AWS accounts (matches apps/web/src/lib/plans.ts)
const PLAN_AWS_ACCOUNT_LIMITS: Record<PlanId, number> = {
  free: 1,
  pro: 1, // A second AWS account means Business
  business: -1, // unlimited
  // Legacy plans — see plans/208. Mapped to their new-tier equivalent, and
  // kept identical to plans.ts's maxAwsAccounts by a parity test.
  //
  // These were 2 and 5, set when plans.ts gave starter 1 account — the API was
  // then the *more generous* side and the mismatch was left alone on purpose.
  // The restructure raised starter to 3 and growth to unlimited, which flipped
  // it: the dashboard offered a grandfathered org more accounts than the API
  // would let it connect. Grandfathering decides which plan an org keeps, not
  // whether two services agree on what that plan grants.
  starter: 3,
  growth: -1, // unlimited
  scale: -1, // unlimited
};

function getMaxAwsAccounts(planId: string | null): number {
  // Explicit narrow, not an index-and-hope: an unrecognised plan name falling
  // through to the Free entry is how the restructure served paid customers
  // Free limits. `isPlanId` makes that fallback a decision the reader can see.
  if (!isPlanId(planId)) {
    return PLAN_AWS_ACCOUNT_LIMITS.free;
  }
  return PLAN_AWS_ACCOUNT_LIMITS[planId];
}

function generateExternalId(): string {
  return `wraps_${randomBytes(16).toString("hex")}`;
}

export const connectionsRoutes = createAuthenticatedRoutes("/v1/connections")
  // POST / — Register or update a connection
  .post(
    "/",
    async (ctx) => {
      const authContext = getAuth(ctx);
      const { body } = ctx;

      const maxAccounts = getMaxAwsAccounts(authContext.planId);

      // Wrap count-check-insert in a transaction with a row-level lock
      // to prevent concurrent requests from bypassing the plan limit.
      const result = await db.transaction(async (tx) => {
        // Lock the organization row to serialize concurrent connection creates
        await tx.execute(
          sqlExpr`SELECT 1 FROM "organization" WHERE "id" = ${authContext.organizationId} FOR UPDATE`
        );

        // Check plan limits
        const [accountCount] = await tx
          .select({ count: count() })
          .from(awsAccount)
          .where(eq(awsAccount.organizationId, authContext.organizationId));

        // Upsert: find existing by (organizationId, accountId)
        const [existing] = await tx
          .select({ id: awsAccount.id, externalId: awsAccount.externalId })
          .from(awsAccount)
          .where(
            and(
              eq(awsAccount.organizationId, authContext.organizationId),
              eq(awsAccount.accountId, body.accountId)
            )
          )
          .limit(1);

        if (
          maxAccounts !== -1 &&
          (accountCount?.count ?? 0) >= maxAccounts &&
          !existing
        ) {
          return { limited: true as const, maxAccounts };
        }

        // Generate secrets
        const webhookSecret = randomBytes(32).toString("hex");
        const externalId = existing?.externalId || generateExternalId();
        // Self-hosted deployments assume their own role so they never contend
        // with the platform over a single trust policy. SST injects "" for
        // unset variables, so `||` (not `??`) is required here.
        const consoleRoleName =
          process.env.WRAPS_CONSOLE_ROLE_NAME || CONSOLE_ACCESS_ROLE_NAME;
        const roleArn = `arn:aws:iam::${body.accountId}:role/${consoleRoleName}`;

        // Cast features to a known shape for property access
        const features = body.features as Record<string, unknown> | undefined;
        const hasEmailFeature = features?.email !== undefined;
        const hasSmsFeature = features?.sms !== undefined;

        let connectionId: string;

        if (existing) {
          // Update existing
          await tx
            .update(awsAccount)
            .set({
              region: body.region,
              roleArn,
              webhookSecret,
              isVerified: true,
              lastVerifiedAt: new Date(),
              emailEnabled: hasEmailFeature,
              smsEnabled: hasSmsFeature,
              features: (features ?? null) as any,
              updatedAt: new Date(),
            })
            .where(eq(awsAccount.id, existing.id));
          connectionId = existing.id;
        } else {
          // Insert new
          const id = crypto.randomUUID();
          await tx.insert(awsAccount).values({
            id,
            organizationId: authContext.organizationId,
            name: body.name || `AWS ${body.accountId}`,
            accountId: body.accountId,
            region: body.region,
            roleArn,
            externalId,
            webhookSecret,
            isVerified: true,
            lastVerifiedAt: new Date(),
            emailEnabled: hasEmailFeature,
            smsEnabled: hasSmsFeature,
            features: features ?? null,
            createdBy: authContext.userId,
          });
          connectionId = id;

          log.info("Connection created", {
            connectionId: id,
            organizationId: authContext.organizationId,
            accountId: body.accountId,
            region: body.region,
          });
        }

        return {
          limited: false as const,
          isUpdate: !!existing,
          connectionId,
          externalId,
          roleArn,
          webhookSecret,
          // Customers paste this into AWS, so it must name their own API.
          webhookEndpoint: `${resolveApiUrl()}/webhooks/ses/${body.accountId}`,
        };
      });

      if (result.limited) {
        ctx.set.status = 403;
        return {
          error: `AWS account limit reached (${result.maxAccounts}). Upgrade your plan to add more accounts.`,
        };
      }

      ctx.set.status = result.isUpdate ? 200 : 201;
      return {
        success: true,
        connectionId: result.connectionId,
        externalId: result.externalId,
        roleArn: result.roleArn,
        webhookSecret: result.webhookSecret,
        webhookEndpoint: result.webhookEndpoint,
      };
    },
    {
      body: t.Object({
        accountId: t.String({ description: "AWS account ID (12 digits)" }),
        region: t.String({ description: "AWS region (e.g. us-east-1)" }),
        name: t.Optional(
          t.String({ description: "Display name for the account" })
        ),
        features: t.Optional(
          t.Object(
            {},
            {
              additionalProperties: true,
              description: "Service features config",
            }
          )
        ),
      }),
      detail: {
        tags: ["connections"],
        summary: "Register or update an AWS connection",
        description:
          "Registers or updates the AWS account connection. Returns externalId for IAM role trust policy and webhookSecret for EventBridge configuration.",
      },
    }
  )

  // GET / — List connections for the organization
  .get(
    "/",
    async (ctx) => {
      const authContext = getAuth(ctx);

      const connections = await db
        .select({
          id: awsAccount.id,
          accountId: awsAccount.accountId,
          name: awsAccount.name,
          region: awsAccount.region,
          isVerified: awsAccount.isVerified,
          emailEnabled: awsAccount.emailEnabled,
          smsEnabled: awsAccount.smsEnabled,
          lastVerifiedAt: awsAccount.lastVerifiedAt,
          lastEventReceivedAt: awsAccount.lastEventReceivedAt,
          webhookSecret: awsAccount.webhookSecret,
          createdAt: awsAccount.createdAt,
        })
        .from(awsAccount)
        .where(eq(awsAccount.organizationId, authContext.organizationId));

      return {
        connections: connections.map(({ webhookSecret, ...c }) => ({
          ...c,
          webhookConnected: webhookSecret !== null,
          lastEventReceivedAt: c.lastEventReceivedAt?.toISOString() ?? null,
          lastVerifiedAt: c.lastVerifiedAt?.toISOString() ?? null,
          createdAt: c.createdAt.toISOString(),
        })),
      };
    },
    {
      detail: {
        tags: ["connections"],
        summary: "List AWS connections",
        description:
          "Returns all AWS account connections for the authenticated organization.",
      },
    }
  )

  // DELETE /:id — Disconnect (clear webhook secret)
  .delete(
    "/:id",
    async (ctx) => {
      const authContext = getAuth(ctx);
      const { id } = ctx.params;

      const [existing] = await db
        .select({ id: awsAccount.id })
        .from(awsAccount)
        .where(
          and(
            eq(awsAccount.id, id),
            eq(awsAccount.organizationId, authContext.organizationId)
          )
        )
        .limit(1);

      if (!existing) {
        ctx.set.status = 404;
        return { error: "Connection not found" };
      }

      // Clear webhook secret (don't delete the record)
      await db
        .update(awsAccount)
        .set({
          webhookSecret: null,
          updatedAt: new Date(),
        })
        .where(eq(awsAccount.id, id));

      return { success: true };
    },
    {
      params: t.Object({
        id: t.String({ description: "Connection ID" }),
      }),
      detail: {
        tags: ["connections"],
        summary: "Disconnect an AWS account",
        description:
          "Clears the webhook secret for the connection. The account record is preserved.",
      },
    }
  );
