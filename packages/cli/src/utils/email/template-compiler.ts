import { existsSync } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

// ── Types ──

export type WrapsConfig = {
  org: string;
  from?: { email: string; name?: string };
  region?: string;
  templatesDir?: string;
  workflowsDir?: string;
};

export type PreviewResult = {
  slug: string;
  html: string;
  subject: string;
  emailType: "marketing" | "transactional";
  previewText?: string;
};

// ── Config Loading ──

export async function loadWrapsConfig(wrapsDir: string): Promise<WrapsConfig> {
  const configPath = join(wrapsDir, "wraps.config.ts");
  const { build } = await import("esbuild");

  // Create a shim for @wraps.dev/client so esbuild can resolve it
  // defineConfig and defineBrand are identity functions — no need for the real package
  const shimDir = join(wrapsDir, ".wraps", "_shims");
  await mkdir(shimDir, { recursive: true });
  await writeFile(
    join(shimDir, "wraps-client-shim.mjs"),
    "export const defineConfig = (c) => c;\nexport const defineBrand = (b) => b;\n",
    "utf-8"
  );

  const result = await build({
    entryPoints: [configPath],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    target: "node24",
    alias: {
      "@wraps.dev/client": join(shimDir, "wraps-client-shim.mjs"),
    },
  });

  const code = result.outputFiles[0].text;
  // Write to temp file for dynamic import
  const tmpPath = join(wrapsDir, ".wraps", "_config.mjs");
  await writeFile(tmpPath, code, "utf-8");

  const mod = await import(tmpPath);
  const config = mod.default;

  if (!config?.org) {
    const { errors } = await import("../../utils/shared/errors.js");
    throw errors.wrapsConfigNotFound();
  }

  return config as WrapsConfig;
}

// ── Template Discovery ──

export async function discoverTemplates(
  dir: string,
  filter?: string
): Promise<string[]> {
  const entries = await readdir(dir);
  const templates = entries.filter(
    (f) =>
      (f.endsWith(".tsx") || f.endsWith(".ts")) &&
      !f.startsWith("_") &&
      !f.endsWith(".d.ts")
  );

  if (filter) {
    const slug = filter.replace(/\.tsx?$/, "");
    return templates.filter((f) => f.replace(/\.tsx?$/, "") === slug);
  }

  return templates;
}

// ── Node Modules Resolution ──

/**
 * Find node_modules directories that contain react and @react-email packages.
 * Needed because pnpm's strict node_modules layout doesn't hoist packages.
 */
export async function findCliNodeModules(): Promise<string[]> {
  const paths: string[] = [];

  // Try to find react via require.resolve from the CLI's package context
  try {
    const { createRequire } = await import("node:module");
    // Use the CLI's dist directory as resolve base
    const { dirname } = await import("node:path");

    // Try multiple resolution strategies
    for (const base of [
      // The current file's location (works when running from source)
      import.meta.url,
      // Process entry point (works when running bundled CLI)
      `file://${process.argv[1]}`,
    ]) {
      try {
        const req = createRequire(base);
        const reactPkg = req.resolve("react/package.json");
        const reactNodeModules = join(dirname(reactPkg), "..");
        if (existsSync(join(reactNodeModules, "react"))) {
          paths.push(reactNodeModules);
          break;
        }
      } catch {}
    }
  } catch {
    // Fallback: search up from cwd
  }

  return paths;
}

// ── Preview Compilation ──

/**
 * Compile a template for preview using its testData export.
 * Returns rendered HTML suitable for displaying in a browser.
 */
export async function compileForPreview(
  filePath: string,
  slug: string,
  wrapsDir: string
): Promise<PreviewResult> {
  const { build } = await import("esbuild");

  const cliNodeModules = await findCliNodeModules();

  const result = await build({
    entryPoints: [filePath],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    target: "node24",
    jsx: "automatic",
    nodePaths: cliNodeModules,
    banner: {
      js: 'import { createRequire as __createRequire } from "node:module";\nconst require = __createRequire(import.meta.url);\n',
    },
  });

  const bundledCode = result.outputFiles[0].text;

  // Write to temp file for dynamic import
  const projectRoot = join(wrapsDir, "..");
  const tmpDir = join(projectRoot, "node_modules", ".wraps-compiled");
  await mkdir(tmpDir, { recursive: true });

  // Add cache-busting query param so Node reimports on file change
  const tmpPath = join(tmpDir, `${slug}.preview.mjs`);
  await writeFile(tmpPath, bundledCode, "utf-8");

  const mod = await import(`${tmpPath}?t=${Date.now()}`);
  const Component = mod.default;
  const subject: string = mod.subject || slug;
  const emailType: "marketing" | "transactional" = mod.emailType || "marketing";
  const previewText: string | undefined = mod.previewText;
  const testData: Record<string, unknown> = mod.testData || {};

  if (typeof Component !== "function") {
    throw new Error(
      "Template must have a default export (React component function)"
    );
  }

  // Render with testData props instead of handlebars proxy
  const { render } = await import("@react-email/render");
  const element = Component(testData);
  const html = await render(element);

  return { slug, html, subject, emailType, previewText };
}

/**
 * Convert authoring syntax into what SES actually receives.
 *
 *   {{contact.email}}      → {{contactEmail}}
 *   {{firstName|there}}    → {{#if firstName}}{{firstName}}{{else}}there{{/if}}
 *
 * Applied at push time, so a stored template legitimately holds the authoring
 * form and only the published SES artifact is transformed. Anything that
 * asserts on "what SES will parse" has to run this first, or it is checking a
 * string SES never sees.
 *
 * Re-exported from `@wraps/template-render` rather than reimplemented: the CLI
 * carried a byte-for-byte copy, and two copies of the rule that decides what
 * SES parses is exactly the drift that package exists to prevent. tsup bundles
 * it into dist (see `noExternal`), so the published CLI carries no runtime
 * dependency on the private workspace package.
 */
export { transformVariablesForSes } from "@wraps/template-render/mustache-case";
