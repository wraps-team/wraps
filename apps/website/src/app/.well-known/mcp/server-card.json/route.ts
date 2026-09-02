import {
  SERVER_CARD,
  SERVER_INFO_COMPAT,
  serverCardHeaders,
} from "@/lib/mcp-server-card";

export const dynamic = "force-static";

/**
 * A second copy of the card at the path scanners probe.
 *
 * SEP-2127 argues against `.well-known` for a single server's card and points
 * clients at the AI Catalog instead, but readiness scanners look here, and a
 * 404 reads as "no MCP server". Serving the same bytes costs nothing.
 *
 * This copy also carries the pre-SEP field names some scanners still require
 * (`serverInfo`, `endpoint`). They are additive, and they stay off the
 * canonical card so that document validates cleanly against the schema.
 */
export function GET() {
  return Response.json(
    { ...SERVER_CARD, ...SERVER_INFO_COMPAT },
    { headers: serverCardHeaders("application/json") }
  );
}
