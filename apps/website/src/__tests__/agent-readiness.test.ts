import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { AGENT_CONTENT } from "@/lib/agent-content";
import {
  AGENT_CONTENT_PATHS,
  markdownUrlFor,
  pageForMarkdownUrl,
  prefersMarkdown,
} from "@/lib/agent-content-paths";
import {
  callTool,
  FALLBACK_PROTOCOL_VERSION,
  handleMessage,
  SUPPORTED_PROTOCOL_VERSIONS,
  searchSections,
  splitMarkdownSections,
  type TextFetcher,
  TOOLS,
} from "@/lib/mcp-server";
import {
  NOT_FOUND_LINKS,
  renderNotFoundMarkdown,
} from "@/lib/not-found-content";
import { middleware } from "@/middleware";

const webRoot = resolve(__dirname, "..", "..");
const read = (relativePath: string) =>
  readFileSync(resolve(webRoot, relativePath), "utf8");

const DOCS_FIXTURE = `# Wraps

Intro line.

## Domain Verification

Run wraps email domains add to start DKIM verification.

## Batch Sending

Use email.sendBatch for up to 50 destinations.
`;

const fixtureFetcher: TextFetcher = (path) => {
  if (path === "/llms-full.txt") {
    return Promise.resolve(DOCS_FIXTURE);
  }
  if (path === "/llms.txt") {
    return Promise.resolve("# Wraps\n\n- [Docs](https://wraps.dev/docs)\n");
  }
  throw new Error(`unexpected fetch of ${path}`);
};

const rpc = (method: string, params?: Record<string, unknown>, id = 1) =>
  handleMessage({ jsonrpc: "2.0", id, method, params }, fixtureFetcher);

// ---------------------------------------------------------------------------
// 1. Agent-friendly 404s
// ---------------------------------------------------------------------------

