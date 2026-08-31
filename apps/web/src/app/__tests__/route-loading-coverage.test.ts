/**
 * Route-loading coverage map
 *
 * Plan 225 retired the root `loading.tsx` (it sat above every route group, so
 * whatever it rendered was wrong for most of them, and it turned every
 * `redirect()` below it into a 200 with the redirect embedded in the RSC
 * payload instead of a real 3xx). These tests pin the invariants that replace
 * it, reading the real filesystem tree rather than a hard-coded list so they
 * catch drift instead of just documenting today's snapshot:
 *
 * 1. No `loading.tsx` anywhere renders a full-screen loader.
 * 2. There is no root `src/app/loading.tsx`.
 * 3. Every `page.tsx` under `(dashboard)` still resolves to a
 *    `(dashboard)`-scoped loader (plan 203's guarantee — this plan must not
 *    weaken it).
 * 4. The redirect-gate segments — `(onboarding)`, `(subscription)`, and every
 *    ancestor of the root `page.tsx` — have no loader, because a Suspense
 *    boundary there is exactly what would re-break their 3xx redirects.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const APP = path.resolve(__dirname, "..");
const SRC = path.resolve(APP, "..");

function walk(dir: string, onFile: (filePath: string) => void): void {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === "__tests__") {
        continue;
      }
      walk(full, onFile);
    } else if (entry === "page.tsx" || entry === "loading.tsx") {
      onFile(full);
    }
  }
}

function findFiles(name: "page.tsx" | "loading.tsx"): string[] {
  const found: string[] = [];
  walk(APP, (filePath) => {
    if (path.basename(filePath) === name) {
      found.push(filePath);
    }
  });
  return found;
}

function hasLoaderAtOrAbove(pageDir: string, stopAt: string): boolean {
  let cur = pageDir;
  for (;;) {
    if (existsSync(path.join(cur, "loading.tsx"))) {
      return true;
    }
    if (cur === stopAt || !cur.startsWith(stopAt)) {
      return false;
    }
    const parent = path.dirname(cur);
    if (parent === cur) {
      return false;
    }
    cur = parent;
  }
}

describe("route loading coverage", () => {
  it("no loading.tsx anywhere renders a full-screen loader", () => {
    const loaders = findFiles("loading.tsx");
    expect(loaders.length).toBeGreaterThan(0);

    for (const loaderPath of loaders) {
      const source = readFileSync(loaderPath, "utf8");
      expect(source).not.toContain("fullScreen");
    }

    // Teeth: the search term is proven live — the Loader component itself
    // does define a `fullScreen` prop, so "no matches" above is a real
    // finding and not a broken search string.
    const loaderComponentSource = readFileSync(
      path.join(SRC, "components", "loader.tsx"),
      "utf8"
    );
    expect(loaderComponentSource).toContain("fullScreen");
  });

  it("there is no root src/app/loading.tsx", () => {
    expect(existsSync(path.join(APP, "loading.tsx"))).toBe(false);
  });

  it("every page.tsx under (dashboard) resolves to a (dashboard)-scoped loader", () => {
    const dashboardRoot = path.join(APP, "(dashboard)");
    const pages = findFiles("page.tsx").filter((p) =>
      p.startsWith(dashboardRoot + path.sep)
    );
    expect(pages.length).toBeGreaterThan(0);

    for (const pagePath of pages) {
      const pageDir = path.dirname(pagePath);
      expect(hasLoaderAtOrAbove(pageDir, dashboardRoot)).toBe(true);
    }

    // Teeth: a synthetic path outside (dashboard) — this test file's own
    // directory, which has no loading.tsx above it before reaching APP's
    // parent — must return false, proving the walk can fail.
    expect(hasLoaderAtOrAbove(__dirname, SRC)).toBe(false);
  });

  it("the redirect-gate segments have no loader", () => {
    expect(existsSync(path.join(APP, "(onboarding)", "loading.tsx"))).toBe(
      false
    );
    expect(existsSync(path.join(APP, "(subscription)", "loading.tsx"))).toBe(
      false
    );

    // Every ancestor of the root page.tsx, up to and including src/app
    // itself, must have no loading.tsx.
    let cur = path.dirname(path.join(APP, "page.tsx"));
    while (cur.startsWith(APP)) {
      expect(existsSync(path.join(cur, "loading.tsx"))).toBe(false);
      if (cur === APP) {
        break;
      }
      cur = path.dirname(cur);
    }
  });
});
