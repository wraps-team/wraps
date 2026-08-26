import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { BillingInterval, TierId } from "@/config/pricing";
import { buildShareUrl, renderEstimateMarkdown } from "@/lib/pricing-markdown";
import type { CostInput, RetentionPeriod, SesPlanId } from "@/lib/ses-cost";
import {
  DEFAULT_COST_INPUT,
  estimateCost,
  RETENTION_PERIODS,
  SES_PLAN_IDS,
} from "@/lib/ses-cost";

const SITE = "https://wraps.dev";

const TIER_IDS = ["free", "starter", "growth", "scale"] as const;
const BILLING_INTERVALS = ["monthly", "annual"] as const;

const MAX_VOLUME = 1_000_000_000;
const MAX_EVENT_TYPES = 50;

const BASE_HEADERS = {
  // Public, unauthenticated pricing data — usable from any agent or browser.
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=3600",
} as const;

class InvalidParamError extends Error {}

function parseEnum<const T extends readonly string[]>(
  raw: string | null,
  allowed: T,
  fallback: T[number],
  param: string
): T[number] {
  if (raw === null) {
    return fallback;
  }
  const match = allowed.find((value) => value === raw);
  if (!match) {
    throw new InvalidParamError(
      `Invalid "${param}": "${raw}". Allowed values: ${allowed.join(", ")}.`
    );
  }
  return match;
}

function parseInteger(
  raw: string | null,
  fallback: number,
  param: string,
  { min, max }: { min: number; max: number }
): number {
  if (raw === null) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || Math.trunc(parsed) !== parsed) {
    throw new InvalidParamError(
      `Invalid "${param}": "${raw}". Expected an integer.`
    );
  }
  if (parsed < min || parsed > max) {
    throw new InvalidParamError(
      `Invalid "${param}": ${parsed}. Expected ${min}–${max}.`
    );
  }
  return parsed;
}

function parseBoolean(
  raw: string | null,
  fallback: boolean,
  param: string
): boolean {
  if (raw === null) {
    return fallback;
  }
  if (raw === "true" || raw === "1") {
    return true;
  }
  if (raw === "false" || raw === "0") {
    return false;
  }
  throw new InvalidParamError(
    `Invalid "${param}": "${raw}". Expected true or false.`
  );
}

function parseInput(params: URLSearchParams): CostInput {
  return {
    emailsPerMonth: parseInteger(
      params.get("emails"),
      DEFAULT_COST_INPUT.emailsPerMonth,
      "emails",
      { min: 0, max: MAX_VOLUME }
    ),
    eventsPerMonth: parseInteger(
      params.get("events"),
      DEFAULT_COST_INPUT.eventsPerMonth,
      "events",
      { min: 0, max: MAX_VOLUME }
    ),
    tier: parseEnum(
      params.get("tier"),
      TIER_IDS,
      DEFAULT_COST_INPUT.tier,
      "tier"
    ) as TierId,
    billing: parseEnum(
      params.get("billing"),
      BILLING_INTERVALS,
      DEFAULT_COST_INPUT.billing,
      "billing"
    ) as BillingInterval,
    sesPlan: parseEnum(
      params.get("sesPlan"),
      SES_PLAN_IDS,
      DEFAULT_COST_INPUT.sesPlan,
      "sesPlan"
    ) as SesPlanId,
    eventTracking: parseBoolean(
      params.get("tracking"),
      DEFAULT_COST_INPUT.eventTracking,
      "tracking"
    ),
    eventBridge: parseBoolean(
      params.get("eventbridge"),
      DEFAULT_COST_INPUT.eventBridge,
      "eventbridge"
    ),
    dynamodb: parseBoolean(
      params.get("dynamodb"),
      DEFAULT_COST_INPUT.dynamodb,
      "dynamodb"
    ),
    retention: parseEnum(
      params.get("retention"),
      RETENTION_PERIODS,
      DEFAULT_COST_INPUT.retention,
      "retention"
    ) as RetentionPeriod,
    eventTypes: parseInteger(
      params.get("eventTypes"),
      DEFAULT_COST_INPUT.eventTypes,
      "eventTypes",
      { min: 1, max: MAX_EVENT_TYPES }
    ),
    dedicatedIp: parseBoolean(
      params.get("dedicatedIp"),
      DEFAULT_COST_INPUT.dedicatedIp,
      "dedicatedIp"
    ),
    httpsTracking: parseBoolean(
      params.get("https"),
      DEFAULT_COST_INPUT.httpsTracking,
      "https"
    ),
    waf: parseBoolean(params.get("waf"), DEFAULT_COST_INPUT.waf, "waf"),
  };
}

export function GET(request: NextRequest) {
  let input: CostInput;
  try {
    input = parseInput(request.nextUrl.searchParams);
  } catch (error) {
    if (error instanceof InvalidParamError) {
      return NextResponse.json(
        { error: error.message, docs: `${SITE}/pricing.md` },
        { status: 400, headers: BASE_HEADERS }
      );
    }
    throw error;
  }

  const estimate = estimateCost(input);
  const shareUrl = buildShareUrl(input);

  const accept = request.headers.get("accept") ?? "";
  if (accept.includes("text/markdown")) {
    return new NextResponse(renderEstimateMarkdown(estimate, shareUrl), {
      headers: {
        ...BASE_HEADERS,
        "Content-Type": "text/markdown; charset=utf-8",
        Vary: "Accept",
      },
    });
  }

  return NextResponse.json(
    {
      currency: "USD",
      period: "month",
      input: estimate.input,
      wraps: estimate.wraps,
      aws: {
        sesPlan: estimate.aws.plan,
        lines: estimate.aws.lines.map((line) => ({
          ...line,
          cost: Math.round(line.cost * 100) / 100,
        })),
        total: estimate.aws.total,
      },
      total: estimate.total,
      effectiveCostPerThousandEmails: estimate.effectiveCostPerThousandEmails,
      shareUrl,
      docs: `${SITE}/pricing.md`,
    },
    { headers: { ...BASE_HEADERS, Vary: "Accept" } }
  );
}
