/**
 * GET /v1/email/metrics
 *
 * Aggregate email metrics for the authenticated organization — the API
 * counterpart to the dashboard's daily chart, sourced from the same
 * @wraps/db message-metrics repository so the numbers never diverge.
 */

import {
  getMessageMetrics,
  type MetricsDimension,
  type MetricsGranularity,
  MetricsQueryError,
} from "@wraps/db";
import { t } from "elysia";
import { createAuthenticatedRoutes, getAuth } from "../middleware/auth";
import { rateLimitMiddleware } from "../middleware/rate-limit";

const DEFAULT_WINDOW_DAYS = 6;
const DEFAULT_WINDOW_MS = DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
const MAX_LIST_LENGTH = 100;

const VALID_DIMENSIONS = new Set<MetricsDimension>([
  "period",
  "domain",
  "broadcast",
  "template",
  "source",
  "account",
  "region",
]);

function parseList(value: string | undefined): string[] | undefined {
  if (!value) {
    return;
  }
  const items = value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

export const metricsRoutes = createAuthenticatedRoutes("/v1/email/metrics")
  .use(rateLimitMiddleware)
  .get(
    "/",
    async (ctx) => {
      const authContext = getAuth(ctx);
      const query = ctx.query;

      const now = new Date();

      let endTime: Date;
      if (query.end_date) {
        const parsed = new Date(query.end_date);
        if (Number.isNaN(parsed.getTime())) {
          ctx.set.status = 400;
          return { error: `Invalid end_date: "${query.end_date}"` };
        }
        // A future end_date is clamped to now rather than rejected — the
        // window the caller gets is just narrower than they asked for.
        endTime = parsed > now ? now : parsed;
      } else {
        endTime = now;
      }

      let startTime: Date;
      if (query.start_date) {
        const parsed = new Date(query.start_date);
        if (Number.isNaN(parsed.getTime())) {
          ctx.set.status = 400;
          return { error: `Invalid start_date: "${query.start_date}"` };
        }
        startTime = parsed;
      } else {
        startTime = new Date(endTime.getTime() - DEFAULT_WINDOW_MS);
      }

      if (startTime > endTime) {
        ctx.set.status = 400;
        return {
          error: `start_date (${startTime.toISOString()}) must not be after end_date (${endTime.toISOString()})`,
        };
      }

      const dimensionsRaw = parseList(query.dimensions);
      let dimensions: MetricsDimension[] = [];
      if (dimensionsRaw) {
        for (const dim of dimensionsRaw) {
          if (!VALID_DIMENSIONS.has(dim as MetricsDimension)) {
            ctx.set.status = 400;
            return { error: `Invalid dimension: "${dim}"` };
          }
        }
        dimensions = dimensionsRaw as MetricsDimension[];
      }

      const listFilters: Array<{
        label: string;
        raw: string | undefined;
      }> = [
        { label: "broadcast_id", raw: query.broadcast_id },
        { label: "template_id", raw: query.template_id },
        { label: "aws_account_id", raw: query.aws_account_id },
        { label: "domain", raw: query.domain },
      ];

      const parsedFilters: Record<string, string[] | undefined> = {};
      for (const { label, raw } of listFilters) {
        const list = parseList(raw);
        if (list && list.length > MAX_LIST_LENGTH) {
          ctx.set.status = 400;
          return {
            error: `${label} accepts at most ${MAX_LIST_LENGTH} values`,
          };
        }
        parsedFilters[label] = list;
      }

      const timezone = query.timezone ?? "UTC";
      const granularity: MetricsGranularity = query.granularity ?? "daily";

      try {
        const result = await getMessageMetrics({
          organizationId: authContext.organizationId,
          startTime,
          endTime,
          timezone,
          granularity,
          dimensions,
          broadcastId: parsedFilters.broadcast_id,
          templateId: parsedFilters.template_id,
          awsAccountId: parsedFilters.aws_account_id,
          domain: parsedFilters.domain,
        });

        return {
          object: "metrics" as const,
          totals: result.totals,
          data: result.data,
          meta: {
            start_date: startTime.toISOString(),
            end_date: endTime.toISOString(),
            timezone,
            granularity,
            dimensions,
          },
        };
      } catch (err) {
        if (err instanceof MetricsQueryError) {
          ctx.set.status = 400;
          return { error: err.message };
        }
        throw err;
      }
    },
    {
      query: t.Object({
        start_date: t.Optional(
          t.String({ description: "ISO 8601 date or datetime" })
        ),
        end_date: t.Optional(
          t.String({ description: "ISO 8601 date or datetime" })
        ),
        timezone: t.Optional(
          t.String({ description: "IANA timezone name, defaults to UTC" })
        ),
        granularity: t.Optional(
          t.Union([
            t.Literal("hourly"),
            t.Literal("daily"),
            t.Literal("weekly"),
            t.Literal("monthly"),
          ])
        ),
        dimensions: t.Optional(
          t.String({
            description:
              "Comma-separated: period, domain, broadcast, template, source, account, region",
          })
        ),
        broadcast_id: t.Optional(
          t.String({ description: "Comma-separated, max 100" })
        ),
        template_id: t.Optional(
          t.String({ description: "Comma-separated, max 100" })
        ),
        aws_account_id: t.Optional(
          t.String({ description: "Comma-separated, max 100" })
        ),
        domain: t.Optional(
          t.String({ description: "Comma-separated, max 100" })
        ),
      }),
      detail: {
        tags: ["metrics"],
        summary: "Get aggregate email metrics",
        description:
          "Returns aggregate email metrics for the organization, optionally " +
          "grouped by period/domain/broadcast/template/source/account/region. " +
          "`opened` excludes user agents matching a known-bot list; " +
          "`openedRaw` reports the same count with no bot filter applied; " +
          "`clicked` is currently unfiltered (see plan 107 for this asymmetry).",
      },
    }
  );
