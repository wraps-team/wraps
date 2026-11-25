import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { faqItems } from "@/app/landing/components/faq-items";
import { renderPricingMarkdown } from "@/lib/pricing-markdown";
import { estimateCost } from "@/lib/ses-cost";

const webRoot = resolve(__dirname, "..", "..");
const read = (relativePath: string) =>
  readFileSync(resolve(webRoot, relativePath), "utf8");

// The homepage's own sections: the files plan 072 wrote or rewrote.
const HOMEPAGE_FILES = [
  "src/app/page.tsx",
  "src/app/landing/components/hero-section.tsx",
  "src/app/landing/components/hero-dashboard-panel.tsx",
  "src/app/landing/components/home-stats-row.tsx",
  "src/app/landing/components/product-section.tsx",
  "src/app/landing/components/economics-section.tsx",
  "src/app/landing/components/amazon-cost-card.tsx",
  "src/app/landing/components/ownership-section.tsx",
  "src/app/landing/components/getting-started-section.tsx",
  "src/app/landing/components/setup-paths.tsx",
  "src/app/landing/components/team-section.tsx",
  "src/app/landing/components/developers-band.tsx",
  "src/app/landing/components/why-own-section.tsx",
  "src/app/landing/components/pricing-section.tsx",
  "src/app/landing/components/faq-items.tsx",
  "src/app/landing/components/cta-section.tsx",
  "src/lib/page-metadata.ts",
];

describe("homepage Amazon cost card", () => {
  const VOLUMES = [10_000, 100_000, 500_000, 1_000_000];
  const md = renderPricingMarkdown();

  it.each(VOLUMES)(
    "%i emails: the estimator totals match pricing.md's worked examples",
    (emails) => {
      for (const sesPlan of ["alacarte", "essentials"] as const) {
        const total = estimateCost({
          emailsPerMonth: emails,
          eventsPerMonth: 0,
          tier: "free",
          sesPlan,
        }).total;
        expect(md).toContain(`$${total.toFixed(2)}`);
      }
    }
  );

  it("pins the four published all-in figures", () => {
    const f = (emailsPerMonth: number, sesPlan: "alacarte" | "essentials") =>
      estimateCost({ emailsPerMonth, eventsPerMonth: 0, tier: "free", sesPlan })
        .total;
    expect(VOLUMES.map((v) => f(v, "alacarte"))).toEqual([
      1.18, 12.5, 65.1, 136.09,
    ]);
    expect(VOLUMES.map((v) => f(v, "essentials"))).toEqual([
      1.78, 18.5, 95.1, 196.09,
    ]);
  });
});

describe("homepage FAQ", () => {
  it("renders its structured data from faqItems, so there is one copy", () => {
    const source = read("src/app/page.tsx");
    expect(source).toContain("faqItems.map");
    expect(source).not.toContain(
      'acceptedAnswer: {\n        "@type": "Answer",\n        text: "'
    );
  });

  it("states lock-in only in the approved form", () => {
    for (const item of faqItems) {
      expect(item.answer).not.toMatch(/vendor lock-in/i);
      expect(item.answer).not.toMatch(/self-host/i);
      expect(item.answer).not.toMatch(/yours forever/i);
    }
  });
});

describe("homepage claim rules", () => {
  it.each(HOMEPAGE_FILES)("%s carries no banned claim", (file) => {
    const source = read(file);
    expect(source).not.toMatch(/most popular/i);
    expect(source).not.toMatch(/no code required/i);
    expect(source).not.toMatch(/own your data/i);
    expect(source).not.toMatch(/vendor lock-in/i);
    expect(source).not.toMatch(/at cost/i);
    expect(source).not.toMatch(/real-time analytics/i);
    // Reputation appears only in the dedicated-IP offer, or as SES's metric name.
    for (const line of source.split("\n")) {
      if (/reputation/i.test(line)) {
        expect(line).toMatch(/dedicated IP|full control|reputation metrics/i);
      }
    }
  });

  it.each(HOMEPAGE_FILES)("%s never calls sending free", (file) => {
    // Case-insensitive: "Free plan with unlimited sends" is the same claim as
    // "send free". A line that says who bills the sending is allowed to pair
    // the Free plan with unlimited sends.
    for (const line of read(file).split("\n")) {
      if (
        /^\s*(\/\/|\*)/.test(line) ||
        /(AWS|Amazon) bills|every plan/i.test(line)
      ) {
        continue;
      }
      expect(line).not.toMatch(
        /\b(?:send|sends|sending|newsletters?)\b[^.]{0,30}\bfree\b/i
      );
      expect(line).not.toMatch(
        /\bfree\b[^.]{0,40}\b(?:sends|sending|newsletters?)\b/i
      );
    }
  });

  it("says 'one command' only about the deploy step", () => {
    for (const file of [
      ...HOMEPAGE_FILES,
      "src/lib/agent-content.ts",
      "public/llms.txt",
      "public/llms-full.txt",
    ]) {
      // The llms files are long; only their opening summary is homepage copy.
      const all = read(file).split("\n");
      const lines = file.startsWith("public/") ? all.slice(0, 120) : all;
      lines.forEach((line, i) => {
        if (/one[- ]command|1 command/i.test(line)) {
          const near = lines.slice(Math.max(0, i - 2), i + 3).join(" ");
          expect(near).toMatch(/deploy|infrastructure|email init/i);
          expect(near).not.toMatch(
            /connect[^.]{0,40}one[- ]command|one[- ]command[^.]{0,40}connect/i
          );
        }
      });
    }
  });

  it("names SOC 2 only as 'We don't have SOC 2 yet'", () => {
    const hits = HOMEPAGE_FILES.flatMap((file) =>
      read(file)
        .split("\n")
        .filter((line) => /SOC 2/.test(line) && !/^\s*\/\//.test(line))
    );
    expect(hits.length).toBeGreaterThan(0);
    for (const line of hits) {
      expect(line).toMatch(/We don't have SOC 2 yet|need SOC 2 today/);
    }
  });

  it("every homepage dollar figure is a reference, not pasted prose", () => {
    // Allowed literal "$" digits: the $0 stat only. Everything else, the FAQ
    // rates included, must come from config or the estimator.
    const offenders: string[] = [];
    for (const file of HOMEPAGE_FILES) {
      read(file)
        .split("\n")
        .forEach((line, i) => {
          if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
          const hit = line.match(/\$[0-9][0-9,.]*/g);
          if (hit && !/\$\{|\$\$|toFixed/.test(line)) {
            offenders.push(`${file.split("/").pop()} ${hit.join(" ")}`);
          }
        });
    }
    expect(offenders).toEqual(["home-stats-row.tsx $0"]);
  });
});

describe("homepage leftovers", () => {
  it("no component still imports a deleted homepage section", () => {
    const dir = resolve(webRoot, "src/app/landing/components");
    for (const name of [
      "what-it-does-section",
      "hero-product-panel",
      "hero-flow",
      "hero-dot-field",
    ]) {
      expect(readdirSync(dir)).not.toContain(`${name}.tsx`);
    }
  });
});
