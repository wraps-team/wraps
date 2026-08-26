/**
 * Public Wraps MCP server over the Streamable HTTP transport.
 *
 * Reached at https://wraps.dev/mcp — middleware rewrites MCP traffic there so
 * browsers keep getting the product page at the same URL. Stateless by design:
 * no session is issued, so every POST is self-contained and any client may
 * retry or fan out without coordination.
 */

import type { NextRequest } from "next/server";
import {
  handleMessage,
  JSONRPC_INVALID_REQUEST,
  JSONRPC_PARSE_ERROR,
  type JsonRpcResponse,
  type TextFetcher,
} from "@/lib/mcp-server";

// The docs corpus is fetched per request; nothing here may be cached as static.
export const dynamic = "force-dynamic";

const ASSET_REVALIDATE_SECONDS = 3600;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Accept, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Mcp-Method, Mcp-Name, Last-Event-ID",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, MCP-Protocol-Version",
  "Access-Control-Max-Age": "86400",
} as const;

const JSON_HEADERS = {
  ...CORS_HEADERS,
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
} as const;

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extra },
  });
}

function rpcError(code: number, message: string, status: number) {
  return json({ jsonrpc: "2.0", id: null, error: { code, message } }, status);
}

/**
 * Reads a public text asset off the site itself. Static assets are served by
 * the CDN, so this stays a cache hit in practice and needs no filesystem
 * access from the serverless function.
 */
function textFetcher(request: NextRequest): TextFetcher {
  const origin = request.nextUrl.origin;
  return async (path: string) => {
    const response = await fetch(new URL(path, origin), {
      next: { revalidate: ASSET_REVALIDATE_SECONDS },
    });
    if (!response.ok) {
      throw new Error(
        `Could not read ${path} (HTTP ${response.status}). Read https://wraps.dev${path} directly.`
      );
    }
    return await response.text();
  };
}

export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return rpcError(
      JSONRPC_PARSE_ERROR,
      "Request body is not valid JSON.",
      400
    );
  }

  const fetchText = textFetcher(request);

  // JSON-RPC batching: supported through 2025-03-26, removed in 2025-06-18.
  // Accepting it costs one map and keeps older clients working.
  if (Array.isArray(payload)) {
    if (payload.length === 0) {
      return rpcError(JSONRPC_INVALID_REQUEST, "Empty batch.", 400);
    }
    const responses = (
      await Promise.all(
        payload.map((message) => handleMessage(message, fetchText))
      )
    ).filter((entry): entry is JsonRpcResponse => entry !== null);
    return responses.length === 0
      ? new Response(null, { status: 202, headers: CORS_HEADERS })
      : json(responses);
  }

  const response = await handleMessage(payload, fetchText);

  // Notifications and responses get 202 with no body, per the transport spec.
  if (response === null) {
    return new Response(null, { status: 202, headers: CORS_HEADERS });
  }

  return json(response);
}

/**
 * This server never opens a server-initiated stream, so GET is 405 — which is
 * exactly how the transport spec says to decline it.
 */
export function GET() {
  return json(
    {
      jsonrpc: "2.0",
      id: null,
      error: {
        code: JSONRPC_INVALID_REQUEST,
        message:
          "This MCP endpoint is stateless: POST JSON-RPC to https://wraps.dev/mcp. It opens no server-initiated SSE stream.",
      },
    },
    405,
    { Allow: "POST, OPTIONS" }
  );
}

/** No sessions exist, so there is nothing for a client to terminate. */
export function DELETE() {
  return json(
    {
      jsonrpc: "2.0",
      id: null,
      error: {
        code: JSONRPC_INVALID_REQUEST,
        message: "This MCP endpoint is stateless and issues no session to end.",
      },
    },
    405,
    { Allow: "POST, OPTIONS" }
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
