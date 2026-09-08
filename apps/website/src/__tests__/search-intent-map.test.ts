import { globSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { NON_CONTENT_ROUTES, SEARCH_INTENT } from "@/config/search-intent";
import { routeForPageFile } from "@/lib/page-dates";

const appDir = resolve(__dirname, "..", "app");

function pageRoutes(): string[] {
  return globSync("**/page.tsx", { cwd: appDir }).map(routeForPageFile).sort();
}

/** Case-insensitive, whitespace-collapsed — matches how a search engine treats two queries as "the same". */
function normalize(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, " ");
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** The final path segment of a route, with dashes turned into spaces — what a restated slug looks like. */
function slugAsWords(route: string): string {
  const slug = route.split("/").filter(Boolean).at(-1) ?? "";
  return normalize(slug.replace(/-/g, " "));
}

describe("search-intent map covers the whole content surface", () => {
  const routes = pageRoutes();
  const declared = new Set(SEARCH_INTENT.map((entry) => entry.route));
  const nonContent = new Set(NON_CONTENT_ROUTES);

  it("has no route missing from both SEARCH_INTENT and NON_CONTENT_ROUTES", () => {
    const missing = routes.filter(
      (route) => !declared.has(route) && !nonContent.has(route)
    );
    expect(missing).toEqual([]);
  });

  it("has no entry for a route that no longer exists", () => {
    const known = new Set(routes);
    const orphanedIntent = SEARCH_INTENT.map((entry) => entry.route).filter(
      (route) => !known.has(route)
    );
    const orphanedNonContent = NON_CONTENT_ROUTES.filter(
      (route) => !known.has(route)
    );
    expect(orphanedIntent).toEqual([]);
    expect(orphanedNonContent).toEqual([]);
  });

  it("puts no route in both SEARCH_INTENT and NON_CONTENT_ROUTES", () => {
    const overlap = [...declared].filter((route) => nonContent.has(route));
    expect(overlap).toEqual([]);
  });
});

describe("search-intent map has no cannibalization", () => {
  it("gives every page a primaryQuery no other page also targets", () => {
    const counts = new Map<string, string[]>();
    for (const entry of SEARCH_INTENT) {
      const key = normalize(entry.primaryQuery);
      const routesForKey = counts.get(key) ?? [];
      routesForKey.push(entry.route);
      counts.set(key, routesForKey);
    }
    const collisions = [...counts.entries()].filter(
      ([, routes]) => routes.length > 1
    );
    expect(collisions).toEqual([]);
  });
});

describe("search-intent entries are non-trivial", () => {
  it("gives every primaryQuery at least 3 words", () => {
    const tooShort = SEARCH_INTENT.filter(
      (entry) => wordCount(entry.primaryQuery) < 3
    ).map((entry) => entry.route);
    expect(tooShort).toEqual([]);
  });

  it("gives every rationale at least 8 words", () => {
    const tooShort = SEARCH_INTENT.filter(
      (entry) => wordCount(entry.rationale) < 8
    ).map((entry) => entry.route);
    expect(tooShort).toEqual([]);
  });

  it("never lets a primaryQuery just restate the route's own slug", () => {
    const restated = SEARCH_INTENT.filter(
      (entry) => normalize(entry.primaryQuery) === slugAsWords(entry.route)
    ).map((entry) => entry.route);
    expect(restated).toEqual([]);
  });
});
