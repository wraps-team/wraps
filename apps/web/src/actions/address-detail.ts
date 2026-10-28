"use server";

import {
  and,
  auditLog,
  awsAccount,
  contact,
  db,
  desc,
  eq,
  findContactByEmailHash,
  hashContactValue,
  type ProblemSendRow,
  queryAddressProblemSends,
  queryAddressSendTotals,
  queryProblemAddresses,
  queryProblemAddressTotals,
  user,
} from "@wraps/db";
import { DrizzleQueryError } from "drizzle-orm";
import {
  explainSendProblem,
  normalizeAddressInput,
} from "@/lib/address-explanation";
import {
  type DrilldownWindow,
  validateDrilldownParams,
} from "@/lib/analytics-drilldown-window";
import type { EmailStatus } from "@/lib/contacts";
import { getOrganizationPlan } from "@/lib/plan-limits";
import { getHistoryRetentionDays } from "@/lib/plans";
import { type OrgActionCtx, orgAction } from "./shared/org-action";

const DETAIL_ERROR = "Could not load this address. Try again.";
const ADDRESSES_ERROR = "Could not load addresses. Try again.";
/** Problem sends the detail shows. The query fetches one more to detect more. */
const DETAIL_PROBLEM_SENDS = 25;

export type ProblemSend = {
  id: string; // message_send.id, the id the email page takes
  subject: string | null;
  sourceType: "transactional" | "batch" | "campaign" | "workflow";
  sourceName: string | null; // broadcast or workflow name, when it still exists
  templateName: string | null;
  sentAt: string; // ISO, sent_at ?? created_at
  awsAccountId: string | null;
  complainedAt: string | null;
  suppressedAt: string | null;
  problem: ReturnType<typeof explainSendProblem>;
};

export type ContactSummary = {
  id: string;
  name: string;
  emailStatus: EmailStatus | null;
  createdAt: string;
  createdBy: { name: string | null; email: string } | null;
  creationRecord: { at: string; actorEmail: string | null } | null;
};

export type AddressDetail =
  | {
      success: true;
      address: string;
      totals: {
        sends: number;
        bounces: number;
        complaints: number;
        suppressed: number;
      };
      lastProblemAt: string | null;
      problemSends: ProblemSend[];
      problemSendsHasMore: boolean;
      suppressionAccount: { id: string; name: string | null } | null;
      retentionDays: number;
      contact: ContactSummary | null;
    }
  | { success: false; error: string };

export type ProblemAddressRowResult = {
  address: string;
  complaints: number;
  bounces: number;
  suppressed: number;
  lastProblemAt: string | null;
};

export type ProblemAddressesResult =
  | {
      success: true;
      rows: ProblemAddressRowResult[];
      totals: { complaints: number; bounces: number; suppressed: number };
      uniqueAddresses: number;
    }
  | { success: false; error: string };

function errorCode(value: unknown): string | null {
  if (value && typeof value === "object" && "code" in value) {
    const code = (value as { code: unknown }).code;
    return typeof code === "string" ? code : null;
  }
  return null;
}

function errorName(err: unknown): string {
  if (err instanceof DrizzleQueryError) {
    return "DrizzleQueryError";
  }
  return err instanceof Error ? err.name : "unknown";
}

/**
 * The only fields a query failure may log. A DrizzleQueryError's message
 * embeds the SQL and its bound parameters, which include the address, so
 * neither err.message nor err.params is read. Its name is "Error", so the
 * class is checked instead.
 */
function logQueryFailure(ctx: OrgActionCtx, action: string, err: unknown) {
  const cause =
    err instanceof Error ? (err as { cause?: unknown }).cause : null;
  ctx.log.error(
    {
      errName: errorName(err),
      code: errorCode(err) ?? errorCode(cause),
      action,
    },
    "address drill-down query failed"
  );
}