describe("a 404 tells an agent where to go next", () => {
  it("names the sitemap, both llms.txt files, and the docs index", () => {
    const markdown = renderNotFoundMarkdown();

    expect(markdown).toContain("# 404 — Page not found");
    for (const url of [
      "https://wraps.dev/sitemap.xml",
      "https://wraps.dev/llms.txt",
      "https://wraps.dev/llms-full.txt",
      "https://wraps.dev/docs",
    ]) {
      expect(markdown).toContain(url);
    }
  });

  it("echoes the path that missed, so a client can see which link was stale", () => {
    expect(renderNotFoundMarkdown("/docs/does-not-exist")).toContain(
      "`/docs/does-not-exist`"
    );
    expect(renderNotFoundMarkdown()).not.toContain("Requested path");
  });

  it("renders every recovery link as a real markdown link with a description", () => {
    const markdown = renderNotFoundMarkdown();

    for (const link of NOT_FOUND_LINKS) {
      expect(markdown).toContain(
        `[${link.label}](https://wraps.dev${link.href})`
      );
      expect(markdown).toContain(link.description);
    }
  });

  it("serves that markdown body — not a bare sentence — from /api/md on a miss", async () => {
    const { GET } = await import("@/app/api/md/[...path]/route");
    const response = await GET(
      new NextRequest("https://wraps.dev/api/md/docs/nope"),
      { params: Promise.resolve({ path: ["docs", "nope"] }) }
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("text/markdown");

    const body = await response.text();
    expect(body).toContain("# 404 — Page not found");
    expect(body).toContain("/docs/nope");
    expect(body).toContain("https://wraps.dev/sitemap.xml");
  });

  it("keeps the HTML 404 page pointing at the same list, and answers markdown requests in markdown", () => {
    const source = read("src/app/not-found.tsx");

    expect(source).toContain("NOT_FOUND_LINKS");
    expect(source).toContain("renderNotFoundMarkdown");
    expect(source).toContain('accept.includes("text/markdown")');
  });
});

// ---------------------------------------------------------------------------
// 2. Content without JavaScript
// ---------------------------------------------------------------------------

describe("the landing FAQ survives with JavaScript off", () => {
  it("renders every answer inside <noscript>, because Radix ships its panels hidden", () => {
    const source = read("src/app/landing/components/faq-section.tsx");
    const noscript = source.slice(
      source.indexOf("<noscript>"),
      source.indexOf("</noscript>")
    );

    expect(noscript).not.toBe("");
    expect(noscript).toContain("faqItems.map");
    expect(noscript).toContain("item.question");
    expect(noscript).toContain("item.answer");
  });

  it("gives every FAQ item plain-text answer copy for that fallback to render", async () => {
    const { faqItems } = await import("@/app/landing/components/faq-items");

    expect(faqItems.length).toBeGreaterThan(0);
    for (const item of faqItems) {
      expect(item.question.length).toBeGreaterThan(10);
      // The rich answer is JSX and cannot be server-rendered into <noscript>
      // as text; the plain string is what the fallback shows.
      expect(item.answer.length).toBeGreaterThan(40);
    }
  });
});

// ---------------------------------------------------------------------------
// 3 + 8. Developer resources and the CLI at predictable URLs
// ---------------------------------------------------------------------------

describe("developer resources are reachable by guessed name", () => {
  it("redirects the URLs an agent guesses before it reads llms.txt", async () => {
    const config = (await import("../../next.config")).default as {
      redirects: () => Promise<Array<{ source: string; destination: string }>>;
    };
    const redirects = await config.redirects();
    const bySource = new Map(redirects.map((r) => [r.source, r.destination]));

    expect(bySource.get("/openapi.json")).toBe(
      "https://api.wraps.dev/swagger/json"
    );
    expect(bySource.get("/api-docs")).toBe("/docs/reference/api");
    expect(bySource.get("/docs/api")).toBe("/docs/reference/api");
    expect(bySource.get("/mcp.json")).toBe("/.well-known/mcp.json");
    expect(bySource.get("/llms")).toBe("/llms.txt");
  });

  it("names each resource with the product name in llms.txt, so a 'wraps X' search can match", () => {
    const llms = read("public/llms.txt");

    for (const line of [
      "Wraps API reference",
      "Wraps OpenAPI spec",
      "Wraps MCP servers",
      "Wraps CLI",
      "Wraps SDKs",
      "Wraps webhooks",
      "Wraps authentication",
    ]) {
      expect(llms).toContain(line);
    }
  });

  it("publishes the CLI as an installable package, not just a mention", () => {
    const llms = read("public/llms.txt");

    expect(llms).toContain("npm install -g @wraps.dev/cli");
    expect(llms).toContain("https://www.npmjs.com/package/@wraps.dev/cli");

    const agentCard = JSON.parse(read("public/.well-known/agent.json")) as {
      packages: Record<string, { name: string; url: string; registry: string }>;
    };
    expect(agentCard.packages.cli.name).toBe("@wraps.dev/cli");
    expect(agentCard.packages.cli.registry).toBe("npm");
    expect(agentCard.packages.cli.url).toContain("npmjs.com");
  });

  it("does not pin a CLI version in JSON-LD that npm will move past", () => {
    // The comment explaining the absence is fine; a pinned value is not.
    expect(read("src/app/cli/page.tsx")).not.toMatch(/softwareVersion:\s*"/);
  });

  it("lets crawlers reach the endpoints llms.txt tells them to call", () => {
    const robots = read("src/app/robots.txt/route.ts");

    expect(robots).toContain("Allow: /api/pricing/estimate");
    expect(robots).toContain("Allow: /api/mcp");
    expect(robots).toContain("Disallow: /api/");
  });
});

// ---------------------------------------------------------------------------
// 4 + 7. Brand and organization structured data
// ---------------------------------------------------------------------------

describe("structured data identifies the business", () => {
  const layout = read("src/app/layout.tsx");

  it("carries a PostalAddress alongside the contact points", () => {
    expect(layout).toContain('"@type": "PostalAddress"');
    expect(layout).toContain('addressRegion: "CO"');
    expect(layout).toContain('addressCountry: "US"');
    expect(layout).toContain('contactType: "customer support"');
  });

  it("claims no more than /terms and /privacy already state", () => {
    const terms = read("src/app/terms/page.tsx");
    expect(terms).toContain("State of");
    expect(terms).toContain("Colorado");
    // A street address would be a claim the published record does not make.
    expect(layout).not.toContain("streetAddress");
  });

  it("names the site itself so a brand query has something to match", () => {
    expect(layout).toContain('"@type": "WebSite"');
    expect(layout).toContain("alternateName");
    expect(layout).toContain("https://wraps.dev/#organization");
  });

  it("states the free tier in the homepage SoftwareApplication offer", () => {
    const page = read("src/app/page.tsx");

    expect(page).toContain('"@type": "SoftwareApplication"');
    expect(page).toContain("isAccessibleForFree: true");
    expect(page).toContain('price: "0"');
  });
});

// ---------------------------------------------------------------------------
// 5. MCP server
// ---------------------------------------------------------------------------

describe("MCP: lifecycle", () => {
  it("answers initialize with the client's own protocol version when it is supported", async () => {
    const response = await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "1.0.0" },
    });

    expect(response?.error).toBeUndefined();
    const result = response?.result as {
      protocolVersion: string;
      capabilities: { tools: unknown };
      serverInfo: { name: string };
      instructions: string;
    };
    expect(result.protocolVersion).toBe("2025-06-18");
    expect(result.capabilities.tools).toBeDefined();
    expect(result.serverInfo.name).toBe("wraps");
    expect(result.instructions).toContain("search_docs");
  });

  it("falls back to a version it does support when the client names none", async () => {
    const response = await rpc("initialize", {});
    const result = response?.result as { protocolVersion: string };

    expect(result.protocolVersion).toBe(FALLBACK_PROTOCOL_VERSION);
    expect(SUPPORTED_PROTOCOL_VERSIONS).toContain(FALLBACK_PROTOCOL_VERSION);
  });

  it("rejects an unknown protocol version with -32022 and the list it does speak", async () => {
    const response = await rpc("initialize", { protocolVersion: "1900-01-01" });

    expect(response?.error?.code).toBe(-32_022);
    expect(response?.error?.data).toEqual({
      supported: [...SUPPORTED_PROTOCOL_VERSIONS],
      requested: "1900-01-01",
    });
  });

  it("answers server/discover for clients that probe before initializing", async () => {
    const response = await rpc("server/discover", {
      _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28" },
    });
    const result = response?.result as {
      resultType: string;
      supportedVersions: string[];
      cacheScope: string;
      _meta: Record<string, { name: string }>;
    };

    expect(result.resultType).toBe("complete");
    expect(result.supportedVersions).toContain("2026-07-28");
    expect(result.cacheScope).toBe("public");
    expect(result._meta["io.modelcontextprotocol/serverInfo"].name).toBe(
      "wraps"
    );
  });

  it("returns nothing for a notification — the transport answers 202", async () => {
    const response = await handleMessage(
      { jsonrpc: "2.0", method: "notifications/initialized" },
      fixtureFetcher
    );

    expect(response).toBeNull();
  });

  it("answers ping so a client can health-check the endpoint", async () => {
    expect((await rpc("ping"))?.result).toEqual({});
  });

  it("reports an unknown method as -32601 rather than failing silently", async () => {
    const response = await rpc("tools/frobnicate");

    expect(response?.error?.code).toBe(-32_601);
  });

  it("rejects a body that is not a JSON-RPC object", async () => {
    const response = await handleMessage("hello", fixtureFetcher);

    expect(response?.error?.code).toBe(-32_600);
  });
});

