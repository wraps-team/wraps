import {
  SERVER_CAPABILITIES,
  SERVER_INFO,
  SUPPORTED_PROTOCOL_VERSIONS,
} from "@/lib/mcp-server";

/**
 * MCP Server Card (SEP-2127 / `io.modelcontextprotocol/server-card`).
 *
 * A card describes a *remote* server only — identity, transport, protocol
 * versions. It deliberately omits tools, resources, prompts, and capabilities:
 * those vary per user and session, so the spec keeps them at runtime behind
 * `tools/list` and `server/discover`. The stdio server stays in
 * `/.well-known/mcp.json`, which is our own richer manifest.
 *
 * Built from the same constants the live server answers `initialize` with, so
 * the card cannot drift from the endpoint it advertises.
 */

/** Exact URI the schema's `$schema` pattern requires. Not yet resolvable. */
const SCHEMA_URL =
  "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json";

export const SERVER_CARD_MEDIA_TYPE = "application/mcp-server-card+json";
export const AI_CATALOG_MEDIA_TYPE = "application/ai-catalog+json";

/** Reverse-DNS, exactly one slash — the schema rejects a bare "wraps". */
export const SERVER_CARD_NAME = "dev.wraps/docs";

/** Where the card itself lives: `<streamable-http-url>` + `/server-card`. */
export const SERVER_CARD_URL = "https://wraps.dev/mcp/server-card";

// The schema caps `description` at 100 characters, so this is much shorter
// than SERVER_INSTRUCTIONS rather than a second description of the server.
const DESCRIPTION =
  "Search the Wraps docs and estimate AWS SES costs. Public, read-only, no authentication.";

export const SERVER_CARD = {
  $schema: SCHEMA_URL,
  name: SERVER_CARD_NAME,
  version: SERVER_INFO.version,
  title: SERVER_INFO.title,
  description: DESCRIPTION,
  websiteUrl: SERVER_INFO.websiteUrl,
  repository: {
    url: "https://github.com/wraps-team/wraps",
    source: "github",
    subfolder: "apps/website",
  },
  icons: [
    {
      src: "https://wraps.dev/android-chrome-512x512.png",
      mimeType: "image/png",
      sizes: ["512x512"],
    },
    {
      src: "https://wraps.dev/android-chrome-192x192.png",
      mimeType: "image/png",
      sizes: ["192x192"],
    },
  ],
  remotes: [
    {
      type: "streamable-http",
      url: "https://wraps.dev/mcp",
      supportedProtocolVersions: [...SUPPORTED_PROTOCOL_VERSIONS],
    },
  ],
  _meta: {
    "dev.wraps/manifest": "https://wraps.dev/.well-known/mcp.json",
    "dev.wraps/documentation": "https://wraps.dev/docs/mcp-reference",
  },
} as const;

/**
 * Field names that predate SEP-2127 and that readiness scanners still key on.
 * Merged into the `.well-known` copy only; the canonical card omits them so it
 * validates against the published schema, which has no place for them.
 *
 * `serverInfo` repeats the identity the live server returns from `initialize`,
 * so a scanner reads the same name the protocol reports rather than the
 * reverse-DNS card name.
 */
export const SERVER_INFO_COMPAT = {
  serverInfo: { name: SERVER_INFO.name, version: SERVER_INFO.version },
  endpoint: "https://wraps.dev/mcp",
  transport: "streamable-http",
  capabilities: SERVER_CAPABILITIES,
} as const;

/**
 * Headers the discovery spec makes normative for a hosted card: wide-open CORS
 * (the document is public, read-only metadata) and a cacheable response.
 */
export const serverCardHeaders = (contentType: string) => ({
  "Content-Type": contentType,
  "Cache-Control": "public, max-age=3600",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET",
  "Access-Control-Allow-Headers": "Content-Type, If-None-Match",
  "Access-Control-Expose-Headers": "ETag",
});