/** The latest of a send's problem timestamps, or null for a clean send. */
function problemTime(row: ProblemSendRow): Date | null {
  const times = [row.complainedAt, row.bouncedAt, row.suppressedAt].filter(
    (value): value is Date => value instanceof Date
  );
  if (times.length === 0) {
    return null;
  }
  return new Date(Math.max(...times.map((time) => time.getTime())));
}

/** The broadcast or workflow name, only for the source that has one. */
function sourceNameOf(row: ProblemSendRow): string | null {
  if (row.sourceType === "batch") {
    return row.broadcastName;
  }
  if (row.sourceType === "workflow") {
    return row.workflowName;
  }
  return null;
}

function mapProblemSend(row: ProblemSendRow): ProblemSend {
  return {
    id: row.id,
    subject: row.subject,
    sourceType: row.sourceType as ProblemSend["sourceType"],
    sourceName: sourceNameOf(row),
    templateName: row.templateName,
    sentAt: (row.sentAt ?? row.createdAt).toISOString(),
    awsAccountId: row.awsAccountId,
    complainedAt: row.complainedAt?.toISOString() ?? null,
    suppressedAt: row.suppressedAt?.toISOString() ?? null,
    problem: explainSendProblem({
      bouncedAt: row.bouncedAt,
      complainedAt: row.complainedAt,
      suppressedAt: row.suppressedAt,
      bounceType: row.bounceType,
      bounceSubType: row.bounceSubType,
    }),
  };
}

/**
 * The contact with this id, read again by id under the org, plus its creation
 * record and creator. Returns null when the contact is not in the org.
 */
async function loadContact(
  organizationId: string,
  contactId: string
): Promise<ContactSummary | null> {
  const [contactRow] = await db
    .select({
      id: contact.id,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      emailStatus: contact.emailStatus,
      createdAt: contact.createdAt,
      createdBy: contact.createdBy,
    })
    .from(contact)
    .where(
      and(eq(contact.organizationId, organizationId), eq(contact.id, contactId))
    )
    .limit(1);
  if (!contactRow) {
    return null;
  }

  // Only the audit row for this contact, in this org. Rows without a
  // resource_id (bulk and import) cannot match and are never read.
  const [creationRecord] = await db
    .select({ createdAt: auditLog.createdAt, actorEmail: auditLog.actorEmail })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.organizationId, organizationId),
        eq(auditLog.action, "contact.created"),
        eq(auditLog.resourceId, contactRow.id)
      )
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(1);

  // The user table is not org-scoped. The id comes from the org-scoped
  // contact row above, which is the isolation boundary.
  const [creator] = contactRow.createdBy
    ? await db
        .select({ name: user.name, email: user.email })
        .from(user)
        .where(eq(user.id, contactRow.createdBy))
        .limit(1)
    : [];

  const fullName = [contactRow.firstName, contactRow.lastName]
    .filter(Boolean)
    .join(" ");
  return {
    id: contactRow.id,
    // The email column is nullable: a contact with neither a name nor an
    // email still needs a label.
    name: fullName || contactRow.email || "Unnamed contact",
    emailStatus: (contactRow.emailStatus as EmailStatus | null) ?? null,
    createdAt: contactRow.createdAt.toISOString(),
    createdBy: creator
      ? { name: creator.name ?? null, email: creator.email }
      : null,
    creationRecord: creationRecord
      ? {
          at: creationRecord.createdAt.toISOString(),
          actorEmail: creationRecord.actorEmail,
        }
      : null,
  };
}

/** The AWS account the row belongs to, scoped to the org. Null if not given. */
async function loadSuppressionAccount(
  organizationId: string,
  awsAccountId: string | null | undefined
): Promise<{ id: string; name: string | null } | null | "not-found"> {
  if (!awsAccountId) {
    return null;
  }
  const account = await db.query.awsAccount.findFirst({
    where: and(
      eq(awsAccount.id, awsAccountId),
      eq(awsAccount.organizationId, organizationId)
    ),
    columns: { id: true, name: true },
  });
  if (!account) {
    return "not-found";
  }
  return { id: account.id, name: account.name };
}

