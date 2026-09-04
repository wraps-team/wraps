import { execFileSync } from "node:child_process";
import { globSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PAGE_DATES } from "@/config/page-dates";
import {
  ownerRouteFor,
  routeDirsByDepth,
  routeForPageFile,
} from "@/lib/page-dates";

/** A `git log --format=%cI` line, as opposed to a file path. */
const ISO_DATE_LINE = /^\d{4}-\d{2}-\d{2}T/;

const webRoot = resolve(__dirname, "..", "..");
const repoRoot = resolve(webRoot, "..", "..");
const appDir = resolve(webRoot, "src/app");

function pageRoutes(): string[] {
  return globSync("**/page.tsx", { cwd: appDir }).map(routeForPageFile).sort();
}

describe("sitemap lastmod manifest stays in sync with the pages", () => {
  const routes = pageRoutes();

  it("records a date for every page route — a missing one ships no <lastmod> at all", () => {
    const missing = routes.filter((route) => PAGE_DATES[route] === undefined);
    expect(missing).toEqual([]);
  });

  it("carries no entry for a route that no longer has a page", () => {
    const known = new Set(routes);
    const orphaned = Object.keys(PAGE_DATES).filter(
      (route) => !known.has(route)
    );
    expect(orphaned).toEqual([]);
  });

  it("holds parseable dates that are not in the future", () => {
    const tomorrow = Date.now() + 24 * 60 * 60 * 1000;
    const bad = Object.entries(PAGE_DATES).filter(([, date]) => {
      const parsed = Date.parse(date);
      return Number.isNaN(parsed) || parsed > tomorrow;
    });
    expect(bad).toEqual([]);
  });

  it("does not give every route the same date — the bug this manifest replaced", () => {
    // File mtime on Vercel is the git-checkout time, so the old sitemap gave all
    // 138 URLs one timestamp and told crawlers the whole site changed on every
    // deploy. Distinct dates are the whole point of the manifest.
    const distinctDays = new Set(
      Object.values(PAGE_DATES).map((date) => date.slice(0, 10))
    );
    expect(distinctDays.size).toBeGreaterThan(5);
  });
});

describe("sitemap lastmod manifest is not stale", () => {
  // Needs real history. Vercel and the default actions/checkout both clone
  // shallow, where `git log -- <path>` reports nothing for most files; this is
  // a local gate, which is also the only place `pnpm sitemap:dates` gets run.
  const hasFullHistory = (() => {
    try {
      const shallow = execFileSync(
        "git",
        ["rev-parse", "--is-shallow-repository"],
        {
          cwd: repoRoot,
          encoding: "utf8",
        }
      ).trim();
      return shallow === "false";
    } catch {
      return false;
    }
  })();

  it.skipIf(!hasFullHistory)(
    "has no route whose committed files moved on without a regenerate",
    () => {
      const log = execFileSync(
        "git",
        [
          "log",
          "--format=%cI",
          "--name-only",
          "--",
          relative(repoRoot, appDir),
        ],
        { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
      );

      const routeDirs = routeDirsByDepth(
        globSync("**/page.tsx", { cwd: appDir })
      );

      const seen = new Set<string>();
      const behind: string[] = [];
      let commitDate = "";
      for (const line of log.split("\n")) {
        if (line === "") {
          continue;
        }
        if (ISO_DATE_LINE.test(line)) {
          commitDate = line;
          continue;
        }
        if (seen.has(line)) {
          continue; // newest commit first, so the first sighting is the current one
        }
        seen.add(line);
        const appRelative = relative(appDir, resolve(repoRoot, line));
        const route = ownerRouteFor(appRelative, routeDirs);
        if (route === undefined) {
          continue;
        }
        const recorded = PAGE_DATES[route];
        if (
          recorded !== undefined &&
          Date.parse(commitDate) > Date.parse(recorded)
        ) {
          behind.push(
            `${route} (${appRelative} committed ${commitDate}, manifest ${recorded})`
          );
        }
      }

      // If this fails, run `pnpm sitemap:dates` and commit src/config/page-dates.ts.
      expect(behind).toEqual([]);
    }
  );
});
