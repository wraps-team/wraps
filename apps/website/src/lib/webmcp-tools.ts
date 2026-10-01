import { PRICING_TIERS } from "@/config/pricing";
import { buildShareUrl, renderEstimateMarkdown } from "@/lib/pricing-markdown";
import {
  type CostInput,
  DEFAULT_COST_INPUT,
  estimateCost,
  RETENTION_PERIODS,
  SES_PLAN_IDS,
} from "@/lib/ses-cost";
import type { SpfQualifier } from "@/lib/spf-record";
import { buildSpfRecord, SPF_PROVIDERS } from "@/lib/spf-record";

export type WebMcpToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

export type WebMcpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => Promise<WebMcpToolResult>;
};

// Derived, not hardcoded: this enum advertised the pre-restructure ladder
// ("starter"/"growth"/"scale") to every agent that read the tool schema long
// after those tiers stopped being purchasable.
const TIER_IDS = PRICING_TIERS.map((t) => t.id);

const BILLING_INTERVALS = ["monthly", "annual"] as const;
const SPF_QUALIFIER_IDS: SpfQualifier[] = ["~all", "-all", "?all"];
const MAX_VOLUME = 1_000_000_000;

const textResult = (text: string): WebMcpToolResult => ({
  content: [{ type: "text", text }],
});

const errorResult = (text: string): WebMcpToolResult => ({
  content: [{ type: "text", text }],
  isError: true,
});

const fetchText = async (path: string): Promise<WebMcpToolResult> => {
  try {
    const res = await fetch(path);
    if (!res.ok) {
      return errorResult(`Could not load ${path}: HTTP ${res.status}.`);
    }
    return textResult(await res.text());
  } catch {
    return errorResult(`Could not load ${path}: network error.`);
  }
};

const toInteger = (value: unknown): number | undefined => {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (
    typeof parsed !== "number" ||
    !Number.isInteger(parsed) ||
    parsed < 0 ||
    parsed > MAX_VOLUME
  ) {
    return;
  }
  return parsed;
};

const pickEnum = <const T extends readonly string[]>(
  value: unknown,
  allowed: T
): T[number] | undefined => allowed.find((candidate) => candidate === value);

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];

const estimateCostTool: WebMcpTool = {
  name: "estimate_cost",
  description:
    "Estimate the real monthly cost of running email on Wraps + AWS: Wraps platform fee, custom-event overage, and the itemized AWS bill (SES, EventBridge, SQS, Lambda, DynamoDB, dedicated IP, WAF). Use this instead of doing the arithmetic — the model has six interacting variables, including which SES pricing plan the AWS account is on.",
  inputSchema: {
    type: "object",
    properties: {
      emails: {
        type: "integer",
        description: "Emails sent per month",
      },
      events: {
        type: "integer",
        description:
          "Custom events you emit via POST /v1/events per month. Emails sent and SES delivery events (deliveries, opens, clicks, bounces) are not counted and do not affect price.",
      },
      tier: {
        type: "string",
        enum: TIER_IDS,
        description: "Wraps plan",
      },
      billing: {
        type: "string",
        enum: [...BILLING_INTERVALS],
        description: "Wraps billing interval",
      },
      sesPlan: {
        type: "string",
        enum: [...SES_PLAN_IDS],
        description:
          "AWS SES pricing plan for that account and Region. New AWS accounts default to 'essentials' ($0.16/1K); 'alacarte' is $0.10/1K.",
      },
      dedicatedIp: {
        type: "boolean",
        description: "Include a dedicated sending IP",
      },
      retention: {
        type: "string",
        enum: [...RETENTION_PERIODS],
        description: "Email event history retention",
      },
    },
    required: ["emails"],
  },
  execute: (input) => {
    const emails = toInteger(input.emails);
    if (emails === undefined) {
      return Promise.resolve(
        errorResult('"emails" is required and must be a non-negative integer.')
      );
    }

    const costInput: CostInput = {
      ...DEFAULT_COST_INPUT,
      emailsPerMonth: emails,
      eventsPerMonth:
        toInteger(input.events) ?? DEFAULT_COST_INPUT.eventsPerMonth,
      tier: pickEnum(input.tier, TIER_IDS) ?? DEFAULT_COST_INPUT.tier,
      billing:
        pickEnum(input.billing, BILLING_INTERVALS) ??
        DEFAULT_COST_INPUT.billing,
      sesPlan:
        pickEnum(input.sesPlan, SES_PLAN_IDS) ?? DEFAULT_COST_INPUT.sesPlan,
      retention:
        pickEnum(input.retention, RETENTION_PERIODS) ??
        DEFAULT_COST_INPUT.retention,
      dedicatedIp:
        typeof input.dedicatedIp === "boolean"
          ? input.dedicatedIp
          : DEFAULT_COST_INPUT.dedicatedIp,
    };

    const estimate = estimateCost(costInput);
    const shareUrl = buildShareUrl(costInput);

    return Promise.resolve({
      content: [
        { type: "text", text: renderEstimateMarkdown(estimate, shareUrl) },
      ],
      structuredContent: {
        currency: "USD",
        period: "month",
        input: estimate.input,
        wraps: estimate.wraps,
        aws: { sesPlan: estimate.aws.plan, total: estimate.aws.total },
        total: estimate.total,
        shareUrl,
      },
    });
  },
};

