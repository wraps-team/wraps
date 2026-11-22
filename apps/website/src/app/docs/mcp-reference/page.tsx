import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";
import McpReferencePageContent from "./page-content";

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "Docs",
      item: "https://wraps.dev/docs",
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "MCP Server",
      item: "https://wraps.dev/docs/mcp-reference",
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "MCP Server Reference",
  description:
    "Connect @wraps.dev/mcp to Claude Code, Claude Desktop, or Cursor. Tools, configuration, write-mode guardrails, and enforced mode for the Wraps email MCP server.",
  path: "/docs/mcp-reference",
  social: {
    description:
      "Connect @wraps.dev/mcp to Claude Code, Claude Desktop, or Cursor. Tools, configuration, write-mode guardrails, and enforced mode.",
    twitterCopy: {
      description:
        "Tools, configuration, and guardrails for the Wraps email MCP server.",
    },
  },
});

export default function McpReferencePage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      <article aria-hidden="true" className="sr-only">
        <h1>MCP Server Reference</h1>
        <p>
          The Wraps MCP server (@wraps.dev/mcp) gives AI agents access to your
          AWS SES sending history, delivery events, domain status, and
          suppression list — plus guarded email sending. It runs locally over
          stdio; your AWS credentials never leave your machine.
        </p>
        <h2>Tools</h2>
        <h2>Setup</h2>
        <h2>Configuration</h2>
        <h2>Write mode</h2>
        <h2>Send guardrails</h2>
        <h2>Enforced mode</h2>
      </article>
      <McpReferencePageContent />
    </>
  );
}
