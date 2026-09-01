import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { AGENT_CONTENT } from "@/lib/agent-content";
import { renderPricingMarkdown } from "@/lib/pricing-markdown";
import { estimateCost, SES_PLANS } from "@/lib/ses-cost";

const webRoot = resolve(__dirname, "..", "..");
const read = (relativePath: string) =>
  readFileSync(resolve(webRoot, relativePath), "utf8");

const estimateUrl = (query: string) =>
  `https://wraps.dev/api/pricing/estimate${query}`;

describe("public/pricing.md", () => {
  it("matches the generator exactly — regenerate with `pnpm --filter wraps-website pricing:md`", () => {
    expect(read("public/pricing.md")).toBe(renderPricingMarkdown());
  });

  it("states both SES rates and which one AWS assigns by default", () => {
    const md = read("public/pricing.md");
    expect(md).toContain("$0.10");
    expect(md).toContain("$0.16");
    expect(md).toMatch(/defaults every new account to Essentials/i);
    expect(md).toContain("per account and per Region");
  });

  it("documents the estimator endpoint so agents call it instead of guessing", () => {
    const md = read("public/pricing.md");
    expect(md).toContain("https://wraps.dev/api/pricing/estimate");
    expect(md).toContain("Accept: text/markdown");
    expect(md).toContain("shareUrl");
  });

  it("carries worked examples for every headline volume", () => {
    const md = read("public/pricing.md");
    for (const volume of ["10,000", "100,000", "500,000", "1,000,000"]) {
      expect(md).toContain(`| ${volume} emails |`);
    }
  });

  it("no longer claims the dead SES free tier", () => {
    const md = read("public/pricing.md");
    expect(md).toMatch(/no longer exists for new accounts/i);
  });
});

describe("tracked-event definition (agent surfaces must state what actually meters)", () => {
  it("pricing.md does not claim SES delivery events are billable", () => {
    const md = read("public/pricing.md");
    expect(md).not.toMatch(/a send, delivery, open, click/);
  });

  it("pricing.md states sending is unmetered", () => {
    const md = read("public/pricing.md");
    expect(md).toContain("sending volume does not change the Wraps column");
  });

  it("the MCP estimate_cost schema does not describe events as including sends or opens", () => {
    const source = read("src/lib/mcp-server.ts");
    expect(source).not.toContain(
      "sends, opens, clicks, bounces, custom events"
    );
  });

  it("agent-content.ts states email sending is unmetered", () => {
    const source = read("src/lib/agent-content.ts");
    expect(source).toContain("Email sending is unmetered on every plan");
  });
});

describe("markdown content negotiation", () => {
  it("serves pricing on /pricing instead of falling back to llms.txt", () => {
    expect(AGENT_CONTENT["/pricing"]).toBe(renderPricingMarkdown());
    expect(AGENT_CONTENT["/pricing.md"]).toBe(renderPricingMarkdown());
  });

  it("points agents at pricing.md and the estimator from llms.txt", () => {
    const llms = read("public/llms.txt");
    expect(llms).toContain("https://wraps.dev/pricing.md");
    expect(llms).toContain("https://wraps.dev/api/pricing/estimate");
    expect(llms).toContain("$0.16 per 1,000 emails");
  });

  it("exposes estimate_cost as a WebMCP tool on the site", () => {
    const source = read("src/components/webmcp.tsx");
    expect(source).toContain('name: "estimate_cost"');
    expect(source).toContain("/api/pricing/estimate");
    expect(source).toContain("essentials");
  });

  it("advertises only the three purchasable tiers in the MCP estimate_cost enum", async () => {
    const { TOOLS } = await import("@/lib/mcp-server");
    const estimateCostTool = TOOLS.find((t) => t.name === "estimate_cost");
    const tierSchema = estimateCostTool?.inputSchema.properties.tier as {
      enum: readonly string[];
    };
    expect(tierSchema.enum).toEqual(["free", "pro", "business"]);
  });
});

