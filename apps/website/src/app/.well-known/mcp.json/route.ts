import {
  SERVER_INFO,
  SERVER_INSTRUCTIONS,
  SUPPORTED_PROTOCOL_VERSIONS,
  TOOLS,
} from "@/lib/mcp-server";

export const dynamic = "force-static";

// A placeholder for the copy-paste config block, not a region this app talks
// to. The local server exits at startup without AWS_REGION set, so the example
// has to name one.
// biome-ignore-start lint/plugin: documentation placeholder, not a client region
const EXAMPLE_AWS_REGION = "us-east-1";
// biome-ignore-end lint/plugin: documentation placeholder, not a client region

/**
 * Discovery manifest for the two Wraps MCP servers: the public remote one this
 * site hosts, and the stdio one that drives a customer's own AWS account.
 */
export function GET() {
  const manifest = {
    schemaVersion: "2026-07-28",
    name: SERVER_INFO.name,
    title: SERVER_INFO.title,
    version: SERVER_INFO.version,
    description: SERVER_INSTRUCTIONS,
    websiteUrl: SERVER_INFO.websiteUrl,
    documentationUrl: "https://wraps.dev/docs/mcp-reference",
    servers: [
      {
        name: "wraps-docs",
        title: "Wraps docs & pricing (remote)",
        transport: "streamable-http",
        url: "https://wraps.dev/mcp",
        authentication: "none",
        protocolVersions: [...SUPPORTED_PROTOCOL_VERSIONS],
        tools: TOOLS.map((tool) => ({
          name: tool.name,
          description: tool.description,
        })),
      },
      {
        name: "wraps",
        title: "Wraps email operations (local)",
        transport: "stdio",
        package: "@wraps.dev/mcp",
        registry: "https://www.npmjs.com/package/@wraps.dev/mcp",
        command: "npx",
        args: ["-y", "@wraps.dev/mcp"],
        env: { AWS_REGION: EXAMPLE_AWS_REGION },
        authentication:
          "AWS credentials resolved from the caller's own environment. No Wraps API key.",
        tools: [
          {
            name: "list_recent_sends",
            description: "Recent sends from your own email history table",
          },
          {
            name: "get_email_event_log",
            description:
              "Delivery, bounce, complaint, open, and click events for a message",
          },
          {
            name: "verify_domain_status",
            description: "DKIM, SPF, and DMARC status for a sending domain",
          },
          {
            name: "list_suppressions",
            description: "Account-level SES suppression list entries",
          },
          {
            name: "send_email",
            description:
              "Send through your SES identity — disabled by default, allowlisted and capped when enabled",
          },
        ],
      },
    ],
    config: {
      mcpServers: {
        "wraps-docs": { type: "http", url: "https://wraps.dev/mcp" },
        wraps: {
          command: "npx",
          args: ["-y", "@wraps.dev/mcp"],
          env: { AWS_REGION: EXAMPLE_AWS_REGION },
        },
      },
    },
  };

  return Response.json(manifest, {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}
