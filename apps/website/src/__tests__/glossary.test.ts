import { globSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GLOSSARY,
  type GlossaryTerm,
  glossaryTermBySlug,
} from "@/lib/glossary";

const webRoot = resolve(__dirname, "..", "..");
const appDir = resolve(webRoot, "src/app");
const glossaryAppDir = resolve(appDir, "glossary");

/** Every real route on disk, `/foo/bar` form — same shape sitemap.test.ts uses. */
function pageRoutes(): Set<string> {
  return new Set(
    globSync("**/page.tsx", { cwd: appDir }).map(
      (file) => `/${file.replace(/\/page\.tsx$/, "")}`
    )
  );
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Total substantive word count for a term — every prose field, nothing structural. */
function totalWordCount(term: GlossaryTerm): number {
  const parts = [
    term.shortDefinition,
    ...term.body.flatMap((section) => [section.heading, section.content]),
    term.whyItMatters,
    term.howToCheck ?? "",
    ...term.faqs.flatMap((faq) => [faq.question, faq.answer]),
  ];
  return parts.reduce((sum, part) => sum + wordCount(part), 0);
}

describe("glossary slugs and terms are unique", () => {
  it("has no duplicate slug", () => {
    const slugs = GLOSSARY.map((term) => term.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("has no duplicate term name", () => {
    const names = GLOSSARY.map((term) => term.term);
    expect(new Set(names).size).toBe(names.length);
  });

  it("resolves every configured slug, and throws on one that isn't configured", () => {
    for (const term of GLOSSARY) {
      expect(glossaryTermBySlug(term.slug)).toBe(term);
    }
    expect(() => glossaryTermBySlug("not-a-real-term")).toThrow(
      /Unknown glossary slug/
    );
  });
});

const cases = GLOSSARY.map((term) => [term.slug, term] as const);

describe("every glossary term carries enough substance to be worth publishing", () => {
  it.each(cases)(
    "%s: shortDefinition is meta-description length (80-300 chars)",
    (_slug, term) => {
      expect(term.shortDefinition.length).toBeGreaterThanOrEqual(80);
      expect(term.shortDefinition.length).toBeLessThanOrEqual(300);
    }
  );

  it.each(cases)("%s: has at least 3 body sections", (_slug, term) => {
    expect(term.body.length).toBeGreaterThanOrEqual(3);
  });

  it.each(cases)("%s: has at least 3 FAQs", (_slug, term) => {
    expect(term.faqs.length).toBeGreaterThanOrEqual(3);
  });

  it.each(cases)(
    "%s: carries at least 500 words of real content",
    (_slug, term) => {
      expect(totalWordCount(term)).toBeGreaterThanOrEqual(500);
    }
  );
});

describe("glossary cross-references resolve", () => {
  const slugs = new Set(GLOSSARY.map((term) => term.slug));
  const routes = pageRoutes();

  it.each(cases)(
    "%s: every relatedSlugs entry is a real glossary slug",
    (_slug, term) => {
      const missing = term.relatedSlugs.filter(
        (related) => !slugs.has(related)
      );
      expect(missing).toEqual([]);
    }
  );

  it.each(cases)("%s: does not list itself as related", (slug, term) => {
    expect(term.relatedSlugs).not.toContain(slug);
  });

  it.each(cases)(
    "%s: every seeAlso.href resolves to a real page.tsx route on disk",
    (_slug, term) => {
      const missing = term.seeAlso
        .map((link) => link.href)
        .filter((href) => !routes.has(href));
      expect(missing).toEqual([]);
    }
  );
});

describe("the on-disk glossary routes match the configured slugs exactly", () => {
  const configuredSlugs = new Set(GLOSSARY.map((term) => term.slug));
  const onDiskSlugs = new Set(
    readdirSync(glossaryAppDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  );

  it("has no configured slug missing its route directory", () => {
    const missing = [...configuredSlugs].filter(
      (slug) => !onDiskSlugs.has(slug)
    );
    expect(missing).toEqual([]);
  });

  it("has no orphaned route directory for a slug no longer configured", () => {
    const orphaned = [...onDiskSlugs].filter(
      (slug) => !configuredSlugs.has(slug)
    );
    expect(orphaned).toEqual([]);
  });
});

describe("no term's shortDefinition is copy-pasted into another term's body", () => {
  // The cheap way these pages go wrong is reusing a sibling's definition
  // verbatim instead of writing this term's own — this is a substring check,
  // not a similarity score, because a shortDefinition is short and specific
  // enough that even a partial verbatim copy is a real signal.
  it.each(cases)(
    "%s: its shortDefinition is unique to its own page",
    (slug, term) => {
      const leaks = GLOSSARY.filter((other) => other.slug !== slug).filter(
        (other) =>
          other.body.some((section) =>
            section.content.includes(term.shortDefinition)
          )
      );
      expect(leaks.map((entry) => entry.slug)).toEqual([]);
    }
  );
});
