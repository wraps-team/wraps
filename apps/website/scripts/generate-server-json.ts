/**
 * Regenerates server.json from the MCP server card constants, for publishing
 * the remote server to the official MCP registry.
 * Run with `pnpm --filter wraps-website mcp:server-json`.
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { SERVER_CARD } from "../src/lib/mcp-server-card";

export const buildServerJson = () => ({
  $schema:
    "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  name: SERVER_CARD.name,
  title: SERVER_CARD.title,
  description: SERVER_CARD.description,
  repository: SERVER_CARD.repository,
  version: SERVER_CARD.version,
  websiteUrl: SERVER_CARD.websiteUrl,
  remotes: SERVER_CARD.remotes.map(({ type, url }) => ({ type, url })),
});

const outputPath = resolve(import.meta.dirname, "..", "server.json");

writeFileSync(
  outputPath,
  `${JSON.stringify(buildServerJson(), null, 2)}\n`,
  "utf8"
);
process.stdout.write(`Wrote ${outputPath}\n`);