describe("cost engine", () => {
  it("prices SES from the selected plan, not a hardcoded rate", () => {
    const base = {
      emailsPerMonth: 1_000_000,
      eventsPerMonth: 0,
      eventTracking: false,
      tier: "free" as const,
    };
    const alacarte = estimateCost({ ...base, sesPlan: "alacarte" });
    const essentials = estimateCost({ ...base, sesPlan: "essentials" });

    expect(alacarte.aws.total).toBe(100);
    expect(essentials.aws.total).toBe(160);
    expect(essentials.total - alacarte.total).toBeCloseTo(60, 2);
  });

  it("charges the SES Pro subscription fee on top of the per-email rate", () => {
    const pro = estimateCost({
      emailsPerMonth: 1_000_000,
      eventsPerMonth: 0,
      eventTracking: false,
      sesPlan: "pro",
    });
    expect(pro.aws.total).toBe(SES_PLANS.pro.monthlyFee + 220);
  });

  it("does not double-charge a dedicated IP that the SES plan includes", () => {
    const input = {
      emailsPerMonth: 100_000,
      eventsPerMonth: 0,
      eventTracking: false,
      dedicatedIp: true,
    } as const;
    const alacarte = estimateCost({ ...input, sesPlan: "alacarte" });
    const pro = estimateCost({ ...input, sesPlan: "pro" });

    expect(
      alacarte.aws.lines.find((line) => line.name === "Dedicated IP")?.cost
    ).toBe(24.95);
    expect(
      pro.aws.lines.find((line) => line.name === "Dedicated IP")?.cost
    ).toBe(0);
  });

  it("itemizes the full event pipeline at 1M emails", () => {
    const estimate = estimateCost({
      emailsPerMonth: 1_000_000,
      eventsPerMonth: 500_000,
      tier: "business",
      sesPlan: "alacarte",
    });
    const names = estimate.aws.lines.map((line) => line.name);
    expect(names).toEqual([
      "SES email sending",
      "EventBridge events",
      "SQS queue",
      "Lambda processing",
      "DynamoDB storage",
    ]);
    // 100 SES + 8 EventBridge + 11.50 SQS + 1.40 Lambda + 15.19 DynamoDB
    expect(estimate.aws.total).toBeCloseTo(136.09, 2);
    expect(estimate.wraps.total).toBe(199);
    expect(estimate.total).toBeCloseTo(335.09, 2);
  });

  it("charges the flat Wraps fee regardless of event volume", () => {
    const low = estimateCost({ tier: "pro", eventsPerMonth: 0 });
    const high = estimateCost({ tier: "pro", eventsPerMonth: 5_000_000 });
    expect(low.wraps.total).toBe(29);
    expect(high.wraps.total).toBe(29);
  });

  // Pins the truth behind the doc claim: the events parameter is accepted
  // for backward compatibility but does not currently drive any part of the
  // estimate — not the Wraps fee, and not the AWS-side event-pipeline lines
  // either (those come from emailsPerMonth × eventTypes). If this ever
  // fails, the parameter has become load-bearing and every "does not
  // currently affect the estimate" claim in mcp-server.ts and
  // pricing-markdown.ts needs to be rewritten, not this test.
  it("does not currently let the events parameter affect the AWS-side estimate either", () => {
    const low = estimateCost({ tier: "pro", eventsPerMonth: 0 });
    const high = estimateCost({ tier: "pro", eventsPerMonth: 5_000_000 });
    expect(high.aws.total).toBe(low.aws.total);
  });
});

