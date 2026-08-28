/**
 * Transport-independent core of the public Wraps MCP server.
 *
 * The HTTP shell lives in src/app/api/mcp/route.ts; everything protocol-shaped
 * is here so it can be exercised without spinning up a server.
 *
 * This server is deliberately unauthenticated: every tool reads public product
 * data (docs, pricing). Nothing here touches a customer AWS account — that is
 * what the stdio server `@wraps.dev/mcp` is for.
 */

import { AGENT_CONTENT } from "@/lib/agent-content";
import { AGENT_CONTENT_PATHS } from "@/lib/agent-content-paths";
import { buildShareUrl, renderEstimateMarkdown } from "@/lib/pricing-markdown";
import type { CostInput, RetentionPeriod, SesPlanId } from "@/lib/ses-cost";
import {
  DEFAULT_COST_INPUT,
  estimateCost,
  RETENTION_PERIODS,
  SES_PLAN_IDS,
} from "@/lib/ses-cost";

export const SERVER_INFO = {
  name: "wraps",
  title: "Wraps",
  version: "1.0.0",
  websiteUrl: "https://wraps.dev/mcp",
} as const;

export const SERVER_INSTRUCTIONS =
  "Public Wraps documentation and pricing tools. Use search_docs to find how " +
  "to do something with Wraps, get_doc to read a full page as markdown, and " +
  "estimate_cost instead of doing Wraps + AWS SES cost arithmetic by hand. " +
  "No authentication is required and no tool here can change anything. To " +
  "operate a deployed email stack (send history, delivery events, domain " +
  "status, suppressions, guarded sending), install the stdio server " +
  "`npx -y @wraps.dev/mcp`, which uses the caller's own AWS credentials.";

/**
 * Newest first. `initialize` echoes the client's version when it is listed
 * here; `server/discover` (2026-07-28 and later) returns the whole list.
 */
export const SUPPORTED_PROTOCOL_VERSIONS = [
  "2026-07-28",
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
] as const;

/** What we answer with when a client asks for a version we do not know. */
export const FALLBACK_PROTOCOL_VERSION = "2025-06-18";

export const SERVER_CAPABILITIES = {
  tools: { listChanged: false },
} as const;

// JSON-RPC 2.0 + MCP error codes.
export const JSONRPC_PARSE_ERROR = -32_700;
export const JSONRPC_INVALID_REQUEST = -32_600;
export const JSONRPC_METHOD_NOT_FOUND = -32_601;
export const JSONRPC_INVALID_PARAMS = -32_602;
export const JSONRPC_INTERNAL_ERROR = -32_603;
export const MCP_UNSUPPORTED_PROTOCOL_VERSION = -32_022;

export type JsonRpcId = string | number | null;

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
};

export type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

/** Fetches a public text asset (llms.txt, llms-full.txt) from the site itself. */
export type TextFetcher = (path: string) => Promise<string>;

const SITE = "https://wraps.dev";

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const TIER_IDS = ["free", "starter", "growth", "scale"] as const;
const BILLING_INTERVALS = ["monthly", "annual"] as const;
const MAX_VOLUME = 1_000_000_000;
const DEFAULT_SEARCH_LIMIT = 5;
const MAX_SEARCH_LIMIT = 20;
const SNIPPET_CHARS = 1200;

