export const dynamic = "force-static";

export function GET() {
  const content = `# Wraps - Email Infrastructure for Developers
# https://wraps.dev

# AI agents: complete docs in one file at https://wraps.dev/llms-full.txt
# Agent-oriented index at https://wraps.dev/llms.txt
# MCP server (Streamable HTTP, no auth): POST https://wraps.dev/mcp
# Manifest at https://wraps.dev/.well-known/mcp.json

# Content Signals (https://contentsignals.org/)
Content-Signal: ai-train=no, search=yes, ai-input=yes

User-agent: *
Allow: /
# The agent-facing endpoints live under /api/ and are meant to be called.
# Longest-match wins, so these override the blanket /api/ rule below.
Allow: /api/pricing/estimate
Allow: /api/mcp
Allow: /api/md/
Disallow: /api/
Disallow: /ingest/
Disallow: /_next/

Sitemap: https://wraps.dev/sitemap.xml
`;

  return new Response(content, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
