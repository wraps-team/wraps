import { globSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALTERNATIVES_PAGES,
  type RankedEntry,
  VENDORS,
} from "@/config/alternatives";
import { AGENT_CONTENT_PATHS } from "@/lib/agent-content-paths";
import { renderAlternativesMarkdown } from "@/lib/alternatives-markdown";

const WRAPS_ENTRY = (entry: RankedEntry) => entry.vendor === "wraps";

describe("every alternatives page keeps the format's honesty rules", () => {
  it.each(ALTERNATIVES_PAGES.map((page) => [page.slug, page] as const))(
    "%s: ranks 10 to 15 options with no vendor listed twice",
    (_slug, page) => {
      expect(page.ranked.length).toBeGreaterThanOrEqual(10);
      expect(page.ranked.length).toBeLessThanOrEqual(15);

      const ids = page.ranked.map((entry) => entry.vendor);
      expect(new Set(ids).size).toBe(ids.length);
    }
  );

  it.each(ALTERNATIVES_PAGES.map((page) => [page.slug, page] as const))(
    "%s: keeps shared blocks terse so they cannot dominate the page",
    (_slug, page) => {
      // The duplicate-content guard, stated as a rule rather than a ratio.
      // bestFor and watchOut are rendered verbatim on every page a vendor
      // appears on; the verdict is unique to this one. If the shared prose
      // grows past a sentence or two, the pages converge again.
      for (const entry of page.ranked) {
        const vendor = VENDORS[entry.vendor];
        if (vendor.isUs) {
          continue; // ours is deliberately the longest — see the config comment
        }
        expect(vendor.bestFor.length).toBeLessThanOrEqual(120);
        expect(vendor.watchOut.length).toBeLessThanOrEqual(220);
      }
    }
  );

  it.each(ALTERNATIVES_PAGES.map((page) => [page.slug, page] as const))(
    "%s: keeps the incumbent on the list, in last place",
    (_slug, page) => {
      const incumbents = page.ranked.filter((entry) => entry.isIncumbent);
      expect(incumbents).toHaveLength(1);
      expect(page.ranked.at(-1)?.isIncumbent).toBe(true);
    }
  );

  it.each(ALTERNATIVES_PAGES.map((page) => [page.slug, page] as const))(
    "%s: lists Wraps, and not in first place — the whole premise of the format",
    (_slug, page) => {
      const wrapsIndex = page.ranked.findIndex(WRAPS_ENTRY);
      expect(wrapsIndex).toBeGreaterThan(0);
    }
  );

  it.each(ALTERNATIVES_PAGES.map((page) => [page.slug, page] as const))(
    "%s: gives a reason to leave, a router, and a reason to stay",
    (_slug, page) => {
      expect(page.whyPeopleLeave.length).toBeGreaterThanOrEqual(3);
      expect(page.router.length).toBeGreaterThanOrEqual(4);
      expect(page.stayIf.length).toBeGreaterThanOrEqual(3);
    }
  );
});