/**
 * Everything known about one address in the org: its sends and problems, the
 * AWS suppression it is shown against (when opened from that row), and its
 * contact. Reads Postgres only; SES is not called.
 */
export const getAddressDetail = orgAction(
  {
    name: "getAddressDetail",
    resource: "events",
    permission: ["read"],
    orgId: (
      organizationId: string,
      _input: { address: string; suppressedAwsAccountId?: string | null }
    ) => organizationId,
    onError: DETAIL_ERROR,
  },
  async (
    ctx,
    organizationId: string,
    input: { address: string; suppressedAwsAccountId?: string | null }
  ): Promise<AddressDetail> => {
    const normalized = normalizeAddressInput(input.address);
    if (!normalized.ok) {
      return { success: false, error: normalized.error };
    }
    const { address } = normalized;

    try {
      const account = await loadSuppressionAccount(
        organizationId,
        input.suppressedAwsAccountId
      );
      if (account === "not-found") {
        return { success: false, error: "AWS account not found" };
      }

      const planId = await getOrganizationPlan(organizationId);
      const [totals, problemRows, contactMatch] = await Promise.all([
        queryAddressSendTotals({ organizationId, address }),
        queryAddressProblemSends({ organizationId, address }),
        findContactByEmailHash(hashContactValue(address), organizationId),
      ]);
      const contactSummary = contactMatch
        ? await loadContact(organizationId, contactMatch.id)
        : null;

      const shown = problemRows.slice(0, DETAIL_PROBLEM_SENDS);
      const newest = shown[0] ? problemTime(shown[0]) : null;

      return {
        success: true,
        address,
        totals,
        lastProblemAt: newest?.toISOString() ?? null,
        problemSends: shown.map(mapProblemSend),
        problemSendsHasMore: problemRows.length > DETAIL_PROBLEM_SENDS,
        suppressionAccount: account,
        retentionDays: getHistoryRetentionDays(planId),
        contact: contactSummary,
      };
    } catch (err) {
      logQueryFailure(ctx, "getAddressDetail", err);
      return { success: false, error: DETAIL_ERROR };
    }
  }
);

/**
 * The addresses with a bounce, complaint or suppression in one window, worst
 * first. The window is rebuilt here from days, day and tz, the same way the
 * sends route does, so a client cannot widen it with its own dates.
 */
export const listProblemAddresses = orgAction(
  {
    name: "listProblemAddresses",
    resource: "events",
    permission: ["read"],
    orgId: (
      organizationId: string,
      _input: { days: number; day: string | null; tz: string }
    ) => organizationId,
    onError: ADDRESSES_ERROR,
  },
  async (
    ctx,
    organizationId: string,
    input: { days: number; day: string | null; tz: string }
  ): Promise<ProblemAddressesResult> => {
    const parsed = validateDrilldownParams(
      {
        days: String(input.days),
        day: input.day ?? undefined,
        tz: input.tz,
      },
      new Date()
    );
    if (!parsed.ok) {
      return { success: false, error: parsed.error };
    }
    const drilldownWindow: DrilldownWindow = parsed.window;
    const query = {
      organizationId,
      startTime: drilldownWindow.startTime,
      endTime: drilldownWindow.endTime,
      timezone: drilldownWindow.tz,
      day: drilldownWindow.day,
    };

    try {
      const [rows, totals] = await Promise.all([
        queryProblemAddresses(query),
        queryProblemAddressTotals(query),
      ]);
      return {
        success: true,
        rows: rows.map((row) => ({
          address: row.address,
          complaints: row.complaints,
          bounces: row.bounces,
          suppressed: row.suppressed,
          lastProblemAt: row.lastProblemAt
            ? new Date(row.lastProblemAt).toISOString()
            : null,
        })),
        totals: {
          complaints: totals.complaints,
          bounces: totals.bounces,
          suppressed: totals.suppressed,
        },
        uniqueAddresses: totals.uniqueAddresses,
      };
    } catch (err) {
      logQueryFailure(ctx, "listProblemAddresses", err);
      return { success: false, error: ADDRESSES_ERROR };
    }
  }
);