const buildSpfRecordTool: WebMcpTool = {
  name: "build_spf_record",
  description:
    "Build an SPF TXT record for a domain from a table of 22 verified sender providers (Google Workspace, SES, SendGrid, Mailgun and others), and report its DNS lookup count against the 10-lookup limit that silently breaks SPF when exceeded.",
  inputSchema: {
    type: "object",
    properties: {
      providers: {
        type: "array",
        items: { type: "string", enum: Object.keys(SPF_PROVIDERS) },
        description: "Services that send mail for the domain",
      },
      ips: {
        type: "array",
        items: { type: "string" },
        description: "Bare IPv4 or IPv6 addresses allowed to send",
      },
      includes: {
        type: "array",
        items: { type: "string" },
        description:
          "Custom domains to include. Each is assumed to cost 2 DNS lookups.",
      },
      qualifier: {
        type: "string",
        enum: SPF_QUALIFIER_IDS,
        description:
          "Policy for unlisted senders. Defaults to ~all, which is correct for a sending domain.",
      },
    },
  },
  execute: (input) => {
    const result = buildSpfRecord({
      providers: toStringArray(input.providers),
      ips: toStringArray(input.ips),
      includes: toStringArray(input.includes),
      qualifier: pickEnum(input.qualifier, SPF_QUALIFIER_IDS),
    });
    const lines = [
      result.record,
      "",
      `DNS lookups: ${result.lookups} of ${result.limit}`,
      ...result.warnings.map((w) => `Warning: ${w}`),
    ];
    return Promise.resolve({
      content: [{ type: "text", text: lines.join("\n") }],
      structuredContent: { ...result },
    });
  },
};

export function webMcpTools(): WebMcpTool[] {
  return [
    {
      name: "get_pricing",
      description:
        "Get Wraps pricing: plans, custom-event limits and overage rates, AWS SES pricing plans, worked cost examples, and the feature comparison (markdown)",
      inputSchema: { type: "object", properties: {} },
      execute: () => fetchText("/pricing.md"),
    },
    estimateCostTool,
    {
      name: "get_quickstart",
      description:
        "Get the quickstart guide for deploying email infrastructure on AWS",
      inputSchema: {
        type: "object",
        properties: {
          service: {
            type: "string",
            enum: ["email", "sms", "cdn"],
            description: "Which service to get quickstart docs for",
          },
        },
      },
      execute: () => fetchText("/llms.txt"),
    },
    {
      name: "search_docs",
      description: "Get full Wraps documentation in markdown format",
      inputSchema: { type: "object", properties: {} },
      execute: () => fetchText("/llms-full.txt"),
    },
    buildSpfRecordTool,
  ];
}
