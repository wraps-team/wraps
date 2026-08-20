import type { ResourceName } from "@wraps/auth/access";
import { auditLog, db } from "@wraps/db";
import {
  type AuditLogAction,
  auditLogEntry,
  getAuditContext,
} from "@/lib/audit";
import { createActionLogger, type Logger, serializeError } from "@/lib/logger";
import { checkFeatureAccess } from "@/lib/plan-limits";
import type { PlanFeature } from "@/lib/plans";
import { checkPermission } from "./permissions";
import { type OrgAccess, verifyOrgAccess } from "./verify-org-access";

type DrizzleTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type AuditFields = {
  action: AuditLogAction;
  resource: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
};

export type OrgActionCtx = {
  organizationId: string;
  access: OrgAccess;
  log: Logger;
  audited: <T>(
    fn: (tx: DrizzleTransaction) => Promise<T>,
    fields: (result: T) => AuditFields
  ) => Promise<T>;
};

type Failure = { success: false; error: string };

/**
 * The exact string `orgAction` returns when `verifyOrgAccess` finds no
 * membership. Exported so callers that need to tell "you can't see this" from
 * "the query failed" can compare against it instead of duplicating the
 * literal — see contacts/segments/topics `page.tsx` (audit finding F6).
 *
 * Deliberately not a discriminated `kind` field on `Failure`: every caller of
 * an `orgAction`-wrapped action today expects the failure shape to be
 * exactly `{ success: false, error: string }`, and several tests assert that
 * with `toEqual` (exact match) across files this change does not own. Adding
 * a field to `Failure` would have been silently breaking for every one of
 * them. This constant is additive only — no return shape changes.
 */
export const UNAUTHORIZED = "You don't have access to this organization";

export function orgAction<TArgs extends unknown[], TResult>(
  opts: {
    name: string;
    resource: ResourceName;
    permission: string[];
    orgId: (...args: TArgs) => string;
    onError: string;
    feature?: PlanFeature;
  },
  handler: (ctx: OrgActionCtx, ...args: TArgs) => Promise<TResult>
): (...args: TArgs) => Promise<TResult | Failure> {
  return async (...args: TArgs): Promise<TResult | Failure> => {
    const organizationId = opts.orgId(...args);
    const log = createActionLogger(opts.name, { organizationId });
    try {
      const access = await verifyOrgAccess(organizationId);
      if (!access) {
        return { success: false, error: UNAUTHORIZED };
      }
      const permError = checkPermission(
        access.role,
        opts.resource,
        opts.permission
      );
      if (permError) {
        return permError;
      }

      if (opts.feature) {
        const featureAccess = await checkFeatureAccess(
          organizationId,
          opts.feature
        );
        if (!featureAccess.allowed) {
          return {
            success: false,
            error:
              featureAccess.message ?? "This feature requires a plan upgrade.",
          };
        }
      }

      const audited: OrgActionCtx["audited"] = async (fn, fields) => {
        const auditCtx = await getAuditContext();
        return await db.transaction(async (tx) => {
          const result = await fn(tx);
          await tx.insert(auditLog).values(
            auditLogEntry(auditCtx, {
              organizationId,
              actorId: access.userId,
              actorEmail: access.userEmail,
              ...fields(result),
            })
          );
          return result;
        });
      };

      return await handler({ organizationId, access, log, audited }, ...args);
    } catch (e) {
      if (e && typeof e === "object" && "formState" in e) {
        return (e as { formState: TResult }).formState;
      }
      log.error({ err: serializeError(e) }, `${opts.name} failed`);
      return { success: false, error: opts.onError };
    }
  };
}
