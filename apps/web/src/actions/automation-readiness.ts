"use server";

import { auth } from "@wraps/auth";
import { db, template } from "@wraps/db";
import { and, eq, inArray } from "drizzle-orm";
import { headers } from "next/headers";
import { createActionLogger, serializeError } from "@/lib/logger";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type ReadinessCheck = {
  id: string;
  label: string;
  status: "pass" | "fail" | "warn";
  severity: "critical" | "warning";
  details?: string;
};

export type ReadinessResult =
  | { success: true; checks: ReadinessCheck[] }
  | { success: false; error: string };

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

async function verifyOrgAccess(
  organizationId: string
): Promise<{ userId: string; userEmail: string; role: string } | null> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return null;
  }

  const membership = await db.query.member.findFirst({
    where: (m, ops) =>
      ops.and(
        ops.eq(m.organizationId, organizationId),
        ops.eq(m.userId, session.user.id)
      ),
  });

  if (!membership) {
    return null;
  }

  return {
    userId: session.user.id,
    userEmail: session.user.email,
    role: membership.role,
  };
}

/**
 * Known first-class contact fields (from packages/db/src/schema/contacts.ts).
 * Fields accessed via `properties.*` are custom and always pass.
 */
const KNOWN_CONTACT_FIELDS = new Set([
  "email",
  "emailStatus",
  "phone",
  "smsStatus",
  "firstName",
  "lastName",
  "company",
  "jobTitle",
  "preferredChannel",
  "status",
  "emailsSent",
  "emailsOpened",
  "emailsClicked",
  "smsSent",
  "smsClicked",
]);

async function checkTemplates(
  organizationId: string,
  templateIds: string[]
): Promise<ReadinessCheck[]> {
  const uniqueIds = [...new Set(templateIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return [];
  }

  const foundTemplates = await db
    .select({ id: template.id, status: template.status })
    .from(template)
    .where(
      and(
        eq(template.organizationId, organizationId),
        inArray(template.id, uniqueIds)
      )
    );

  const foundIds = new Set(foundTemplates.map((t) => t.id));
  const missingIds = uniqueIds.filter((id) => !foundIds.has(id));
  const unpublished = foundTemplates.filter((t) => t.status !== "PUBLISHED");

  const checks: ReadinessCheck[] = [];

  checks.push({
    id: "templates_exist",
    label: "All email templates exist",
    status: missingIds.length > 0 ? "fail" : "pass",
    severity: "critical",
    details:
      missingIds.length > 0
        ? `${missingIds.length} template${missingIds.length > 1 ? "s" : ""} not found`
        : undefined,
  });

  checks.push({
    id: "templates_published",
    label: "All templates are published",
    status: unpublished.length > 0 ? "fail" : "pass",
    severity: "warning",
    details:
      unpublished.length > 0
        ? `${unpublished.length} template${unpublished.length > 1 ? "s are" : " is"} still in ${unpublished.map((t) => t.status.toLowerCase()).join(", ")} status`
        : undefined,
  });

  return checks;
}

function checkConditionFields(conditionFields: string[]): ReadinessCheck[] {
  const uniqueFields = [...new Set(conditionFields.filter(Boolean))];
  if (uniqueFields.length === 0) {
    return [];
  }

  const unknownFields = uniqueFields.filter(
    (field) =>
      !(KNOWN_CONTACT_FIELDS.has(field) || field.startsWith("properties."))
  );

  return [
    {
      id: "condition_fields_valid",
      label: "All condition fields are valid",
      status: unknownFields.length > 0 ? "fail" : "pass",
      severity: "warning",
      details:
        unknownFields.length > 0
          ? `Unknown field${unknownFields.length > 1 ? "s" : ""}: ${unknownFields.join(", ")}`
          : undefined,
    },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION
// ═══════════════════════════════════════════════════════════════════════════

export async function checkAutomationReadiness(
  automationId: string,
  organizationId: string,
  payload: {
    templateIds: string[];
    conditionFields: string[];
  }
): Promise<ReadinessResult> {
  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return {
        success: false,
        error: "You don't have access to this organization",
      };
    }

    const templateChecks = await checkTemplates(
      organizationId,
      payload.templateIds
    );
    const fieldChecks = checkConditionFields(payload.conditionFields);

    return { success: true, checks: [...templateChecks, ...fieldChecks] };
  } catch (error) {
    const log = createActionLogger("checkAutomationReadiness", {
      orgSlug: organizationId,
    });
    log.error(
      { err: serializeError(error), automationId },
      "Failed to check automation readiness"
    );
    return { success: false, error: "Failed to check automation readiness" };
  }
}

// Backward-compat alias
/** @deprecated Use checkAutomationReadiness */
export const checkWorkflowReadiness = checkAutomationReadiness;
