#!/usr/bin/env node
// check-design-lint.mjs — Ceiling gate for `pnpm lint:design` (@shadcn/lint).
//
// Tallies findings per rule × surface (surface = first two path segments,
// e.g. apps/web) and fails if any cell exceeds its ceiling in CEILINGS
// below, or if a cell with findings has no ceiling at all. Ceilings may only
// go DOWN: when a sweep lands, paste the numbers this script prints.
//
// Usage:
//   node scripts/check-design-lint.mjs            — gate (exit 1 on regression)
//   node scripts/check-design-lint.mjs --measure  — print current counts as a
//                                                    CEILINGS literal to paste
//
// Why per-cell and not oxlint --max-warnings: one global number lets a
// regression in apps/web hide behind a sweep in apps/website. See
// plans/322-promote-design-lint-to-error-and-ci.md.
import { execFileSync } from "node:child_process";

// Measured on ffb33912 (2026-09-15). Lower a number whenever a sweep lands;
// never raise one to make a failing run pass.
export const CEILINGS = {
  "shadcn(no-arbitrary-values) apps/web": 34,
  "shadcn(no-arbitrary-values) apps/website": 45,
  "shadcn(no-arbitrary-values) packages/console": 1,
  "shadcn(no-arbitrary-values) packages/ui": 4,
  "shadcn(no-inline-styles) apps/web": 73,
  "shadcn(no-inline-styles) apps/website": 1,
  "shadcn(no-inline-styles) packages/console": 1,
  "shadcn(no-inline-styles) packages/ui": 2,
  "shadcn(no-raw-colors) apps/web": 460,
  "shadcn(no-raw-colors) apps/website": 49,
  "shadcn(no-raw-colors) packages/console": 23,
  "shadcn(no-restyle) apps/web": 0,
  "shadcn(no-restyle) apps/website": 35,
  "shadcn(no-restyle) packages/console": 0,
  "shadcn(no-restyle) packages/ui": 14,
  "shadcn(require-static-classes) apps/web": 0,
  "shadcn(require-static-classes) packages/console": 0,
};

export function tally(diagnostics) {
  const counts = {};
  for (const diagnostic of diagnostics) {
    if (!diagnostic.code?.startsWith("shadcn(")) continue;
    const surface = diagnostic.filename.split("/").slice(0, 2).join("/");
    const cell = `${diagnostic.code} ${surface}`;
    counts[cell] = (counts[cell] ?? 0) + 1;
  }
  return counts;
}

export function compare(counts, ceilings) {
  const over = [];
  const unknown = [];
  const below = [];

  for (const [cell, count] of Object.entries(counts)) {
    if (count === 0) continue;
    if (!(cell in ceilings)) {
      unknown.push({ cell, count });
    } else if (count > ceilings[cell]) {
      over.push({ cell, count, ceiling: ceilings[cell] });
    }
  }

  for (const [cell, ceiling] of Object.entries(ceilings)) {
    const count = counts[cell] ?? 0;
    if (count < ceiling) {
      below.push({ cell, count, ceiling });
    }
  }

  return { over, unknown, below };
}

function printTable(counts) {
  for (const cell of Object.keys(counts).sort()) {
    console.log(`${String(counts[cell]).padStart(5)}  ${cell}`);
  }
}

function run() {
  let stdout;
  try {
    stdout = execFileSync("pnpm", ["-s", "lint:design", "--format=json"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    if (error.stderr) console.error(error.stderr.toString());
    console.error("check-design-lint: could not run pnpm lint:design");
    process.exit(1);
    return;
  }

  const { diagnostics } = JSON.parse(stdout);
  const counts = tally(diagnostics);

  if (process.argv.includes("--measure")) {
    console.log("export const CEILINGS = {");
    for (const cell of Object.keys(counts).sort()) {
      console.log(`  "${cell}": ${counts[cell]},`);
    }
    console.log("};");
    return;
  }

  printTable(counts);

  const { over, unknown, below } = compare(counts, CEILINGS);

  if (over.length || unknown.length) {
    console.log(
      `check-design-lint: FAIL — ${over.length} cell(s) over ceiling, ${unknown.length} cell(s) with no ceiling`
    );
    for (const { cell, count, ceiling } of over) {
      console.log(`  ${cell}: ${count} / ${ceiling}`);
    }
    for (const { cell, count } of unknown) {
      console.log(`  ${cell}: ${count} / (no ceiling)`);
    }
    process.exit(1);
    return;
  }

  if (below.length) {
    console.log("check-design-lint: PASS — all cells within ceiling.");
    console.log(
      `check-design-lint: ${below.length} cell(s) are BELOW ceiling — lower them in scripts/check-design-lint.mjs to lock in the improvement:`
    );
    for (const { cell, count } of below) {
      console.log(`"${cell}": ${count},`);
    }
    return;
  }

  console.log("check-design-lint: PASS — every cell at ceiling.");
}

if (
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].split("/").pop())
) {
  run();
}
