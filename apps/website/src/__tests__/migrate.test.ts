import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SEARCH_INTENT } from "@/config/search-intent";

const webRoot = resolve(__dirname, "..", "..");
const migrateDir = resolve(webRoot, "src/app/migrate");

/** The four vendor guides this file guards. amazon-pinpoint predates them. */
const VENDOR_SLUGS = ["mailgun", "postmark", "resend", "sendgrid"] as const;
/** Every guide that should exist, vendor guides plus the AWS one. */
const ALL_SLUGS = ["amazon-pinpoint", ...VENDOR_SLUGS].sort();

const sourceOf = (slug: string) =>
  readFileSync(resolve(migrateDir, slug, "page.tsx"), "utf8");

const vendorSources = new Map(
  VENDOR_SLUGS.map((slug) => [slug, sourceOf(slug)] as const)
);

describe("the migrate cluster has no orphans in either direction", () => {
  it("has a page.tsx for every expected guide, and no unexpected ones", () => {
    const onDisk = readdirSync(migrateDir, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() &&
          existsSync(resolve(migrateDir, entry.name, "page.tsx"))
      )
      .map((entry) => entry.name)
      .sort();

    expect(onDisk).toEqual(ALL_SLUGS);
  });

  it("has a hub page indexing the guides", () => {
    expect(existsSync(resolve(migrateDir, "page.tsx"))).toBe(true);
  });

  it("declares a search intent for the hub and every guide", () => {
    const declared = SEARCH_INTENT.map((entry) => entry.route)
      .filter((route) => route.startsWith("/migrate"))
      .sort();

    expect(declared).toEqual(
      ["/migrate", ...ALL_SLUGS.map((slug) => `/migrate/${slug}`)].sort()
    );
  });
});

describe("the vendor guides do not read as near-duplicates of each other", () => {
  // Four pages sharing one "how to move to SES" spine is the failure mode this
  // whole file exists to hold back. Measured the way the alternatives suite
  // measures its own pages: overlapping 8-word shingles of the prose, not the
  // scaffolding. See src/__tests__/alternatives.test.ts.
  const SHINGLE = 8;

  /**
   * Strip imports, class names, and JSX tags so what is left is roughly the
   * words a crawler reads. Keeping the markup in would measure the shared
   * component scaffolding rather than the shared argument.
   */
  function prose(source: string): string {
    return source
      .replace(/^import[\s\S]*?;$/gm, " ")
      .replace(/className=(?:"[^"]*"|\{[^}]*\})/g, " ")
      .replace(/<\/?[A-Za-z][^>]*>/g, " ");
  }

  function shingles(text: string): Set<string> {
    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter(Boolean);
    const out = new Set<string>();
    for (let i = 0; i + SHINGLE <= words.length; i++) {
      out.add(words.slice(i, i + SHINGLE).join(" "));
    }
    return out;
  }

  // Do not lower these. If four pages cannot stay under them, the cluster is
  // the wrong shape and should be fewer pages, not a weaker threshold.
  //
  // Measured 2026-09-08: per-page shared runs 0.070 to 0.094, every pair sits
  // at 0.032 to 0.039, and the mean is 0.036. All three ceilings carry room
  // for ordinary copy edits without leaving room for a duplicated page.
  //
  // The floor is not zero and should not be: the four guides share the SES
  // facts that are true whichever provider you leave — sandbox, DKIM, bounce
  // and complaint rates — and those have to read the same way to be correct.
  const MAX_SHARED_PER_PAGE = 0.35;
  const MAX_PAIRWISE = 0.25;
  const MAX_MEAN_PAIRWISE = 0.25;

  const rendered = new Map(
    [...vendorSources].map(([slug, source]) => [slug, shingles(prose(source))])
  );

  const pairwiseScores = (): number[] => {
    const slugs = [...rendered.keys()];
    const scores: number[] = [];
    for (let i = 0; i < slugs.length; i++) {
      for (let j = i + 1; j < slugs.length; j++) {
        const a = rendered.get(slugs[i]) as Set<string>;
        const b = rendered.get(slugs[j]) as Set<string>;
        const intersection = [...a].filter((s) => b.has(s)).length;
        scores.push(intersection / (a.size + b.size - intersection));
      }
    }
    return scores;
  };

  // The assertion that actually bites. A mean over six pairs cannot fail on
  // one duplicated page: the duplicate pair contributes 1.0, the other five
  // stay near zero, and the mean lands around 0.196 — under any ceiling worth
  // having. This one measures each page against the union of its siblings, so
  // a duplicate scores about 1.0 on its own and fails alone.
  it.each([...VENDOR_SLUGS])("%s: most of its text is unique to it", (slug) => {
    const mine = rendered.get(slug) as Set<string>;
    const others = new Set(
      [...rendered.entries()]
        .filter(([other]) => other !== slug)
        .flatMap(([, set]) => [...set])
    );
    const shared = [...mine].filter((s) => others.has(s)).length;
    expect(shared / mine.size).toBeLessThan(MAX_SHARED_PER_PAGE);
  });

  it("has no single pair of pages that converged", () => {
    expect(Math.max(...pairwiseScores())).toBeLessThan(MAX_PAIRWISE);
  });

  it("keeps mean pairwise similarity below the near-duplicate range", () => {
    const scores = pairwiseScores();
    const mean = scores.reduce((sum, n) => sum + n, 0) / scores.length;
    expect(mean).toBeLessThan(MAX_MEAN_PAIRWISE);
  });
});

describe("the vendor guides keep prices out of the prose", () => {
  it.each([...VENDOR_SLUGS])(
    "%s: quotes no dollar figure inline — prices come from config",
    (slug) => {
      // A price typed into a page goes stale silently. alternatives.ts and
      // pricing.ts carry a verification stamp; a literal in JSX carries
      // nothing. Import the vendor record instead.
      const matches = (vendorSources.get(slug) as string).match(/\$\d/g) ?? [];
      expect(matches).toEqual([]);
    }
  );

  it.each([...VENDOR_SLUGS])("%s: sources a price from config", (slug) => {
    expect(vendorSources.get(slug)).toMatch(
      /@\/config\/(alternatives|pricing)/
    );
  });
});

describe("the vendor guides name no retired Wraps plan", () => {
  it.each([...VENDOR_SLUGS])(
    "%s: does not mention starter, growth, or scale",
    (slug) => {
      // Free, Pro and Business are the purchasable plans. The old names are
      // legacy-only and naming one sends a reader looking for a plan that
      // cannot be bought.
      expect(vendorSources.get(slug)).not.toMatch(
        /\b(starter|growth|scale)\b/i
      );
    }
  );
});

describe("the vendor guides state what the reader gives up", () => {
  it.each([...VENDOR_SLUGS])("%s: has a what-you-lose section", (slug) => {
    // A migration guide with no downsides is an ad. The alternatives pages
    // already hold themselves to this; so does this cluster.
    expect(vendorSources.get(slug)).toMatch(/what you (lose|give up)/i);
  });
});
