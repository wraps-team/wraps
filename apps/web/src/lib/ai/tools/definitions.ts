import type { ResourceName } from "@wraps/auth/access";
import { z } from "zod";
import {
  getEmailMetricsFromPostgres,
  getRecentActivityFromPostgres,
} from "@/lib/analytics-fallback";
import { getSetupStatus } from "@/lib/setup-status";

export type AssistantToolContext = {
  readonly organizationId: string;
  readonly orgSlug: string;
};

export type AssistantToolDefinition = {
  readonly name: string;
  readonly description: string;
  readonly resource: ResourceName;
  readonly permission: readonly string[];
  readonly inputSchema: z.ZodType;
  /** Input has already been validated against `inputSchema` when this runs. */
  readonly execute: (
    input: unknown,
    ctx: AssistantToolContext
  ) => Promise<unknown>;
};

/**
 * Preserves the per-tool link between `inputSchema` and `execute`'s argument
 * type, then erases it to the uniform array element type. The single cast is
 * sound because `buildAssistantTools` only ever calls `execute` with input the
 * AI SDK has already validated against this very `inputSchema`.
 */
export function defineTool<S extends z.ZodType>(def: {
  readonly name: string;
  readonly description: string;
  readonly resource: ResourceName;
  readonly permission: readonly string[];
  readonly inputSchema: S;
  readonly execute: (
    input: z.infer<S>,
    ctx: AssistantToolContext
  ) => Promise<unknown>;
}): AssistantToolDefinition {
  return def as AssistantToolDefinition;
}

const getSetupStatusTool = defineTool({
  name: "get_setup_status",
  description:
    "Read this organization's Wraps setup state: whether an AWS account is connected, whether a sending domain is verified, whether SES is still in the sandbox, and how many emails have been sent. Read-only.",
  resource: "awsAccounts",
  permission: ["read"],
  inputSchema: z.object({}),
  execute: async (_input, ctx) => {
    const { setupStatus } = await getSetupStatus(ctx.organizationId);
    return {
      hasAwsAccount: setupStatus.hasAwsAccount,
      hasPlatformConnection: setupStatus.hasPlatformConnection,
      hasVerifiedDomain: setupStatus.hasVerifiedDomain,
      verifiedDomains: setupStatus.verifiedDomains,
      hasSentEmail: setupStatus.hasSentEmail,
      emailCount: setupStatus.emailCount,
      sandboxStatus: setupStatus.sandboxStatus,
      awsRegion: setupStatus.awsRegion,
      domainCount: setupStatus.domainCount,
    };
  },
});

const getEmailMetricsTool = defineTool({
  name: "get_email_metrics",
  description:
    "Summarize this organization's email sending metrics (sent, delivered, bounced, complaints, opens, clicks) over a recent window of days. Read-only.",
  resource: "broadcasts",
  permission: ["read"],
  inputSchema: z.object({
    days: z
      .number()
      .int()
      .min(1)
      .max(90)
      .describe("How many days back to summarize."),
  }),
  execute: async (input, ctx) => {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - input.days * 86_400_000);
    const metrics = await getEmailMetricsFromPostgres(
      ctx.organizationId,
      startTime,
      endTime
    );
    const daily = [...metrics.values()].sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0
    );
    const totals = daily.reduce(
      (acc, day) => ({
        sent: acc.sent + day.sent,
        delivered: acc.delivered + day.delivered,
        bounced: acc.bounced + day.bounced,
        complaints: acc.complaints + day.complaints,
        opens: acc.opens + day.opens,
        clicks: acc.clicks + day.clicks,
        renderingFailures: acc.renderingFailures + day.renderingFailures,
      }),
      {
        sent: 0,
        delivered: 0,
        bounced: 0,
        complaints: 0,
        opens: 0,
        clicks: 0,
        renderingFailures: 0,
      }
    );
    return { days: input.days, totals, daily };
  },
});

const listRecentSendsTool = defineTool({
  name: "list_recent_sends",
  description:
    "List this organization's most recent email sends, with subject, event type, and when they happened. Read-only.",
  resource: "broadcasts",
  permission: ["read"],
  inputSchema: z.object({
    limit: z.number().int().min(1).max(20).default(10),
  }),
  execute: async (input, ctx) => {
    const rows = await getRecentActivityFromPostgres(
      ctx.organizationId,
      input.limit
    );
    return rows.map((row) => ({
      subject: row.subject,
      eventType: row.eventType,
      timestampFormatted: row.timestampFormatted,
    }));
  },
});

export const ASSISTANT_TOOLS: readonly AssistantToolDefinition[] = [
  getSetupStatusTool,
  getEmailMetricsTool,
  listRecentSendsTool,
];
