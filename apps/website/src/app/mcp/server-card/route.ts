import {
  SERVER_CARD,
  SERVER_CARD_MEDIA_TYPE,
  serverCardHeaders,
} from "@/lib/mcp-server-card";

export const dynamic = "force-static";

/**
 * The location SEP-2127 reserves for a card: the streamable-HTTP URL
 * (`https://wraps.dev/mcp`) plus `/server-card`. Middleware only rewrites
 * `/mcp` and `/mcp/` onto the JSON-RPC handler, so this path stays ours.
 */
export function GET() {
  return Response.json(SERVER_CARD, {
    headers: serverCardHeaders(SERVER_CARD_MEDIA_TYPE),
  });
}
