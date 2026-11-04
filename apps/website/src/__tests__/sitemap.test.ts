import { execFileSync } from "node:child_process";
import { globSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PAGE_DATES } from "@/config/page-dates";
import {
  ownerRouteFor,
  routeDirsByDepth,
  staticPageRoutes,
} from "@/lib/page-dates";

const webRoot = resolve(__dirname, "..", "..");
const repoRoot = resolve(webRoot, "..", "..");
const appDir = resolve(webRoot, "src/app");

function pageRoutes(): string[] {
  return staticPageRoutes(globSync("**/page.tsx", { cwd: appDir }));
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

/** A `git log --format=%x00%H…` header line, as opposed to a file path or diff line. */
const COMMIT_MARK = "\u0000";

/** A manifest key line: `  "/route": "date",` or the wrapped `  "/route":`. */
const MANIFEST_KEY_LINE = /^[ +-]\s*"([^"]+)":/;

/** The value line of a wrapped manifest entry: `    "2026-…",`. */
const MANIFEST_VALUE_LINE = /^\+\s+"[^"]*",?$/;

const manifestPath = relative(
  repoRoot,
  resolve(webRoot, "src/config/page-dates.ts")
);

function gitLog(args: string[]): string {
  return execFileSync("git", ["log", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

/**
 * For every commit that touched the manifest, the routes whose entry it
 * added or rewrote. One `git log -p` pass. The generator wraps long entries
 * onto two lines, so a changed value can sit under an unchanged key line:
 * -U1 keeps that key in view, and the last key seen owns a `+` value line.
 */
function routesRegeneratedByCommit(): Map<string, Set<string>> {
  const log = gitLog(["--format=%x00%H", "-p", "-U1", "--", manifestPath]);
  const byCommit = new Map<string, Set<string>>();
  let changed = new Set<string>();
  let key: string | undefined;
  for (const line of log.split("\n")) {
    if (line.startsWith(COMMIT_MARK)) {
      changed = new Set<string>();
      byCommit.set(line.slice(COMMIT_MARK.length), changed);
      key = undefined;
    } else if (line.startsWith("@@")) {
      key = undefined;
    } else {
      const match = MANIFEST_KEY_LINE.exec(line);
      if (match?.[1] !== undefined) {
        key = match[1];
        if (line.startsWith("+")) {
          changed.add(key);
        }
      } else if (key !== undefined && MANIFEST_VALUE_LINE.test(line)) {
        changed.add(key);
      }
    }
  }
  return byCommit;
}

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
      // A route is in sync when the newest commit touching any of its files
      // also rewrote its own manifest entry. Comparing dates alone breaks on
      // squash merges: the PR regenerates the manifest with branch commit
      // times, then GitHub stamps the squash commit with the (later) merge
      // time, so every route the PR touched looks stale on main. A page edit
      // that skipped `pnpm sitemap:dates` still fails: its commit leaves the
      // route's entry alone. No time window, because PRs can sit open for days.
      const log = gitLog([
        "--format=%x00%H%x00%cI",
        "--name-only",
        "--",
        relative(repoRoot, appDir),
      ]);
      const regenerated = routesRegeneratedByCommit();

      const routeDirs = routeDirsByDepth(
        globSync("**/page.tsx", { cwd: appDir })
      );

      const seen = new Set<string>();
      const behind: string[] = [];
      let commit = "";
      let commitDate = "";
      for (const line of log.split("\n")) {
        if (line === "") {
          continue;
        }
        if (line.startsWith(COMMIT_MARK)) {
          [commit = "", commitDate = ""] = line
            .slice(COMMIT_MARK.length)
            .split(COMMIT_MARK);
          continue;
        }
        const appRelative = relative(appDir, resolve(repoRoot, line));
        const route = ownerRouteFor(appRelative, routeDirs);
        if (route === undefined || seen.has(route)) {
          continue; // newest commit first, so a route's first sighting is its current one
        }
        seen.add(route);
        const recorded = PAGE_DATES[route];
        if (
          recorded !== undefined &&
          !regenerated.get(commit)?.has(route) &&
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

describe("sitemap covers changelog entries without leaking the template", () => {
  it("emits no literal dynamic segment", async () => {
    const { default: sitemap } = await import("@/app/sitemap");
    const urls = sitemap().map((entry) => entry.url);
    expect(urls.filter((url) => url.includes("["))).toEqual([]);
  });

  it("emits one URL per changelog entry, dated from the entry itself", async () => {
    const { default: sitemap } = await import("@/app/sitemap");
    const { releases } = await import("@/app/changelog/releases");
    const byUrl = new Map(sitemap().map((entry) => [entry.url, entry]));
    const missing = releases.filter(
      (release) => !byUrl.has(`https://wraps.dev/changelog/${release.slug}`)
    );
    expect(missing.map((release) => release.slug)).toEqual([]);

    const wrongDate = releases.filter((release) => {
      const entry = byUrl.get(`https://wraps.dev/changelog/${release.slug}`);
      const recorded = entry?.lastModified;
      return (
        recorded === undefined ||
        new Date(recorded).toISOString().slice(0, 10) !== release.date
      );
    });
    expect(wrongDate.map((release) => release.slug)).toEqual([]);
  });

  it("still lists the changelog index itself", async () => {
    const { default: sitemap } = await import("@/app/sitemap");
    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toContain("https://wraps.dev/changelog");
  });
});
