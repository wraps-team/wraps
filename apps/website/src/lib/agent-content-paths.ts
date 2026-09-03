// Paths with hand-authored markdown in AGENT_CONTENT.
//
// This is no longer the site's markdown coverage — every page is served as
// markdown, derived from its own render when it has no entry here (see
// lib/derive-markdown.ts). What this list still decides is which pages get the
// better, hand-written version instead of the derived one.
//
// Kept separate from agent-content.ts so middleware (edge bundle) doesn't
// pull in the full content strings.
export const AGENT_CONTENT_PATHS: readonly string[] = [
  "/pricing",
  "/pricing.md",
  "/tools/ses-calculator",
  "/",
  "/docs/quickstart/email",
  "/docs/quickstart/email/agents",
  "/docs/mcp-reference",
  "/docs/quickstart/email/nextjs",
  "/docs/quickstart/sms",
  "/docs/quickstart/platform",
  "/docs/sdk-reference",
  "/docs/cli-reference",
  "/docs/cli-reference/email",
  "/docs/guides/domain-verification",
  "/docs/guides/webhooks",
  // Ranked alternatives lists. Hardcoded rather than derived from
  // config/alternatives.ts on purpose: that module is ~40KB of prose and this
  // one is imported by middleware, which runs on the edge. A test in
  // src/__tests__/alternatives.test.ts fails if the two lists diverge.
  "/alternatives/resend",
  "/alternatives/sendgrid",
  "/alternatives/postmark",
  "/alternatives/mailgun",
  "/alternatives/customer-io",
  "/alternatives/agentmail",
];

const AGENT_CONTENT_PATH_SET = new Set(AGENT_CONTENT_PATHS);

export function hasMarkdown(path: string): boolean {
  return AGENT_CONTENT_PATH_SET.has(path);
}

/**
 * The `.md` URL for a page.
 *
 * Defined for every path, not just the hand-authored ones: /api/md derives
 * markdown from the page's own render when AGENT_CONTENT has no entry, so a
 * `.md` URL is a real representation of any page on the site. For a path that
 * is not a page at all it resolves to a markdown 404 — the same answer the
 * HTML gives, in the format the caller asked for.
 *
 * The root is `/index.md` because `/.md` is not a URL anyone would guess.
 */
export function markdownUrlFor(path: string): string {
  if (path.endsWith(".md")) {
    return path;
  }
  return path === "/" ? "/index.md" : `${path}.md`;
}

/**
 * The page a `.md` URL refers to, whether or not that page has markdown.
 *
 * `/pricing.md` is returned as-is: it is a covered path in its own right, and
 * stripping the suffix would point at a page that only exists as an anchor.
 */
export function pageForMarkdownUrl(pathname: string): string | undefined {
  if (!pathname.endsWith(".md")) {
    return;
  }
  if (hasMarkdown(pathname)) {
    return pathname;
  }
  if (pathname === "/index.md") {
    return "/";
  }
  return pathname.slice(0, -".md".length);
}

/**
 * AI crawlers that never send `Accept: text/markdown` but are exactly who the
 * markdown is for. Deliberately excludes search crawlers (Googlebot, Bingbot):
 * they should index the same HTML a person sees.
 */
const MARKDOWN_PREFERRING_BOTS = [
  "gptbot",
  "chatgpt-user",
  "oai-searchbot",
  "claudebot",
  "claude-user",
  "claude-searchbot",
  "anthropic-ai",
  "perplexitybot",
  "perplexity-user",
  "google-extended",
  "applebot-extended",
  "ora-agent",
  "deepseekbot",
  "bytespider",
  "meta-externalagent",
  "cohere-ai",
  "youbot",
];

export function prefersMarkdown(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  return MARKDOWN_PREFERRING_BOTS.some((bot) => ua.includes(bot));
}