export const TOOLS = [
  {
    name: "search_docs",
    title: "Search Wraps docs",
    description:
      "Search the full Wraps documentation (CLI, TypeScript SDKs, infrastructure, guides) and return the matching sections as markdown. Use this first for any 'how do I ... with Wraps' question.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Words to search for, e.g. 'verify domain', 'send batch', 'bounce handling'.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: MAX_SEARCH_LIMIT,
          description: `Maximum sections to return (default ${DEFAULT_SEARCH_LIMIT}).`,
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "get_doc",
    title: "Read a Wraps doc page",
    description:
      "Return the full markdown source of one Wraps page. Call list_docs first to see which paths have markdown.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Site path such as /docs/quickstart/email, or the full https://wraps.dev/... URL.",
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "list_docs",
    title: "List Wraps documentation",
    description:
      "Return the Wraps llms.txt index: every documentation page, product page, guide, and SDK reference with a one-line description.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "estimate_cost",
    title: "Estimate Wraps + AWS cost",
    description:
      "Estimate the real monthly cost of running email on Wraps + AWS: the Wraps platform fee, tracked-event overage, and the itemized AWS bill (SES, EventBridge, SQS, Lambda, DynamoDB, dedicated IP, WAF). Use this instead of doing the arithmetic — six variables interact, including which SES pricing plan the AWS account is on.",
    inputSchema: {
      type: "object",
      properties: {
        emails: {
          type: "integer",
          minimum: 0,
          maximum: MAX_VOLUME,
          description: "Emails sent per month.",
        },
        events: {
          type: "integer",
          minimum: 0,
          maximum: MAX_VOLUME,
          description:
            "Custom events you emit via POST /v1/events per month. Emails sent and SES delivery events (deliveries, opens, clicks, bounces) are not counted and do not affect price.",
        },
        tier: {
          type: "string",
          enum: [...TIER_IDS],
          description: "Wraps plan.",
        },
        billing: {
          type: "string",
          enum: [...BILLING_INTERVALS],
          description: "Wraps billing interval.",
        },
        sesPlan: {
          type: "string",
          enum: [...SES_PLAN_IDS],
          description:
            "AWS SES pricing plan for that account and Region. New AWS accounts default to 'essentials' ($0.16/1K); 'alacarte' is $0.10/1K.",
        },
        dedicatedIp: {
          type: "boolean",
          description: "Include a dedicated sending IP.",
        },
        retention: {
          type: "string",
          enum: [...RETENTION_PERIODS],
          description: "How long email event history is kept.",
        },
      },
      required: ["emails"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
] as const;

export type ToolName = (typeof TOOLS)[number]["name"];

class ToolInputError extends Error {}

function requireString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new ToolInputError(
      `"${key}" is required and must be a non-empty string.`
    );
  }
  return value.trim();
}

function optionalInteger(
  args: Record<string, unknown>,
  key: string,
  { min, max }: { min: number; max: number }
): number | undefined {
  const value = args[key];
  if (value === undefined || value === null) {
    return;
  }
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isInteger(parsed)) {
    throw new ToolInputError(`"${key}" must be an integer.`);
  }
  if (parsed < min || parsed > max) {
    throw new ToolInputError(`"${key}" must be between ${min} and ${max}.`);
  }
  return parsed;
}

function optionalEnum<const T extends readonly string[]>(
  args: Record<string, unknown>,
  key: string,
  allowed: T
): T[number] | undefined {
  const value = args[key];
  if (value === undefined || value === null) {
    return;
  }
  const match = allowed.find((candidate) => candidate === value);
  if (match === undefined) {
    throw new ToolInputError(`"${key}" must be one of: ${allowed.join(", ")}.`);
  }
  return match;
}

function optionalBoolean(
  args: Record<string, unknown>,
  key: string
): boolean | undefined {
  const value = args[key];
  if (value === undefined || value === null) {
    return;
  }
  if (typeof value !== "boolean") {
    throw new ToolInputError(`"${key}" must be a boolean.`);
  }
  return value;
}

