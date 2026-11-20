import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/page-metadata";
import AgentEmailQuickstartPageContent from "./page-content";

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
      name: "Quickstart",
      item: "https://wraps.dev/docs/quickstart",
    },
    {
      "@type": "ListItem",
      position: 3,
      name: "Email",
      item: "https://wraps.dev/docs/quickstart/email",
    },
    {
      "@type": "ListItem",
      position: 4,
      name: "Agents",
      item: "https://wraps.dev/docs/quickstart/email/agents",
    },
  ],
};

export const metadata: Metadata = pageMetadata({
  title: "Agent Email Quickstart",
  description:
    "Wire Wraps into your agent's tool calls. Deploy AWS SES, install the SDK, and let your agent send transactional email from your AWS account.",
  path: "/docs/quickstart/email/agents",
  social: {
    twitterCopy: {
      description:
        "Wire Wraps into your agent's tool calls. Deploy AWS SES, install the SDK, and let your agent send email from your AWS account.",
    },
  },
});

export default function AgentEmailQuickstartPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      <article aria-hidden="true" className="sr-only">
        <h2>Agent Email Quickstart</h2>
        <p>Give your agent a sender that lives in your AWS account.</p>
        <h2>Step 1: Deploy infrastructure</h2>
        <h2>Step 2: Install the SDK</h2>
        <h2>Step 3: Write the agent tool</h2>
        <h2>Step 4: Give your AI editor Wraps docs</h2>
        <h2>Step 5: Give your agent live access with the Wraps MCP server</h2>
      </article>
      <AgentEmailQuickstartPageContent />
    </>
  );
}