describe("MCP: tools", () => {
  it("lists every tool with a description and an object input schema", async () => {
    const response = await rpc("tools/list");
    const { tools } = response?.result as {
      tools: Array<{
        name: string;
        description: string;
        inputSchema: { type: string };
      }>;
    };

    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "estimate_cost",
      "get_doc",
      "list_docs",
      "search_docs",
    ]);
    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(40);
      expect(tool.inputSchema.type).toBe("object");
    }
  });

  it("splits a markdown doc on its headings", () => {
    const sections = splitMarkdownSections(DOCS_FIXTURE);

    expect(sections.map((section) => section.heading)).toEqual([
      "Wraps",
      "Domain Verification",
      "Batch Sending",
    ]);
  });

  it("ranks a heading match above a body-only match", () => {
    const results = searchSections(DOCS_FIXTURE, "batch", 5);

    expect(results[0].heading).toBe("Batch Sending");
  });

  it("search_docs returns the matching section, not the whole corpus", async () => {
    const result = await callTool(
      "search_docs",
      { query: "domain verification" },
      fixtureFetcher
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Domain Verification");
    expect(result.content[0].text).toContain("DKIM");
    expect(result.content[0].text).not.toContain("sendBatch");
  });

  it("search_docs says so — and points elsewhere — when nothing matches", async () => {
    const result = await callTool(
      "search_docs",
      { query: "zzzzqqq" },
      fixtureFetcher
    );

    expect(result.content[0].text).toContain("No section");
    expect(result.content[0].text).toContain("llms-full.txt");
    expect(
      (result.structuredContent as { matches: unknown[] }).matches
    ).toEqual([]);
  });

  it("get_doc returns the exact markdown the site serves for that path", async () => {
    const result = await callTool(
      "get_doc",
      { path: "/docs/sdk-reference" },
      fixtureFetcher
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe(AGENT_CONTENT["/docs/sdk-reference"]);
  });

  it("get_doc accepts a full URL and a trailing slash, which is how agents type it", async () => {
    const fromUrl = await callTool(
      "get_doc",
      { path: "https://wraps.dev/docs/sdk-reference/" },
      fixtureFetcher
    );

    expect(fromUrl.content[0].text).toBe(AGENT_CONTENT["/docs/sdk-reference"]);
  });

  it("get_doc lists the paths that do work when one does not", async () => {
    const result = await callTool(
      "get_doc",
      { path: "/docs/not-a-page" },
      fixtureFetcher
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("/docs/sdk-reference");
    expect(result.content[0].text).toContain("llms-full.txt");
  });

  it("estimate_cost returns both a readable table and structured totals", async () => {
    const result = await callTool(
      "estimate_cost",
      {
        emails: 500_000,
        events: 250_000,
        tier: "business",
        sesPlan: "alacarte",
      },
      fixtureFetcher
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("|");

    const structured = result.structuredContent as {
      total: number;
      currency: string;
      shareUrl: string;
    };
    expect(structured.currency).toBe("USD");
    expect(structured.total).toBeGreaterThan(0);
    expect(structured.shareUrl).toContain("/tools/ses-calculator?");
    expect(structured.shareUrl).toContain("emails=500000");
  });

  it("estimate_cost rejects a bad enum with a message the model can act on", async () => {
    const result = await callTool(
      "estimate_cost",
      { emails: 1000, sesPlan: "cheapest-please" },
      fixtureFetcher
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("sesPlan");
    expect(result.content[0].text).toContain("alacarte");
  });

  it("reports a missing required argument instead of guessing one", async () => {
    const result = await callTool("estimate_cost", {}, fixtureFetcher);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("emails");
  });

  it("names the alternatives when the tool itself does not exist", async () => {
    const result = await callTool("delete_everything", {}, fixtureFetcher);

    expect(result.isError).toBe(true);
    for (const tool of TOOLS) {
      expect(result.content[0].text).toContain(tool.name);
    }
  });
});

describe("MCP: HTTP transport", () => {
  const post = async (body: unknown) => {
    const { POST } = await import("@/app/api/mcp/route");
    return await POST(
      new NextRequest("https://wraps.dev/api/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
    );
  };

  it("answers a request with valid JSON and permissive CORS", async () => {
    const response = await post({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");

    const body = (await response.json()) as { result: { tools: unknown[] } };
    expect(body.result.tools).toHaveLength(TOOLS.length);
  });

  it("returns 202 with no body for a notification", async () => {
    const response = await post({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });

    expect(response.status).toBe(202);
    expect(await response.text()).toBe("");
  });

  it("reports unparseable JSON as -32700 instead of throwing a 500", async () => {
    const { POST } = await import("@/app/api/mcp/route");
    const response = await POST(
      new NextRequest("https://wraps.dev/api/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{ not json",
      })
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: number } };
    expect(body.error.code).toBe(-32_700);
  });

  it("declines GET with 405 and a JSON body — never an HTML page", async () => {
    const { GET } = await import("@/app/api/mcp/route");
    const response = GET();

    expect(response.status).toBe(405);
    expect(response.headers.get("content-type")).toContain("application/json");
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toContain("POST");
  });

  it("answers a CORS preflight", async () => {
    const { OPTIONS } = await import("@/app/api/mcp/route");
    const response = OPTIONS();

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toContain(
      "POST"
    );
  });
});

describe("/pricing resolves instead of 404ing", () => {
  it("redirects an HTML request to the homepage pricing section", async () => {
    const response = await middleware(
      new NextRequest("https://wraps.dev/pricing", {
        headers: { accept: "text/html" },
      })
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://wraps.dev/#pricing");
  });

  it("still serves markdown to an agent — the redirect must not swallow it", async () => {
    const response = await middleware(
      new NextRequest("https://wraps.dev/pricing", {
        headers: { accept: "text/markdown" },
      })
    );

    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://wraps.dev/api/md/pricing"
    );
  });
});

describe("MCP: /mcp serves the page to browsers and the protocol to clients", () => {
  it("rewrites a POST to the JSON-RPC handler", async () => {
    const response = await middleware(
      new NextRequest("https://wraps.dev/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
      })
    );

    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://wraps.dev/api/mcp"
    );
  });

  it("rewrites a GET that asks for JSON or a stream", async () => {
    for (const accept of [
      "application/json",
      "text/event-stream",
      "application/json, text/event-stream",
    ]) {
      const response = await middleware(
        new NextRequest("https://wraps.dev/mcp", { headers: { accept } })
      );
      expect(response.headers.get("x-middleware-rewrite")).toBe(
        "https://wraps.dev/api/mcp"
      );
    }
  });

  it("leaves a browser navigation alone, so the product page still renders", async () => {
    const response = await middleware(
      new NextRequest("https://wraps.dev/mcp", {
        headers: { accept: "text/html,application/xhtml+xml" },
      })
    );

    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("does not hijack any other path", async () => {
    const response = await middleware(
      new NextRequest("https://wraps.dev/docs/mcp-reference", {
        method: "POST",
        headers: { "content-type": "application/json" },
      })
    );

    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });
});

describe("the MCP manifest describes both servers", () => {
  it("gives the remote server a URL and transport, and the local one a package", async () => {
    const { GET } = await import("@/app/.well-known/mcp.json/route");
    const manifest = (await GET().json()) as {
      servers: Array<{
        transport: string;
        url?: string;
        package?: string;
        authentication: string;
      }>;
      config: { mcpServers: Record<string, unknown> };
    };

    const remote = manifest.servers.find(
      (server) => server.transport === "streamable-http"
    );
    const local = manifest.servers.find(
      (server) => server.transport === "stdio"
    );

    expect(remote?.url).toBe("https://wraps.dev/mcp");
    expect(remote?.authentication).toBe("none");
    expect(local?.package).toBe("@wraps.dev/mcp");
    expect(Object.keys(manifest.config.mcpServers)).toContain("wraps-docs");
  });

  it("advertises exactly the tools the server implements", async () => {
    const { GET } = await import("@/app/.well-known/mcp.json/route");
    const manifest = (await GET().json()) as {
      servers: Array<{ transport: string; tools: Array<{ name: string }> }>;
    };
    const remote = manifest.servers.find(
      (server) => server.transport === "streamable-http"
    );

    expect(remote?.tools.map((tool) => tool.name).sort()).toEqual(
      TOOLS.map((tool) => tool.name).sort()
    );
  });
});

// ---------------------------------------------------------------------------
// 6. Onboarding an agent can complete alone
// ---------------------------------------------------------------------------

describe("onboarding signals are stated where an agent will find them", () => {
  const llms = read("public/llms.txt");
  const agentCard = JSON.parse(read("public/.well-known/agent.json")) as {
    onboarding: {
      free_tier: { available: boolean; price: string; url: string };
      signup: { self_serve: boolean; sales_contact_required: boolean };
      api_keys: { self_serve: boolean; url: string };
      sandbox: { available: boolean; test_addresses: string[] };
      zero_auth_endpoints: string[];
    };
    mcp: { remote: { url: string; authentication: string } };
  };

  it("states a free tier, self-serve keys, and no sales gate in the agent card", () => {
    expect(agentCard.onboarding.free_tier.available).toBe(true);
    expect(agentCard.onboarding.free_tier.price).toBe("0");
    expect(agentCard.onboarding.signup.self_serve).toBe(true);
    expect(agentCard.onboarding.signup.sales_contact_required).toBe(false);
    expect(agentCard.onboarding.api_keys.self_serve).toBe(true);
  });

  it("names a real test environment with addresses that can be sent to", () => {
    expect(agentCard.onboarding.sandbox.available).toBe(true);
    expect(agentCard.onboarding.sandbox.test_addresses).toContain(
      "bounce@simulator.amazonses.com"
    );
  });

  it("lists endpoints that need no credentials at all", () => {
    expect(agentCard.onboarding.zero_auth_endpoints).toContain(
      "https://wraps.dev/mcp"
    );
    expect(agentCard.onboarding.zero_auth_endpoints).toContain(
      "https://wraps.dev/api/pricing/estimate"
    );
    expect(agentCard.mcp.remote.authentication).toBe("none");
  });

  it("repeats all of it in llms.txt, which is what most agents read first", () => {
    expect(llms).toContain("Getting Started Without a Human");
    expect(llms).toContain("https://app.wraps.dev/sign-up");
    expect(llms).toContain("Settings → API Keys");
    expect(llms).toContain("success@simulator.amazonses.com");
    expect(llms).toContain("https://wraps.dev/mcp");
  });

  it("keeps the markdown homepage in step with the HTML one", () => {
    const root = AGENT_CONTENT["/"];

    expect(root).toContain("Start Without an Account");
    expect(root).toContain("https://wraps.dev/mcp");
    expect(root).toContain("Zero-Auth Endpoints");
  });
});

// ---------------------------------------------------------------------------
// Reaching the markdown the way agents actually try
// ---------------------------------------------------------------------------

const rewriteOf = async (url: string, headers: Record<string, string> = {}) => {
  const response = await middleware(new NextRequest(url, { headers }));
  return response.headers.get("x-middleware-rewrite");
};

describe("a .md URL serves markdown with no header at all", () => {
  it("maps /index.md to the homepage markdown", async () => {
    expect(await rewriteOf("https://wraps.dev/index.md")).toBe(
      "https://wraps.dev/api/md/root"
    );
  });

  it("maps a docs page's .md URL to its markdown", async () => {
    expect(await rewriteOf("https://wraps.dev/docs/sdk-reference.md")).toBe(
      "https://wraps.dev/api/md/docs/sdk-reference"
    );
  });

  it("leaves /pricing.md alone — it is a covered path in its own right", async () => {
    expect(await rewriteOf("https://wraps.dev/pricing.md")).toBe(
      "https://wraps.dev/api/md/pricing.md"
    );
  });

  it("answers a .md URL with no markdown source in markdown, not HTML", async () => {
    // A markdown 404 that names the sitemap beats an HTML page an agent then
    // has to parse.
    expect(await rewriteOf("https://wraps.dev/docs/guides/migration.md")).toBe(
      "https://wraps.dev/api/md/docs/guides/migration"
    );
  });

  it("still records attribution on that early return", async () => {
    const response = await middleware(
      new NextRequest("https://wraps.dev/index.md?utm_source=reddit")
    );

    expect(response.headers.get("set-cookie")).toContain("wraps_attribution");
  });

  it("does not touch a page URL that merely contains .md", async () => {
    expect(await rewriteOf("https://wraps.dev/docs/sdk-reference")).toBeNull();
  });
});

describe("the advertised markdown alternate is not a dead end", () => {
  it("points at the .md URL, which serves markdown to anyone", async () => {
    const response = await middleware(
      new NextRequest("https://wraps.dev/docs/sdk-reference")
    );

    expect(response.headers.get("link")).toBe(
      '</docs/sdk-reference.md>; rel="alternate"; type="text/markdown"'
    );
  });

  it("advertises /index.md for the homepage, never /.md", async () => {
    const response = await middleware(new NextRequest("https://wraps.dev/"));

    expect(response.headers.get("link")).toBe(
      '</index.md>; rel="alternate"; type="text/markdown"'
    );
  });

  it("advertises a .md URL that serves the same markdown, for every covered page", () => {
    // Not a path round-trip: /pricing and /pricing.md are both covered keys,
    // so /pricing's alternate resolves to /pricing.md rather than back to
    // /pricing. What has to hold is that an agent following the link gets the
    // page's markdown.
    for (const path of AGENT_CONTENT_PATHS) {
      const mdUrl = markdownUrlFor(path);
      expect(mdUrl, path).toBeDefined();

      const resolved = pageForMarkdownUrl(mdUrl as string);
      expect(resolved, path).toBeDefined();
      expect(AGENT_CONTENT[resolved as string], path).toBe(AGENT_CONTENT[path]);
    }
  });
});

describe("AI crawlers get the markdown without asking for it", () => {
  it.each([
    "Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)",
    "Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
    "Mozilla/5.0 (compatible; PerplexityBot/1.0)",
    "ora-agent/1.0",
  ])("serves markdown to %s", async (userAgent) => {
    expect(
      await rewriteOf("https://wraps.dev/docs/sdk-reference", {
        "user-agent": userAgent,
      })
    ).toBe("https://wraps.dev/api/md/docs/sdk-reference");
  });

  it("leaves search crawlers on the HTML people see", async () => {
    for (const userAgent of [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; bingbot/2.0)",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    ]) {
      expect(
        await rewriteOf("https://wraps.dev/docs/sdk-reference", {
          "user-agent": userAgent,
        }),
        userAgent
      ).toBeNull();
    }
  });

  it("does not redirect a crawler away from /pricing the way a browser is", async () => {
    expect(
      await rewriteOf("https://wraps.dev/pricing", {
        "user-agent": "GPTBot/1.2",
      })
    ).toBe("https://wraps.dev/api/md/pricing");
  });

  it("matches the bot name case-insensitively, wherever it sits in the string", () => {
    expect(prefersMarkdown("Mozilla/5.0 (compatible; gptbot/1.2)")).toBe(true);
    expect(prefersMarkdown("CLAUDEBOT")).toBe(true);
    expect(prefersMarkdown("")).toBe(false);
    expect(prefersMarkdown("Mozilla/5.0 Chrome/120")).toBe(false);
  });

  it("varies the markdown response on User-Agent so a CDN cannot cross the wires", async () => {
    const { GET } = await import("@/app/api/md/[...path]/route");
    const response = await GET(
      new NextRequest("https://wraps.dev/api/md/docs/sdk-reference"),
      { params: Promise.resolve({ path: ["docs", "sdk-reference"] }) }
    );

    expect(response.headers.get("vary")).toBe("Accept, User-Agent");
  });
});

describe("the A2A agent card is served at the path the spec names", () => {
  it("rewrites /.well-known/agent-card.json onto the existing card", async () => {
    const config = (await import("../../next.config")).default as {
      rewrites: () => Promise<Array<{ source: string; destination: string }>>;
    };
    const rewrites = await config.rewrites();

    expect(
      rewrites.find((r) => r.source === "/.well-known/agent-card.json")
        ?.destination
    ).toBe("/.well-known/agent.json");
  });

  it("keeps that card parseable and carrying the A2A fields", () => {
    const card = JSON.parse(read("public/.well-known/agent.json")) as {
      name: string;
      url: string;
      capabilities: unknown;
      skills: unknown[];
      defaultInputModes: unknown;
      securitySchemes: unknown;
    };

    expect(card.name).toBe("Wraps");
    expect(card.url).toBe("https://wraps.dev");
    expect(card.capabilities).toBeDefined();
    expect(card.skills.length).toBeGreaterThan(0);
    expect(card.defaultInputModes).toBeDefined();
    expect(card.securitySchemes).toBeDefined();
  });
});