describe("GET /api/pricing/estimate", () => {
  it("returns a JSON breakdown with a share link back to the calculator", async () => {
    const { GET } = await import("@/app/api/pricing/estimate/route");
    const response = GET(
      new NextRequest(
        estimateUrl("?emails=500000&events=250000&tier=pro&sesPlan=alacarte")
      )
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.currency).toBe("USD");
    expect(body.aws.sesPlan.id).toBe("alacarte");
    expect(body.wraps.tierName).toBe("Pro");
    expect(body.total).toBeCloseTo(
      estimateCost({
        emailsPerMonth: 500_000,
        eventsPerMonth: 250_000,
        tier: "pro",
        sesPlan: "alacarte",
      }).total,
      2
    );
    expect(body.shareUrl).toContain("/tools/ses-calculator?");
    expect(body.shareUrl).toContain("emails=500000");
    expect(body.shareUrl).toContain("sesPlan=alacarte");
  });

  it("resolves a legacy tier alias to its purchasable successor instead of 400ing", async () => {
    const { GET } = await import("@/app/api/pricing/estimate/route");
    const response = GET(new NextRequest(estimateUrl("?tier=starter")));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.wraps.tierName).toBe("Pro");
  });

  it("defaults to the a-la-carte SES rate rather than assuming a plan", async () => {
    const { GET } = await import("@/app/api/pricing/estimate/route");
    const body = await GET(new NextRequest(estimateUrl(""))).json();
    expect(body.aws.sesPlan.id).toBe("alacarte");
    expect(body.input.emailsPerMonth).toBe(25_000);
  });

  it("renders markdown when the client asks for it", async () => {
    const { GET } = await import("@/app/api/pricing/estimate/route");
    const response = GET(
      new NextRequest(estimateUrl("?emails=100000&events=50000&tier=starter"), {
        headers: { accept: "text/markdown" },
      })
    );

    expect(response.headers.get("content-type")).toContain("text/markdown");
    const text = await response.text();
    expect(text).toContain("# Cost estimate");
    expect(text).toContain("## AWS (billed directly to you by AWS)");
    expect(text).toContain("/tools/ses-calculator?");
  });

  it("quotes the a-la-carte alternative when the account is on Essentials", async () => {
    const { GET } = await import("@/app/api/pricing/estimate/route");
    const text = await GET(
      new NextRequest(estimateUrl("?emails=200000&sesPlan=essentials"), {
        headers: { accept: "text/markdown" },
      })
    ).text();
    expect(text).toContain("Essentials rate");
    expect(text).toMatch(/Moving to à la carte/);
  });

  it("rejects unknown enum values instead of silently guessing", async () => {
    const { GET } = await import("@/app/api/pricing/estimate/route");
    const response = GET(new NextRequest(estimateUrl("?tier=enterprise")));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("free, pro, business");
  });

  // Regression guard: resolveTierId used `id in LEGACY_TIER_ALIASES`, which
  // walks the prototype chain. `?tier=__proto__` resolved to Object.prototype
  // itself — truthy, so it passed the `!resolved` guard as a "valid" tier and
  // flowed into estimateCost, which is not an InvalidParamError and so
  // re-throws as an unhandled 500 on this public, agent-facing endpoint.
  it("rejects prototype-chain tier values instead of 500ing", async () => {
    const { GET } = await import("@/app/api/pricing/estimate/route");

    const proto = GET(new NextRequest(estimateUrl("?tier=__proto__")));
    expect(proto.status).toBe(400);
    expect(proto.status).not.toBe(200);

    const ctor = GET(new NextRequest(estimateUrl("?tier=constructor")));
    expect(ctor.status).toBe(400);
    expect(ctor.status).not.toBe(200);
  });

  it("rejects non-integer and out-of-range volumes", async () => {
    const { GET } = await import("@/app/api/pricing/estimate/route");
    expect(GET(new NextRequest(estimateUrl("?emails=lots"))).status).toBe(400);
    expect(GET(new NextRequest(estimateUrl("?emails=-5"))).status).toBe(400);
    expect(GET(new NextRequest(estimateUrl("?dedicatedIp=maybe"))).status).toBe(
      400
    );
  });

  it("is cacheable and callable cross-origin", async () => {
    const { GET } = await import("@/app/api/pricing/estimate/route");
    const response = GET(new NextRequest(estimateUrl("")));
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("cache-control")).toContain("max-age=3600");
  });
});

describe("tracked-events sweep guard", () => {
  const srcRoot = resolve(__dirname, "..");

  // Excluded — each for a stated reason, not because the guard is wrong.
  const excludedDirs = [
    resolve(srcRoot, "__tests__"), // the guard itself names the phrase
    resolve(srcRoot, "app/blog"), // dated posts, deliberately not rewritten
    resolve(srcRoot, "app/changelog"), // dated release notes, same
  ];

  // Hyphen included on purpose: mcp-server.ts and ses-cost.ts carried the
  // phrase as "tracked-event", and a narrower /tracked event/i guard would
  // have passed clean over both. See plans/209. \s+ (not a literal space)
  // because JSX text wraps across source lines -- two compare-page CTAs
  // read "5K tracked\n  events/month" in source and would have slipped
  // past a single-space-only pattern even though React renders them
  // adjacent on the page.
  const TRACKED_EVENTS_PATTERN = /tracked[-\s]+events?/i;

  function isExcluded(absPath: string): boolean {
    return excludedDirs.some(
      (dir) => absPath === dir || absPath.startsWith(`${dir}/`)
    );
  }

  function collectSourceFiles(dir: string, files: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (isExcluded(full)) {
        continue;
      }
      const stat = statSync(full);
      if (stat.isDirectory()) {
        collectSourceFiles(full, files);
      } else if (/\.(tsx|ts)$/.test(full)) {
        files.push(full);
      }
    }
    return files;
  }

  it("apps/website/src has no surviving 'tracked event(s)' / 'tracked-event(s)' mentions outside dated posts", () => {
    const offenders = collectSourceFiles(srcRoot).filter((file) =>
      TRACKED_EVENTS_PATTERN.test(readFileSync(file, "utf8"))
    );
    expect(offenders).toEqual([]);
  });
});
