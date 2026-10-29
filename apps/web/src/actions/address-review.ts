"use server";

import {
  CONTENT_BOUNCE_SUBTYPES,
  SOFT_BOUNCE_ESCALATION_THRESHOLD,
} from "@wraps/core/bounce-classification";
import {
  awsAccount,
  db,
  eq,
  isRecommended,
  queryReviewAddressCounts,
  queryReviewAddresses,
  type ReviewAddressRow,
  type ReviewKind,
  type ReviewQuery,
} from "@wraps/db";
import { DrizzleQueryError } from "drizzle-orm";
import {
  type DrilldownWindow,
  validateDrilldownParams,
} from "@/lib/analytics-drilldown-window";
import {
  checkSuppressedAddresses,
  type ListedStatus,
} from "@/lib/aws/ses-suppression";
import { type OrgActionCtx, orgAction } from "./shared/org-action";

const REVIEW_ERROR = "Could not load addresses. Try again.";
/** Addresses per page: the three single-kind lists, and Recommendations. */
const REVIEW_PAGE_SIZE = 25;
/** The most recommendation candidates checked against SES in one request. */
const RECOMMENDED_CANDIDATE_LIMIT = 100;

const REVIEW_LISTS = ["recommended", "soft", "hard", "complaint"] as const;
export type ReviewList = (typeof REVIEW_LISTS)[number];

export type ReviewRow = {
  address: string;
  kinds: ReviewKind[];
  why: string;
  soft: number;
  hard: number;
  complaints: number;
  softDays: number;
  lastEventAt: string | null; // ISO
  awsAccountId: string | null;
  status: "listed" | "not_listed" | "unknown";
  listedReason: "BOUNCE" | "COMPLAINT" | null;
  reasonToSuppress: "BOUNCE" | "COMPLAINT";
  recommended: boolean;
};

export type ListAddressesToReviewResult =
  | {
      success: true;
      list: ReviewList;
      rows: ReviewRow[];
      hasMore: boolean;
      counts: { soft: number; hard: number; complaint: number };
    }
  | { success: false; error: string };

function errorCode(value: unknown): string | null {
  if (value && typeof value === "object" && "code" in value) {
    const code = (value as { code: unknown }).code;
    return typeof code === "string" ? code : null;
  }
  return null;
}

/**
 * Logs only the error class and code. A DrizzleQueryError's message embeds
 * the SQL and its bound parameters, which include addresses, so neither the
 * message nor the params are read. Same policy as address-detail.ts.
 */
function errorName(err: unknown): string {
  if (err instanceof DrizzleQueryError) {
    return "DrizzleQueryError";
  }
  return err instanceof Error ? err.name : "unknown";
}

