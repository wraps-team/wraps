import {
  AI_CATALOG_MEDIA_TYPE,
  SERVER_CARD_URL,
  serverCardHeaders,
} from "@/lib/mcp-server-card";

export const dynamic = "force-static";

/**
 * Domain-level discovery. This is the document the spec actually puts under
 * `.well-known`: it names the cards this domain advertises and where to fetch
 * each one, leaving the cards themselves free to live anywhere.
 */
export function GET() {
  const catalog = {
    specVersion: "1.0",
    entries: [
      {
        identifier: "urn:air:wraps.dev:mcp:docs",
        type: "application/mcp-server-card+json",
        url: SERVER_CARD_URL,
      },
    ],
  };

  return Response.json(catalog, {
    headers: serverCardHeaders(AI_CATALOG_MEDIA_TYPE),
  });
}