describe("every vendor states a catch, including ours", () => {
  it.each(Object.values(VENDORS).map((vendor) => [vendor.id, vendor] as const))(
    "%s: has pricing, a best-for, and a non-trivial watch-out",
    (_id, vendor) => {
      expect(vendor.pricing.length).toBeGreaterThan(20);
      expect(vendor.bestFor.length).toBeGreaterThan(20);
      expect(vendor.watchOut.length).toBeGreaterThan(40);
    }
  );

  it("names the specific limits on our own entry rather than a soft caveat", () => {
    const wraps = VENDORS.wraps;
    expect(wraps.isUs).toBe(true);
    // These are the four things a reader would otherwise find out later. If a
    // copy edit drops one, this page stops being the honest kind.
    expect(wraps.watchOut).toMatch(/AWS account/i);
    expect(wraps.watchOut).toMatch(/production access/i);
    expect(wraps.watchOut).toMatch(/SOC 2/i);
    expect(wraps.watchOut).toMatch(/our database|Wraps' database|not yours/i);
  });
});

describe("the markdown twin says the same thing as the page", () => {
  it.each(ALTERNATIVES_PAGES.map((page) => [page.slug, page] as const))(
    "%s: carries every ranked vendor, the disclosure, and our own watch-out",
    (_slug, page) => {
      const markdown = renderAlternativesMarkdown(page);

      for (const entry of page.ranked) {
        expect(markdown).toContain(VENDORS[entry.vendor].name);
        expect(markdown).toContain(entry.verdict);
      }
      expect(markdown).toContain("## Disclosure");
      expect(markdown).toContain(VENDORS.wraps.watchOut);
      expect(markdown).toContain("(this is our product)");
      expect(markdown).toContain("(the incumbent — staying put)");
    }
  );
});

describe("the edge path list stays in sync with the pages", () => {
  it("covers exactly the configured alternatives routes", () => {
    const fromPaths = AGENT_CONTENT_PATHS.filter((path) =>
      path.startsWith("/alternatives/")
    ).sort();
    const fromConfig = ALTERNATIVES_PAGES.map(
      (page) => `/alternatives/${page.slug}`
    ).sort();

    expect(fromPaths).toEqual(fromConfig);
  });
});

describe("the pages do not read as near-duplicates of each other", () => {
  // Five pages rendering one shared vendor roster is a real indexing risk, and
  // it is the failure this whole file exists to hold back. Measured the same
  // way a search engine would: overlapping 8-word shingles of the prose an
  // agent or crawler actually sees.
  const SHINGLE = 8;

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

  const rendered = new Map(
    ALTERNATIVES_PAGES.map((page) => [
      page.slug,
      shingles(renderAlternativesMarkdown(page)),
    ])
  );

  // Measured 2026-08-27 after the trim: 38-49% shared per page, 22.4% mean.
  // The thresholds sit above that with room for ordinary copy edits, and well
  // below where this started (54-68% shared, 38.7% mean) — so restoring
  // 15-vendor rosters or letting the shared blocks grow back fails here.
  //
  // The floor is not zero and should not be: what remains shared is mostly the
  // `pricing` blocks, which have to be word-for-word identical to be correct.
  const MAX_SHARED_PER_PAGE = 0.55;
  const MAX_MEAN_PAIRWISE = 0.28;

  it.each(ALTERNATIVES_PAGES.map((page) => page.slug))(
    "%s: most of its text is unique to it",
    (slug) => {
      const mine = rendered.get(slug) as Set<string>;
      const others = new Set(
        [...rendered.entries()]
          .filter(([other]) => other !== slug)
          .flatMap(([, set]) => [...set])
      );
      const shared = [...mine].filter((s) => others.has(s)).length;
      expect(shared / mine.size).toBeLessThan(MAX_SHARED_PER_PAGE);
    }
  );

  it("keeps mean pairwise similarity well below the near-duplicate range", () => {
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
    const mean = scores.reduce((sum, n) => sum + n, 0) / scores.length;
    expect(mean).toBeLessThan(MAX_MEAN_PAIRWISE);
  });
});

describe("the link back to /compare stays intact", () => {
  // /compare/* is no longer in the nav or footer, so these links plus the hub
  // are most of what keeps those pages reachable. A renamed compare page would
  // otherwise strand them silently.
  const appDir = resolve(__dirname, "..", "app");
  const routes = new Set(
    globSync("**/page.tsx", { cwd: appDir }).map(
      (file) => `/${file.replace(/\/page\.tsx$/, "")}`
    )
  );

  it.each(ALTERNATIVES_PAGES.map((page) => [page.slug, page] as const))(
    "%s: compareHref, when set, points at a page that exists",
    (_slug, page) => {
      if (page.compareHref) {
        expect(routes.has(page.compareHref)).toBe(true);
      }
    }
  );

  it("gives every compare target a distinct page", () => {
    // An incumbent with no head-to-head page omits the field rather than
    // pointing at someone else's — /alternatives/agentmail is the first.
    const hrefs = ALTERNATIVES_PAGES.map((page) => page.compareHref).filter(
      Boolean
    );
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
