/**
 * Regression smoke test: every `wraps/templates/*.tsx` file in the repo
 * compiles through the CLI render pipeline and produces plain-text output
 * that SES Handlebars can parse.
 *
 * This guards against the `reengagement-activate-account` class of bug
 * where `{{#if firstName}}` inside a `<Heading>` gets uppercased to
 * `{{#IF FIRSTNAME}}` by html-to-text and SES rejects the template at
 * send time with "Attribute 'IF' is not present in the rendering data."
 *
 * The test only runs when the templates directory exists. CI environments
 * without the application templates checked out will skip silently.
 */

import { existsSync, readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { transformVariablesForSes } from "../template-compiler";
import { renderTemplateWithProxy } from "../template-render";

const TEMPLATES_DIR = resolve(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "..",
  "..",
  "wraps",
  "templates"
);

const UPPERCASE_HELPER_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "{{#IF}}", pattern: /\{\{#IF\b/ },
  { label: "{{/IF}}", pattern: /\{\{\/IF\}\}/ },
  { label: "{{ELSE}}", pattern: /\{\{ELSE\}\}/ },
  { label: "{{#UNLESS}}", pattern: /\{\{#UNLESS\b/ },
  { label: "{{/UNLESS}}", pattern: /\{\{\/UNLESS\}\}/ },
  { label: "{{#EACH}}", pattern: /\{\{#EACH\b/ },
  { label: "{{/EACH}}", pattern: /\{\{\/EACH\}\}/ },
  { label: "{{#WITH}}", pattern: /\{\{#WITH\b/ },
  { label: "{{/WITH}}", pattern: /\{\{\/WITH\}\}/ },
];

async function compileTemplateFromFile(filePath: string, slug: string) {
  const { build } = await import("esbuild");
  const result = await build({
    entryPoints: [filePath],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    target: "node24",
    jsx: "automatic",
    banner: {
      js: 'import { createRequire as __createRequire } from "node:module";\nconst require = __createRequire(import.meta.url);\n',
    },
  });

  const bundled = result.outputFiles[0].text;
  const tmpDir = join(
    TEMPLATES_DIR,
    "..",
    "..",
    "node_modules",
    ".wraps-compiled"
  );
  await mkdir(tmpDir, { recursive: true });
  const tmpPath = join(tmpDir, `${slug}.smoke.mjs`);
  await writeFile(tmpPath, bundled, "utf-8");

  const mod = await import(`${tmpPath}?t=${Date.now()}`);
  const Component = mod.default;
  if (typeof Component !== "function") {
    throw new Error(`Template ${slug} has no default export`);
  }

  return renderTemplateWithProxy(Component);
}

/**
 * Every test in the two loops below runs a real esbuild build of one template
 * plus a React Email render — genuine CPU work, ~270ms each here and up to ~1s
 * for the heaviest template. CPU-bound cost scales with how loaded the machine
 * is, and a CI runner has fewer cores than a laptop while running the whole
 * monorepo's suites at once, so the slowest template can approach the 5s
 * default from a comfortable-looking local number. The budget below is set from
 * what these tests actually do, matching how the package's subprocess tests
 * (one-event-per-invocation, telemetry-command-name) declare theirs.
 */
const RENDER_TIMEOUT_MS = 30_000;

describe("wraps/templates/*.tsx plain-text smoke test", () => {
  if (!existsSync(TEMPLATES_DIR)) {
    // Loud skip: a silent skip would mean a CI configuration regression
    // (templates dir disappeared from the workspace) goes unnoticed and
    // the smoke test stops covering anything. Surface it as a console.warn
    // so the missing dir is visible in CI logs and a human can decide
    // whether to fix the configuration or accept the gap.
    console.warn(
      `[template-render.smoke] templates directory not found at ${TEMPLATES_DIR} — ` +
        "skipping all production-template smoke checks. If you expected the " +
        "templates repo to be checked out alongside this monorepo, this is a " +
        "CI configuration issue that needs attention."
    );
    it.skip("templates directory not present — skipping", () => {
      // no-op
    });
    return;
  }

  const templateFiles = readdirSync(TEMPLATES_DIR).filter((f) =>
    f.endsWith(".tsx")
  );

  for (const file of templateFiles) {
    const slug = file.replace(/\.tsx$/, "");
    it(
      `${slug}: plain text contains no uppercase Handlebars tokens`,
      { timeout: RENDER_TIMEOUT_MS },
      async () => {
        const { text } = await compileTemplateFromFile(
          join(TEMPLATES_DIR, file),
          slug
        );

        for (const { label, pattern } of UPPERCASE_HELPER_PATTERNS) {
          expect(
            text,
            `${slug}: found ${label} in plain text (SES will reject this)`
          ).not.toMatch(pattern);
        }
      }
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Render contract: every part of every template must render to a clean
// string — no literal `{{`/`}}` survives — with BOTH an empty data dict
// (worst-case: contact has nothing, trigger event carried nothing) and the
// template's own testData. This is the CI tripwire for the bug class that
// delivered "The setup just got easier{{#if firstName}}, {{firstName}}{{/if}}."
// records and RenderingFailure non-deliveries in production (Apr–Jun 2026).
// ─────────────────────────────────────────────────────────────────────────────

describe("wraps/templates/*.tsx render contract", () => {
  if (!existsSync(TEMPLATES_DIR)) {
    it.skip("templates directory not present — skipping", () => {
      // warning already emitted by the smoke suite above
    });
    return;
  }

  const templateFiles = readdirSync(TEMPLATES_DIR).filter((f) =>
    f.endsWith(".tsx")
  );

  // The standard variable set every send path guarantees (workflow
  // replacementData / batch defaultTemplateData). Empty strings on purpose:
  // {{#if}} must treat them as falsy and bare {{var}} must render empty.
  const EMPTY_DATA = {};

  for (const file of templateFiles) {
    const slug = file.replace(/\.tsx$/, "");

    it(
      `${slug}: subject, preview, html, and text render clean with empty data and testData`,
      { timeout: RENDER_TIMEOUT_MS },
      async () => {
        const Handlebars = (await import("handlebars")).default;
        const modPath = join(TEMPLATES_DIR, file);
        const rendered = await compileTemplateFromFile(modPath, slug);

        // Re-import the compiled module for its metadata exports
        const tmpPath = join(
          TEMPLATES_DIR,
          "..",
          "..",
          "node_modules",
          ".wraps-compiled",
          `${slug}.smoke.mjs`
        );
        const mod = await import(`${tmpPath}?meta=${Date.now()}`);
        const testData = (mod.testData ?? {}) as Record<string, unknown>;

        const parts: Array<[string, string]> = [
          ["subject", String(mod.subject ?? "")],
          ["previewText", String(mod.previewText ?? "")],
          ["html", rendered.html],
          ["text", rendered.text],
        ];

        for (const [partName, content] of parts) {
          // Assert on what SES actually receives. Push transforms authoring
          // syntax before publishing, so compiling the raw stored string would
          // reject `{{var|fallback}}` (a Handlebars parse error, since `|` is
          // block-params) for a template that sends perfectly well.
          const sesContent = transformVariablesForSes(content);
          for (const data of [EMPTY_DATA, testData]) {
            // Strict compile: a template SES or our renderer can't parse is a
            // failure here, not at send time.
            const out = Handlebars.compile(sesContent)(data);
            expect(
              out.includes("{{"),
              `${slug} ${partName}: rendered output contains literal {{ with data=${JSON.stringify(
                Object.keys(data)
              )}`
            ).toBe(false);
            expect(
              out.includes("}}"),
              `${slug} ${partName}: rendered output contains literal }} with data=${JSON.stringify(
                Object.keys(data)
              )}`
            ).toBe(false);
          }
        }
      }
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Workflow → template referential integrity: every sendEmail step in
// wraps/workflows must reference a template file that exists. A renamed or
// deleted template otherwise fails at send time, not review time.
// ─────────────────────────────────────────────────────────────────────────────

describe("wraps/workflows sendEmail template references", () => {
  const WORKFLOWS_DIR = resolve(TEMPLATES_DIR, "..", "workflows");

  if (!(existsSync(WORKFLOWS_DIR) && existsSync(TEMPLATES_DIR))) {
    it.skip("workflows or templates directory not present — skipping", () => {
      // no-op
    });
    return;
  }

  it("every template slug referenced by a workflow has a matching template file", async () => {
    const { readFile } = await import("node:fs/promises");
    const templateSlugs = new Set(
      readdirSync(TEMPLATES_DIR)
        .filter((f) => f.endsWith(".tsx"))
        .map((f) => f.replace(/\.tsx$/, ""))
    );

    const missing: string[] = [];
    for (const file of readdirSync(WORKFLOWS_DIR).filter((f) =>
      f.endsWith(".ts")
    )) {
      const source = await readFile(join(WORKFLOWS_DIR, file), "utf-8");
      for (const match of source.matchAll(
        /template:\s*["']([a-z0-9-]+)["']/g
      )) {
        if (!templateSlugs.has(match[1])) {
          missing.push(`${file} → ${match[1]}`);
        }
      }
    }

    expect(missing, `workflow steps reference missing templates`).toEqual([]);
  });
});
