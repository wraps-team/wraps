import { describe, expect, it } from "vitest";
import { estimateCost } from "@/lib/ses-cost";
import { SPF_PROVIDERS } from "@/lib/spf-record";
import { webMcpTools } from "@/lib/webmcp-tools";

const tool = (name: string) => {
  const found = webMcpTools().find((t) => t.name === name);
  if (!found) {
    throw new Error(`missing tool ${name}`);
  }
  return found;
};

const schemaProps = (name: string) =>
  tool(name).inputSchema.properties as Record<string, Record<string, unknown>>;

describe("WebMCP tools", () => {
  it("registers exactly five tools", () => {
    expect(
      webMcpTools()
        .map((t) => t.name)
        .sort()
    ).toEqual([
      "build_spf_record",
      "estimate_cost",
      "get_pricing",
      "get_quickstart",
      "search_docs",
    ]);
  });

  it("gives every tool a real description and an object schema", () => {
    for (const t of webMcpTools()) {
      expect(t.description.length).toBeGreaterThan(40);
      expect(t.inputSchema.type).toBe("object");
    }
  });

  it("estimates cost for 50,000 emails on pro", async () => {
    const result = await tool("estimate_cost").execute({
      emails: 50_000,
      tier: "pro",
    });
    expect(result.isError).toBeFalsy();
    const structured = result.structuredContent as {
      total: number;
      shareUrl: string;
    };
    expect(Number.isFinite(structured.total)).toBe(true);
    expect(structured.shareUrl).toMatch(
      /^https:\/\/wraps\.dev\/tools\/ses-calculator/
    );
  });

  it("wires estimate_cost to the real cost engine", async () => {
    const result = await tool("estimate_cost").execute({
      emails: 50_000,
      tier: "pro",
    });
    const direct = estimateCost({ emailsPerMonth: 50_000, tier: "pro" });
    expect((result.structuredContent as { total: number }).total).toBe(
      direct.total
    );
  });

  it("returns an error naming emails when emails is missing", async () => {
    const result = await tool("estimate_cost").execute({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("emails");
  });

  it("pins the tier enum to the purchasable tiers", () => {
    expect(schemaProps("estimate_cost").tier.enum).toEqual([
      "free",
      "pro",
      "business",
    ]);
  });

  it("builds an SPF record for SES", async () => {
    const result = await tool("build_spf_record").execute({
      providers: ["ses"],
    });
    expect((result.structuredContent as { record: string }).record).toBe(
      "v=spf1 include:amazonses.com ~all"
    );
  });

  it("builds a bare record with no input", async () => {
    const result = await tool("build_spf_record").execute({});
    expect((result.structuredContent as { record: string }).record).toBe(
      "v=spf1 ~all"
    );
  });

  it("populates the providers enum from the provider table", () => {
    const items = schemaProps("build_spf_record").providers.items as {
      enum: string[];
    };
    expect(items.enum).toContain("ses");
    expect(items.enum).toHaveLength(Object.keys(SPF_PROVIDERS).length);
  });

  it("returns the spec result shape from the network-free tools", async () => {
    const results = await Promise.all([
      tool("estimate_cost").execute({ emails: 1000 }),
      tool("build_spf_record").execute({}),
    ]);
    for (const result of results) {
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text.length).toBeGreaterThan(0);
    }
  });
});
