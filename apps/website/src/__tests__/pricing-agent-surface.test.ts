import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { AGENT_CONTENT } from "@/lib/agent-content";
import { renderPricingMarkdown } from "@/lib/pricing-markdown";
import { estimateCost, recommendTier, SES_PLANS } from "@/lib/ses-cost";

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
      tier: "scale",
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

  it("flags volumes that a no-overage tier cannot absorb", () => {
    const estimate = estimateCost({ tier: "starter", eventsPerMonth: 80_000 });
    expect(estimate.wraps.requiresUpgrade).toBe(true);
    expect(estimate.wraps.overageEvents).toBe(30_000);
    expect(estimate.wraps.overageCost).toBe(0);
  });

  it("bills overage per 1,000 events on tiers that have a rate", () => {
    const estimate = estimateCost({ tier: "growth", eventsPerMonth: 300_000 });
    expect(estimate.wraps.requiresUpgrade).toBe(false);
    expect(estimate.wraps.overageCost).toBe(25); // 50,000 over × $0.50/1K
    expect(estimate.wraps.total).toBe(104);
  });

  it("recommends the cheapest tier that covers the volume", () => {
    expect(recommendTier(5000)).toBe("free");
    expect(recommendTier(5001)).toBe("starter");
    expect(recommendTier(250_000)).toBe("growth");
    expect(recommendTier(9_000_000)).toBe("scale");
  });
});

describe("GET /api/pricing/estimate", () => {
  it("returns a JSON breakdown with a share link back to the calculator", async () => {
    const { GET } = await import("@/app/api/pricing/estimate/route");
    const response = GET(
      new NextRequest(
        estimateUrl("?emails=500000&events=250000&tier=growth&sesPlan=alacarte")
      )
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.currency).toBe("USD");
    expect(body.aws.sesPlan.id).toBe("alacarte");
    expect(body.wraps.tierName).toBe("Growth");
    expect(body.total).toBeCloseTo(
      estimateCost({
        emailsPerMonth: 500_000,
        eventsPerMonth: 250_000,
        tier: "growth",
        sesPlan: "alacarte",
      }).total,
      2
    );
    expect(body.shareUrl).toContain("/tools/ses-calculator?");
    expect(body.shareUrl).toContain("emails=500000");
    expect(body.shareUrl).toContain("sesPlan=alacarte");
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

  it("warns in markdown when the chosen tier cannot absorb the volume", async () => {
    const { GET } = await import("@/app/api/pricing/estimate/route");
    const text = await GET(
      new NextRequest(estimateUrl("?events=80000&tier=starter"), {
        headers: { accept: "text/markdown" },
      })
    ).text();
    expect(text).toMatch(/cannot absorb this volume/i);
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
    expect(body.error).toContain("free, starter, growth, scale");
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
