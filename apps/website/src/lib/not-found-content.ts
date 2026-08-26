/**
 * The recovery surface for a 404. Shared by the HTML page (app/not-found.tsx)
 * and the markdown responses (app/api/md/[...path]) so a human and an agent
 * are pointed at exactly the same places.
 *
 * A bare "404" is a dead end for an agent: it has no way to tell a typo from a
 * page that never existed, and no next move. Naming the index files and the
 * sitemap turns the miss into one more fetch.
 */

export type RecoveryLink = {
  href: string;
  label: string;
  description: string;
};

export const NOT_FOUND_LINKS: readonly RecoveryLink[] = [
  {
    href: "/docs",
    label: "Documentation",
    description: "Quickstarts, guides, and every SDK and CLI reference",
  },
  {
    href: "/llms.txt",
    label: "llms.txt",
    description: "Machine-readable index of every page on this site",
  },
  {
    href: "/llms-full.txt",
    label: "llms-full.txt",
    description: "The whole documentation corpus in one markdown file",
  },
  {
    href: "/sitemap.xml",
    label: "sitemap.xml",
    description: "Every indexable URL on wraps.dev",
  },
  {
    href: "/docs/quickstart/email",
    label: "Email quickstart",
    description: "Deploy AWS SES email infrastructure in one command",
  },
  {
    href: "/mcp",
    label: "MCP server",
    description: "Query docs and pricing over Model Context Protocol",
  },
];

const SITE = "https://wraps.dev";

/**
 * A short markdown body for a 404. `path` is echoed back so a client that
 * followed a bad link can see which URL failed.
 */
export function renderNotFoundMarkdown(path?: string): string {
  const requested = path ? `\n\nRequested path: \`${path}\`` : "";
  const links = NOT_FOUND_LINKS.map(
    (link) => `- [${link.label}](${SITE}${link.href}): ${link.description}`
  ).join("\n");

  return `# 404 — Page not found

That page does not exist on wraps.dev.${requested}

## Where to look next

${links}

Docs pages listed in llms.txt also return markdown when requested with \`Accept: text/markdown\`.
`;
}
