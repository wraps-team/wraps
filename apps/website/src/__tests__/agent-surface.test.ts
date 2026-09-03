import { globSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { AGENT_CONTENT } from "@/lib/agent-content";
import { AGENT_CONTENT_PATHS } from "@/lib/agent-content-paths";
import { middleware } from "@/middleware";

// One covered path and one real-but-uncovered path, used across the
// middleware/route behavioral tests below.
const COVERED_PATH = "/docs/sdk-reference";
const UNCOVERED_PATH = "/docs/guides/migration";

const webRoot = resolve(__dirname, "..", "..");
const appDir = resolve(webRoot, "src/app");
const read = (relativePath: string) =>
  readFileSync(resolve(webRoot, relativePath), "utf8");

// Paths in AGENT_CONTENT_PATHS that are NOT backed by a src/app/<path>/page.tsx
// route. Both are deliberate, not drift:
//  - /pricing.md is served from the generated public/pricing.md static file.
//  - /pricing itself has no page route at all — it is the #pricing anchor
//    section (PricingSection) rendered on the homepage ("/"). A direct HTML
//    GET is redirected to /#pricing by next.config; markdown negotiation
//    still resolves first, in middleware.
const AGENT_CONTENT_PATHS_WITHOUT_PAGE_ROUTE = new Set([
  "/pricing.md",
  "/pricing",
]);

function pageRoutes(underDir: string): Set<string> {
  const pages = globSync("**/page.tsx", { cwd: appDir });
  const routes = pages
    .filter((file) => file.startsWith(underDir))
    .map((file) => {
      const route = file
        .replace(/\/page\.tsx$/, "")
        .replace(/page\.tsx$/, "")
        .replace(/\([^)]+\)\/?/g, "");
      return `/${route}`.replace(/\/$/, "") || "/";
    });
  return new Set(routes);
}

describe("agent-content-paths.ts stays in sync with agent-content.ts", () => {
  it("lists exactly the keys AGENT_CONTENT defines — the middleware/route gate can't drift from the content map", () => {
    expect([...AGENT_CONTENT_PATHS].sort()).toEqual(
      Object.keys(AGENT_CONTENT).sort()
    );
  });
});

describe("every AGENT_CONTENT_PATHS entry resolves to a real page (or a named exception)", () => {
  const allRoutes = pageRoutes("");

  it("has a src/app/<path>/page.tsx for every covered path except the documented exceptions", () => {
    const missing = AGENT_CONTENT_PATHS.filter(
      (path) =>
        !AGENT_CONTENT_PATHS_WITHOUT_PAGE_ROUTE.has(path) &&
        !allRoutes.has(path)
    );
    expect(missing).toEqual([]);
  });

  it("does not carry stale exceptions — every named exception is itself still missing a page route", () => {
    // If one of these ever grows a real page.tsx, the exclusion becomes a
    // silent hole instead of a documented one. Force it to be re-decided.
    for (const path of AGENT_CONTENT_PATHS_WITHOUT_PAGE_ROUTE) {
      if (path === "/pricing.md") {
        continue; // never a route — .md is not a page extension
      }
      expect(allRoutes.has(path)).toBe(false);
    }
  });
});

describe("llms.txt lists every docs/compare/alternatives page — no page an agent can't discover from the index", () => {
  // Named, commented exclusions for pages intentionally not given their own
  // llms.txt bullet (e.g. index/hub pages whose children are all listed).
  // Start empty: everything else must be reachable from llms.txt.
  const INTENTIONALLY_UNLISTED: readonly string[] = [];

  it("contains every /docs, /compare and /alternatives route from the page.tsx glob", () => {
    const llms = read("public/llms.txt");
    const indexedRoutes = [
      ...pageRoutes("docs"),
      ...pageRoutes("compare"),
      ...pageRoutes("alternatives"),
    ].filter((route) => !INTENTIONALLY_UNLISTED.includes(route));

    const missing = indexedRoutes.filter(
      (route) => !llms.includes(`https://wraps.dev${route}`)
    );
    expect(missing).toEqual([]);
  });

  it("no longer claims llms-full.txt is the entire docs or a crawl substitute", () => {
    const llms = read("public/llms.txt");
    expect(llms).not.toMatch(/entire Wraps/i);
    expect(llms).not.toMatch(/instead of crawling/i);
  });
});