/** Split a markdown document into `##`/`###` sections, keeping the heading. */
const HEADING_LINE = /^(#{1,3})\s+(.*)$/;
const SEARCH_TERM_SEPARATOR = /[^a-z0-9._@/-]+/;

export function splitMarkdownSections(
  markdown: string
): Array<{ heading: string; body: string }> {
  const lines = markdown.split("\n");
  const sections: Array<{ heading: string; body: string }> = [];
  let heading = "Overview";
  let body: string[] = [];

  const flush = () => {
    const text = body.join("\n").trim();
    if (text !== "") {
      sections.push({ heading, body: text });
    }
  };

  for (const line of lines) {
    const match = HEADING_LINE.exec(line);
    if (match) {
      flush();
      heading = match[2].trim();
      body = [];
      continue;
    }
    body.push(line);
  }
  flush();

  return sections;
}

export function searchSections(
  markdown: string,
  query: string,
  limit: number
): Array<{ heading: string; body: string; score: number }> {
  const terms = query
    .toLowerCase()
    .split(SEARCH_TERM_SEPARATOR)
    .filter((term) => term.length > 1);
  if (terms.length === 0) {
    return [];
  }

  return splitMarkdownSections(markdown)
    .map((section) => {
      const heading = section.heading.toLowerCase();
      const body = section.body.toLowerCase();
      let score = 0;
      for (const term of terms) {
        // A heading hit is worth far more than a body hit — sections are the
        // unit an agent reads, and the heading is what says "this is the one".
        if (heading.includes(term)) {
          score += 10;
        }
        const occurrences = body.split(term).length - 1;
        score += Math.min(occurrences, 5);
      }
      return { ...section, score };
    })
    .filter((section) => section.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n…`;
}

// Agents paste the full URL about as often as the path, and sometimes over
// the wrong scheme. Both normalize to a site-relative path.
const SITE_ORIGIN_PREFIX = /^https?:\/\/wraps\.dev/i;

function normalizeDocPath(raw: string): string {
  let path = raw.trim().replace(SITE_ORIGIN_PREFIX, "");
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  // Trailing slash is meaningless here and is the most common agent typo.
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }
  return path;
}

async function runSearchDocs(
  args: Record<string, unknown>,
  fetchText: TextFetcher
): Promise<ToolResult> {
  const query = requireString(args, "query");
  const limit =
    optionalInteger(args, "limit", { min: 1, max: MAX_SEARCH_LIMIT }) ??
    DEFAULT_SEARCH_LIMIT;

  const markdown = await fetchText("/llms-full.txt");
  const matches = searchSections(markdown, query, limit);

  if (matches.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: `No section of the Wraps docs matched "${query}". Call list_docs for the full index, or read ${SITE}/llms-full.txt directly.`,
        },
      ],
      structuredContent: { query, matches: [] },
    };
  }

  const rendered = matches
    .map(
      (match) => `## ${match.heading}\n\n${truncate(match.body, SNIPPET_CHARS)}`
    )
    .join("\n\n---\n\n");

  return {
    content: [
      {
        type: "text",
        text: `${matches.length} section(s) matched "${query}" in the Wraps documentation.\n\n${rendered}\n\n---\n\nFull docs: ${SITE}/llms-full.txt · Index: ${SITE}/llms.txt`,
      },
    ],
    structuredContent: {
      query,
      matches: matches.map((match) => ({
        heading: match.heading,
        excerpt: truncate(match.body, SNIPPET_CHARS),
      })),
    },
  };
}

function runGetDoc(args: Record<string, unknown>): ToolResult {
  const path = normalizeDocPath(requireString(args, "path"));
  const content = AGENT_CONTENT[path];

  if (content === undefined) {
    return {
      content: [
        {
          type: "text",
          text: `No markdown source for "${path}". Paths with markdown: ${[...AGENT_CONTENT_PATHS].sort().join(", ")}. Every other page is reachable as HTML at ${SITE}${path}, and the whole corpus is at ${SITE}/llms-full.txt.`,
        },
      ],
      isError: true,
    };
  }

  return {
    content: [{ type: "text", text: content }],
    structuredContent: { path, url: `${SITE}${path}`, markdown: content },
  };
}

async function runListDocs(fetchText: TextFetcher): Promise<ToolResult> {
  const index = await fetchText("/llms.txt");
  return {
    content: [{ type: "text", text: index }],
    structuredContent: { source: `${SITE}/llms.txt` },
  };
}

function runEstimateCost(args: Record<string, unknown>): ToolResult {
  const emails = optionalInteger(args, "emails", { min: 0, max: MAX_VOLUME });
  if (emails === undefined) {
    throw new ToolInputError('"emails" is required and must be an integer.');
  }

  const input: CostInput = {
    ...DEFAULT_COST_INPUT,
    emailsPerMonth: emails,
    eventsPerMonth:
      optionalInteger(args, "events", { min: 0, max: MAX_VOLUME }) ??
      DEFAULT_COST_INPUT.eventsPerMonth,
    tier: optionalEnum(args, "tier", TIER_IDS) ?? DEFAULT_COST_INPUT.tier,
    billing:
      optionalEnum(args, "billing", BILLING_INTERVALS) ??
      DEFAULT_COST_INPUT.billing,
    sesPlan:
      (optionalEnum(args, "sesPlan", SES_PLAN_IDS) as SesPlanId | undefined) ??
      DEFAULT_COST_INPUT.sesPlan,
    retention:
      (optionalEnum(args, "retention", RETENTION_PERIODS) as
        | RetentionPeriod
        | undefined) ?? DEFAULT_COST_INPUT.retention,
    dedicatedIp:
      optionalBoolean(args, "dedicatedIp") ?? DEFAULT_COST_INPUT.dedicatedIp,
  };

  const estimate = estimateCost(input);
  const shareUrl = buildShareUrl(input);

  return {
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
  };
}

export async function callTool(
  name: string,
  args: Record<string, unknown>,
  fetchText: TextFetcher
): Promise<ToolResult> {
  try {
    switch (name) {
      case "search_docs":
        return await runSearchDocs(args, fetchText);
      case "get_doc":
        return runGetDoc(args);
      case "list_docs":
        return await runListDocs(fetchText);
      case "estimate_cost":
        return runEstimateCost(args);
      default:
        return {
          content: [
            {
              type: "text",
              text: `Unknown tool "${name}". Available: ${TOOLS.map((tool) => tool.name).join(", ")}.`,
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    // Tool failures are reported inside the result, not as JSON-RPC errors —
    // that is what lets the model see the message and correct its arguments.
    const message =
      error instanceof ToolInputError
        ? error.message
        : `Tool "${name}" failed: ${error instanceof Error ? error.message : String(error)}`;
    return { content: [{ type: "text", text: message }], isError: true };
  }
}

// ---------------------------------------------------------------------------
// JSON-RPC dispatch
// ---------------------------------------------------------------------------

function isSupportedVersion(version: string): boolean {
  return (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(version);
}

/** The protocol version a request declares, via `_meta` or `params`. */
export function requestedProtocolVersion(
  params: Record<string, unknown> | undefined
): string | undefined {
  const direct = params?.protocolVersion;
  if (typeof direct === "string") {
    return direct;
  }
  const meta = params?._meta;
  if (meta && typeof meta === "object") {
    const fromMeta = (meta as Record<string, unknown>)[
      "io.modelcontextprotocol/protocolVersion"
    ];
    if (typeof fromMeta === "string") {
      return fromMeta;
    }
  }
  return;
}

function ok(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function fail(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown
): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message, ...(data ? { data } : {}) },
  };
}

const DISCOVERY_TTL_MS = 3_600_000;

/**
 * Handle one JSON-RPC message. Returns null for notifications, which take no
 * response body (the transport answers 202).
 */
/**
 * Everything that can reject a message before its method matters: shape,
 * JSON-RPC envelope, protocol version. Returns the rejection, or null to
 * continue.
 */
function rejectMessage(
  request: Partial<JsonRpcRequest>,
  version: string | undefined
): JsonRpcResponse | null | undefined {
  const id = request.id ?? null;
  const isNotification = request.id === undefined;

  if (request.jsonrpc !== "2.0" || typeof request.method !== "string") {
    return isNotification
      ? null
      : fail(
          id,
          JSONRPC_INVALID_REQUEST,
          'Expected {"jsonrpc":"2.0","method":"...","id":...}.'
        );
  }

  if (version !== undefined && !isSupportedVersion(version)) {
    return isNotification
      ? null
      : fail(
          id,
          MCP_UNSUPPORTED_PROTOCOL_VERSION,
          "Unsupported protocol version",
          { supported: [...SUPPORTED_PROTOCOL_VERSIONS], requested: version }
        );
  }

  return;
}

/**
 * Methods whose reply needs nothing but the server's own metadata. Returns
 * undefined for anything else, which the dispatcher then handles.
 */
function metadataResult(
  method: string,
  version: string | undefined
): unknown | undefined {
  switch (method) {
    case "initialize":
      return {
        protocolVersion: version ?? FALLBACK_PROTOCOL_VERSION,
        capabilities: SERVER_CAPABILITIES,
        serverInfo: SERVER_INFO,
        instructions: SERVER_INSTRUCTIONS,
      };
    case "server/discover":
      return {
        resultType: "complete",
        supportedVersions: [...SUPPORTED_PROTOCOL_VERSIONS],
        capabilities: SERVER_CAPABILITIES,
        instructions: SERVER_INSTRUCTIONS,
        ttlMs: DISCOVERY_TTL_MS,
        cacheScope: "public",
        _meta: { "io.modelcontextprotocol/serverInfo": SERVER_INFO },
      };
    case "ping":
      return {};
    case "tools/list":
      return { tools: TOOLS };
    // Not advertised in capabilities, but clients probe anyway; an empty list
    // is friendlier than "method not found".
    case "resources/list":
      return { resources: [] };
    case "resources/templates/list":
      return { resourceTemplates: [] };
    case "prompts/list":
      return { prompts: [] };
    default:
      return;
  }
}

export async function handleMessage(
  message: unknown,
  fetchText: TextFetcher
): Promise<JsonRpcResponse | null> {
  if (
    message === null ||
    typeof message !== "object" ||
    Array.isArray(message)
  ) {
    return fail(
      null,
      JSONRPC_INVALID_REQUEST,
      "Expected a JSON-RPC 2.0 object."
    );
  }

  const request = message as Partial<JsonRpcRequest>;
  const params = (request.params ?? {}) as Record<string, unknown>;
  const version = requestedProtocolVersion(params);

  const rejection = rejectMessage(request, version);
  if (rejection !== undefined) {
    return rejection;
  }

  // No id means a notification: JSON-RPC forbids a reply, and every tool here
  // is read-only, so there is nothing to run for its side effects either.
  if (request.id === undefined) {
    return null;
  }
  const id = request.id;
  const method = request.method as string;

  const metadata = metadataResult(method, version);
  if (metadata !== undefined) {
    return ok(id, metadata);
  }

  if (method === "tools/call") {
    const name = params.name;
    if (typeof name !== "string") {
      return fail(id, JSONRPC_INVALID_PARAMS, '"name" is required.');
    }
    const args =
      params.arguments && typeof params.arguments === "object"
        ? (params.arguments as Record<string, unknown>)
        : {};
    return ok(id, await callTool(name, args, fetchText));
  }

  return fail(id, JSONRPC_METHOD_NOT_FOUND, `Unknown method "${method}".`);
}