function logQueryFailure(ctx: OrgActionCtx, action: string, err: unknown) {
  const cause =
    err instanceof Error ? (err as { cause?: unknown }).cause : null;
  ctx.log.error(
    {
      errName: errorName(err),
      code: errorCode(err) ?? errorCode(cause),
      action,
    },
    "address review query failed"
  );
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** One short sentence for the row, built from its numbers and SES status. */
function whyText(
  row: ReviewAddressRow,
  status: ListedStatus,
  threshold: number
): string {
  if (status.status === "listed") {
    return `On the SES list (${status.reason.toLowerCase()})`;
  }
  if (status.status === "unknown") {
    return "Could not check the SES list";
  }
  if (row.complaints > 0) {
    return "Complaint, not on the SES list";
  }
  if (row.hardOpen > 0) {
    return "Hard bounce, not on the SES list";
  }
  if (row.softDays >= threshold) {
    return `${plural(row.soft, "soft bounce")} on ${plural(row.softDays, "day")}, not on the SES list`;
  }
  if (row.hard > 0) {
    return "Hard bounce, not on the SES list";
  }
  return "Soft bounces, not on the SES list";
}

function toReviewRow(
  row: ReviewAddressRow,
  status: ListedStatus,
  threshold: number
): ReviewRow {
  const kinds: ReviewKind[] = [];
  if (row.soft > 0) {
    kinds.push("soft");
  }
  if (row.hard > 0) {
    kinds.push("hard");
  }
  if (row.complaints > 0) {
    kinds.push("complaint");
  }
  return {
    address: row.address,
    kinds,
    why: whyText(row, status, threshold),
    soft: row.soft,
    hard: row.hard,
    complaints: row.complaints,
    softDays: row.softDays,
    lastEventAt: row.lastEventAt ? row.lastEventAt.toISOString() : null,
    awsAccountId: row.awsAccountId,
    status: status.status,
    listedReason: status.status === "listed" ? status.reason : null,
    reasonToSuppress: row.complaints > 0 ? "COMPLAINT" : "BOUNCE",
    recommended: isRecommended(row, threshold),
  };
}

type AccountRow = typeof awsAccount.$inferSelect;

/**
 * The first recommended addresses that SES does not list. Only the first
 * page is read: the candidates are checked in pages of REVIEW_PAGE_SIZE,
 * and the walk stops once the page holds REVIEW_PAGE_SIZE unlisted rows or
 * RECOMMENDED_CANDIDATE_LIMIT candidates have been checked.
 */
async function recommendedRows(
  base: ReviewQuery,
  accounts: AccountRow[]
): Promise<{ rows: ReviewRow[]; hasMore: boolean }> {
  const threshold = base.classification.softThreshold;
  const rows: ReviewRow[] = [];
  let checked = 0;
  let offset = 0;
  let exhausted = false;

  while (rows.length < REVIEW_PAGE_SIZE) {
    if (checked >= RECOMMENDED_CANDIDATE_LIMIT) {
      break;
    }
    const page = await queryReviewAddresses({
      ...base,
      kind: "recommended",
      limit: REVIEW_PAGE_SIZE,
      offset,
    });
    if (page.rows.length === 0) {
      exhausted = true;
      break;
    }
    const statuses = await checkSuppressedAddresses({
      accounts,
      items: page.rows.map((row) => ({
        address: row.address,
        awsAccountId: row.awsAccountId,
      })),
    });
    checked += page.rows.length;
    offset += page.rows.length;

    for (const row of page.rows) {
      const status = statuses.get(row.address) ?? { status: "unknown" };
      if (status.status !== "listed") {
        rows.push(toReviewRow(row, status, threshold));
      }
    }
    if (!page.hasMore) {
      exhausted = true;
      break;
    }
  }

  // A page can end past REVIEW_PAGE_SIZE. The overflow is cut, so the
  // unlisted rows it held still count as "more".
  const hasMore = rows.length > REVIEW_PAGE_SIZE || !exhausted;
  return { rows: rows.slice(0, REVIEW_PAGE_SIZE), hasMore };
}

/**
 * One review list for one window. The window is rebuilt from `days` and
 * `tz` here, with the same validator as the drill-down, so a client cannot
 * widen it. Each row carries its SES list status.
 */
export const listAddressesToReview = orgAction(
  {
    name: "listAddressesToReview",
    resource: "awsAccounts",
    permission: ["read"],
    orgId: (
      organizationId: string,
      _input: { list: ReviewList; days: number; tz: string; offset?: number }
    ) => organizationId,
    onError: REVIEW_ERROR,
  },
  async (
    ctx,
    organizationId: string,
    input: { list: ReviewList; days: number; tz: string; offset?: number }
  ): Promise<ListAddressesToReviewResult> => {
    if (!(REVIEW_LISTS as readonly string[]).includes(input.list)) {
      return { success: false, error: "list must be a review list" };
    }
    const parsed = validateDrilldownParams(
      { days: String(input.days), tz: input.tz },
      new Date()
    );
    if (!parsed.ok) {
      return { success: false, error: parsed.error };
    }
    const drilldown: DrilldownWindow = parsed.window;
    const offset = Math.max(0, Math.floor(input.offset ?? 0));
    const base: ReviewQuery = {
      organizationId,
      startTime: drilldown.startTime,
      endTime: drilldown.endTime,
      timezone: drilldown.tz,
      classification: {
        contentSubTypes: CONTENT_BOUNCE_SUBTYPES,
        softThreshold: SOFT_BOUNCE_ESCALATION_THRESHOLD,
      },
    };

    try {
      const accounts = await db.query.awsAccount.findMany({
        where: eq(awsAccount.organizationId, organizationId),
      });
      const threshold = base.classification.softThreshold;

      const [listed, counts] = await Promise.all([
        input.list === "recommended"
          ? recommendedRows(base, accounts)
          : queryReviewAddresses({
              ...base,
              kind: input.list,
              limit: REVIEW_PAGE_SIZE,
              offset,
            }).then(async (page) => {
              const statuses = await checkSuppressedAddresses({
                accounts,
                items: page.rows.map((row) => ({
                  address: row.address,
                  awsAccountId: row.awsAccountId,
                })),
              });
              return {
                hasMore: page.hasMore,
                rows: page.rows.map((row) =>
                  toReviewRow(
                    row,
                    statuses.get(row.address) ?? { status: "unknown" },
                    threshold
                  )
                ),
              };
            }),
        queryReviewAddressCounts(base),
      ]);

      return {
        success: true,
        list: input.list,
        rows: listed.rows,
        hasMore: listed.hasMore,
        counts,
      };
    } catch (err) {
      logQueryFailure(ctx, "listAddressesToReview", err);
      return { success: false, error: REVIEW_ERROR };
    }
  }
);