describe("middleware negotiates markdown for every page, hand-authored or derived", () => {
  // Fixture sanity: if these drift out of AGENT_CONTENT, the tests below stop
  // proving anything. Fail loudly instead of silently passing on a no-op.
  it("fixtures: COVERED_PATH is hand-authored, UNCOVERED_PATH is a real page that isn't", () => {
    expect(AGENT_CONTENT_PATHS).toContain(COVERED_PATH);
    expect(AGENT_CONTENT_PATHS).not.toContain(UNCOVERED_PATH);
    expect(
      globSync("**/page.tsx", { cwd: appDir }).some(
        (file) => `/${file.replace(/\/page\.tsx$/, "")}` === UNCOVERED_PATH
      )
    ).toBe(true);
  });

  it("rewrites a path with no hand-authored entry too — /api/md derives markdown from that page's own render", async () => {
    const request = new NextRequest(`https://wraps.dev${UNCOVERED_PATH}`, {
      headers: { accept: "text/markdown" },
    });
    const response = await middleware(request);

    // This used to fall through to HTML. Coverage was ~20 of ~130 routes, so
    // an agent asking for markdown got it on one page in six.
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      `https://wraps.dev/api/md${UNCOVERED_PATH}`
    );
  });

  it("passes the derivation render itself through to HTML — a loop here would hang, not 404", async () => {
    const request = new NextRequest(`https://wraps.dev${UNCOVERED_PATH}`, {
      headers: { accept: "text/markdown", "x-wraps-md-derive": "1" },
    });
    const response = await middleware(request);

    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("DOES rewrite a covered path to the matching /api/md/<path> URL when markdown is requested", async () => {
    const request = new NextRequest(`https://wraps.dev${COVERED_PATH}`, {
      headers: { accept: "text/markdown" },
    });
    const response = await middleware(request);

    expect(response.headers.get("x-middleware-rewrite")).toBe(
      `https://wraps.dev/api/md${COVERED_PATH}`
    );
  });

  it("rewrites the root path to the /api/md/root sentinel, not /api/md/", async () => {
    const request = new NextRequest("https://wraps.dev/", {
      headers: { accept: "text/markdown" },
    });
    const response = await middleware(request);

    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://wraps.dev/api/md/root"
    );
  });

  it("advertises the markdown alternate via a Link header on a covered path's normal (HTML) response", async () => {
    const request = new NextRequest(`https://wraps.dev${COVERED_PATH}`);
    const response = await middleware(request);

    // Points at the `.md` URL, not back at this path: this header used to name
    // the page itself, which returns HTML to anyone who follows it without an
    // Accept header — a dead end for the agents it exists to help.
    expect(response.headers.get("link")).toBe(
      `<${COVERED_PATH}.md>; rel="alternate"; type="text/markdown"`
    );
  });

  it("advertises the markdown alternate for a page with no hand-authored entry as well", async () => {
    const request = new NextRequest(`https://wraps.dev${UNCOVERED_PATH}`);
    const response = await middleware(request);

    // The representation is real either way — derived rather than written.
    expect(response.headers.get("link")).toBe(
      `<${UNCOVERED_PATH}.md>; rel="alternate"; type="text/markdown"`
    );
  });

  it("still sets the attribution cookie on a markdown-rewrite response, not just the plain HTML branch", async () => {
    const request = new NextRequest(
      `https://wraps.dev${COVERED_PATH}?utm_source=reddit`,
      { headers: { accept: "text/markdown" } }
    );
    const response = await middleware(request);

    expect(response.headers.get("set-cookie")).toContain("wraps_attribution");
  });

  it("still sets the attribution cookie on the plain (non-markdown) branch", async () => {
    const request = new NextRequest(
      `https://wraps.dev${UNCOVERED_PATH}?utm_source=reddit`
    );
    const response = await middleware(request);

    expect(response.headers.get("set-cookie")).toContain("wraps_attribution");
  });
});

describe("GET /api/md/[...path] serves hand-authored markdown, then derived, then a 404", () => {
  it("returns 200 and the real markdown for a covered path", async () => {
    const { GET } = await import("@/app/api/md/[...path]/route");
    const response = await GET(
      new NextRequest(`https://wraps.dev/api/md${COVERED_PATH}`),
      { params: Promise.resolve({ path: COVERED_PATH.slice(1).split("/") }) }
    );

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toBe(AGENT_CONTENT[COVERED_PATH]);
  });

  it("derives markdown from the page render when there is no hand-authored entry", async () => {
    const html = `<html><head><title>Migration Guide | Wraps</title></head>
      <body><nav>Docs</nav><main><h1>Migration Guide</h1>
      <p>${"Move an existing SES setup onto Wraps without changing domains. ".repeat(6)}</p>
      </main><footer>&copy; Wraps</footer></body></html>`;

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(html, { status: 200 }));

    try {
      const { GET } = await import("@/app/api/md/[...path]/route");
      const response = await GET(
        new NextRequest(`https://wraps.dev/api/md${UNCOVERED_PATH}`),
        {
          params: Promise.resolve({
            path: UNCOVERED_PATH.slice(1).split("/"),
          }),
        }
      );

      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).toContain("# Migration Guide");
      expect(body).toContain(`Source: https://wraps.dev${UNCOVERED_PATH}`);
      // Chrome is dropped, not converted alongside the content.
      expect(body).not.toContain("Docs");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("returns 404 (not the llms.txt index) when the page does not exist either", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("Not found", { status: 404 }));

    try {
      const { GET } = await import("@/app/api/md/[...path]/route");
      const response = await GET(
        new NextRequest("https://wraps.dev/api/md/docs/not-a-real-page"),
        {
          params: Promise.resolve({ path: ["docs", "not-a-real-page"] }),
        }
      );

      expect(response.status).toBe(404);
      const body = await response.text();
      // Distinctive to the llms.txt index — proves this is NOT a silent
      // fallback to the full index if the old behavior is ever reintroduced.
      expect(body).not.toContain("When to Use Wraps");
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe("agent.json publishes every skill under public/.well-known/skills/", () => {
  it("lists an id for every skill directory", () => {
    const agentJson = JSON.parse(read("public/.well-known/agent.json")) as {
      skills: Array<{ id: string }>;
    };
    const publishedIds = new Set(agentJson.skills.map((s) => s.id));

    const skillDirs = readdirSync(
      resolve(webRoot, "public/.well-known/skills"),
      { withFileTypes: true }
    )
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    const missing = skillDirs.filter((id) => !publishedIds.has(id));
    expect(missing).toEqual([]);
  });
});
