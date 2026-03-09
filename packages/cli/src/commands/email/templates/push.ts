import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as clack from "@clack/prompts";
import pc from "picocolors";
import { trackCommand } from "../../../telemetry/events.js";
import {
  discoverTemplates,
  findCliNodeModules,
  loadWrapsConfig,
} from "../../../utils/email/template-compiler.js";
import {
  getApiBaseUrl,
  resolveTokenAsync,
} from "../../../utils/shared/config.js";
import { errors } from "../../../utils/shared/errors.js";
import { isJsonMode, jsonSuccess } from "../../../utils/shared/json-output.js";
import { loadLockfile, saveLockfile } from "../../../utils/shared/lockfile.js";
import { DeploymentProgress } from "../../../utils/shared/output.js";

type TemplatesPushOptions = {
  template?: string;
  dryRun?: boolean;
  force?: boolean;
  yes?: boolean;
  json?: boolean;
  token?: string;
};

type CompiledTemplate = {
  slug: string;
  source: string;
  sourceHash: string;
  subject: string;
  emailType: "marketing" | "transactional";
  previewText?: string;
  compiledHtml: string;
  compiledText: string;
  variables: Array<{ name: string; fallback?: string }>;
  sesTemplateName: string;
  cliProjectPath: string;
};

export async function templatesPush(options: TemplatesPushOptions) {
  const startTime = Date.now();
  const cwd = process.cwd();
  const wrapsDir = join(cwd, "wraps");
  const configPath = join(wrapsDir, "wraps.config.ts");

  if (!existsSync(configPath)) {
    throw errors.wrapsConfigNotFound();
  }

  if (!isJsonMode()) {
    clack.intro(pc.bold("Push Templates"));
  }

  const progress = new DeploymentProgress();

  // Load wraps.config.ts
  progress.start("Loading configuration");
  const config = await loadWrapsConfig(wrapsDir);
  progress.succeed("Configuration loaded");

  // Discover template files
  const templatesDir = join(wrapsDir, config.templatesDir || "./templates");

  if (!existsSync(templatesDir)) {
    throw errors.wrapsConfigNotFound();
  }

  const templateFiles = await discoverTemplates(templatesDir, options.template);

  if (templateFiles.length === 0) {
    if (!isJsonMode()) {
      clack.log.info("No templates found to push.");
    }
    return;
  }

  // Load lockfile
  const lockfile = await loadLockfile(wrapsDir);

  // Fetch remote template slugs to detect deletions
  const token = await resolveTokenAsync({ token: options.token });
  const remoteTemplateSlugs = await fetchRemoteTemplateSlugs(token, progress);

  // Compile templates
  const compiled: CompiledTemplate[] = [];
  const unchanged: string[] = [];
  const compileErrors: Array<{ slug: string; error: string }> = [];

  for (const file of templateFiles) {
    const slug = file.replace(/\.tsx?$/, "");
    const filePath = join(templatesDir, file);
    const source = await readFile(filePath, "utf-8");
    const sourceHash = sha256(source);

    // Check lockfile for change detection
    // --force bypasses both local change detection AND dashboard conflict detection
    // Also check if template exists remotely - if deleted from dashboard, re-push it
    const localHashMatches = lockfile.templates[slug]?.localHash === sourceHash;
    const existsRemotely =
      remoteTemplateSlugs === null || remoteTemplateSlugs.has(slug);

    if (!options.force && localHashMatches && existsRemotely) {
      unchanged.push(slug);
      continue;
    }

    progress.start(`Compiling ${pc.cyan(slug)}`);
    try {
      const result = await compileTemplate(
        filePath,
        slug,
        source,
        sourceHash,
        wrapsDir
      );
      compiled.push(result);
      progress.succeed(`Compiled ${pc.cyan(slug)}`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      compileErrors.push({ slug, error: errMsg });
      progress.fail(`Failed to compile ${pc.cyan(slug)}: ${errMsg}`);
    }
  }

  if (compiled.length === 0 && compileErrors.length === 0) {
    if (isJsonMode()) {
      jsonSuccess("email.templates.push", {
        pushed: [],
        unchanged,
        errors: [],
      });
    } else {
      clack.log.info(
        `${unchanged.length} template${unchanged.length === 1 ? "" : "s"} unchanged. Use --force to re-push.`
      );
    }
    return;
  }

  // Dry run: show what would be pushed
  if (options.dryRun) {
    if (isJsonMode()) {
      jsonSuccess("email.templates.push", {
        dryRun: true,
        wouldPush: compiled.map((t) => ({
          slug: t.slug,
          subject: t.subject,
          emailType: t.emailType,
          variables: t.variables.length,
        })),
        unchanged,
        errors: compileErrors,
      });
    } else {
      console.log();
      clack.log.info(pc.bold("Dry run — no changes made"));
      console.log();
      for (const t of compiled) {
        console.log(
          `  ${pc.green("●")} ${pc.cyan(t.slug)} — ${t.subject} (${t.variables.length} variables)`
        );
      }
      for (const slug of unchanged) {
        console.log(`  ${pc.dim("○")} ${pc.dim(slug)} — unchanged`);
      }
      for (const e of compileErrors) {
        console.log(`  ${pc.red("✕")} ${pc.red(e.slug)} — ${e.error}`);
      }
      console.log();
    }
    return;
  }

  // Push to SES
  const sesResults = await pushToSES(compiled, progress);

  // Push to API (token already resolved above)
  const apiResults = await pushToAPI(compiled, token, progress, options.force);

  // Only update lockfile for templates that succeeded in at least one target
  for (const t of compiled) {
    const sesOk = sesResults.find((r) => r.slug === t.slug)?.success;
    const apiResult = apiResults.find((r) => r.slug === t.slug);
    const apiOk = apiResult?.success;
    if (sesOk || apiOk) {
      lockfile.templates[t.slug] = {
        id: apiResult?.id,
        localHash: t.sourceHash,
        remoteHash: t.sourceHash,
        sesTemplateName: t.sesTemplateName,
        lastPushed: new Date().toISOString(),
      };
    }
  }
  lockfile.lastSync = new Date().toISOString();
  lockfile.org = config.org;
  await saveLockfile(wrapsDir, lockfile);

  // Output results
  if (isJsonMode()) {
    jsonSuccess("email.templates.push", {
      pushed: compiled.map((t) => ({
        slug: t.slug,
        id: apiResults.find((r) => r.slug === t.slug)?.id,
        sesTemplateName: t.sesTemplateName,
      })),
      unchanged,
      errors: compileErrors,
    });
  } else {
    console.log();
    clack.log.success(
      pc.green(
        `${compiled.length} template${compiled.length === 1 ? "" : "s"} pushed`
      )
    );
    if (unchanged.length > 0) {
      clack.log.info(`${unchanged.length} unchanged (use --force to re-push)`);
    }
    if (compileErrors.length > 0) {
      clack.log.error(`${compileErrors.length} failed to compile`);
    }
    console.log();
  }

  trackCommand("email:templates:push", {
    success: compileErrors.length === 0,
    duration_ms: Date.now() - startTime,
    pushed_count: compiled.length,
    unchanged_count: unchanged.length,
    error_count: compileErrors.length,
  });
}

// ── Config Loading & Template Discovery ──
// Imported from ../../../utils/email/template-compiler.js

// ── Template Compilation ──

async function compileTemplate(
  filePath: string,
  slug: string,
  source: string,
  sourceHash: string,
  wrapsDir: string
): Promise<CompiledTemplate> {
  const { build } = await import("esbuild");

  // Bundle the template with ALL its imports (react, @react-email/components, brand.ts, _components/)
  // The bundled output is self-contained — only @react-email/render is needed at runtime for HTML generation
  // Use nodePaths to help esbuild find react/jsx-runtime in pnpm's strict node_modules layout
  const cliNodeModules = await findCliNodeModules();

  const result = await build({
    entryPoints: [filePath],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    target: "node20",
    jsx: "automatic",
    nodePaths: cliNodeModules,
    // Provide require() for CJS dependencies bundled into ESM output
    banner: {
      js: 'import { createRequire as __createRequire } from "node:module";\nconst require = __createRequire(import.meta.url);\n',
    },
  });

  const bundledCode = result.outputFiles[0].text;

  // Write to temp file for dynamic import
  // Place it in the project root (parent of wraps/) so Node can resolve
  // react and other externals from the project's node_modules
  const projectRoot = join(wrapsDir, "..");
  const tmpDir = join(projectRoot, "node_modules", ".wraps-compiled");
  await mkdir(tmpDir, { recursive: true });
  const tmpPath = join(tmpDir, `${slug}.mjs`);
  await writeFile(tmpPath, bundledCode, "utf-8");

  // Dynamic import to get exports
  const mod = await import(tmpPath);
  const Component = mod.default;
  const subject: string = mod.subject || slug;
  const emailType: "marketing" | "transactional" = mod.emailType || "marketing";
  const previewText: string | undefined = mod.previewText;

  if (typeof Component !== "function") {
    throw new Error(
      "Template must have a default export (React component function)"
    );
  }

  // Create proxy props that produce {{handlebars}} placeholders
  const props = new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (typeof prop === "symbol") {
          return;
        }
        return `{{${prop}}}`;
      },
    }
  );

  // Render with @react-email/render
  // The template bundle includes its own React copy via jsx-automatic transform
  // Call the component function to get a React element, then render to HTML
  const { render } = await import("@react-email/render");

  // The bundled component uses its own React — calling it produces React elements
  const element = Component(props);
  const html = await render(element);
  const text = await render(element, { plainText: true });

  // Extract variables from rendered output
  const variables = extractVariables(html);
  const sesSubject = transformVariablesForSes(subject);
  const sesHtml = transformVariablesForSes(html);
  const sesText = transformVariablesForSes(text);
  const sesTemplateName = slug
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 64);

  return {
    slug,
    source,
    sourceHash,
    subject: sesSubject,
    emailType,
    previewText,
    compiledHtml: sesHtml,
    compiledText: sesText,
    variables,
    sesTemplateName,
    cliProjectPath: `templates/${slug}.tsx`,
  };
}

// ── Variable Extraction & Transformation ──

function extractVariables(
  html: string
): Array<{ name: string; fallback?: string }> {
  const vars: Array<{ name: string; fallback?: string }> = [];
  const seen = new Set<string>();
  const regex = /\{\{([a-zA-Z0-9_.]+)(?:\|([^}]*))?\}\}/g;
  let match = regex.exec(html);

  while (match !== null) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      vars.push({ name, fallback: match[2]?.trim() });
    }
    match = regex.exec(html);
  }

  return vars;
}

function transformVariablesForSes(content: string): string {
  return content.replace(
    /\{\{\s*([a-zA-Z0-9_.]+)(?:\s*\|\s*([^}]*))?\s*\}\}/g,
    (_match, varName, fallback) => {
      // Flatten dot notation: contact.email → contactEmail
      const sesName = varName.includes(".")
        ? varName
            .split(".")
            .map((part: string, i: number) =>
              i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)
            )
            .join("")
        : varName;

      if (fallback !== undefined) {
        const trimmed = fallback.trim();
        return `{{#if ${sesName}}}{{${sesName}}}{{else}}${trimmed}{{/if}}`;
      }

      return `{{${sesName}}}`;
    }
  );
}

// ── SES Push ──

async function pushToSES(
  templates: CompiledTemplate[],
  progress: DeploymentProgress
): Promise<Array<{ slug: string; success: boolean }>> {
  const results: Array<{ slug: string; success: boolean }> = [];

  // Try to validate AWS credentials
  let hasAWSCredentials = false;
  let region = "us-east-1";

  try {
    const { validateAWSCredentialsWithDetails, getAWSRegion } = await import(
      "../../../utils/shared/aws.js"
    );
    await validateAWSCredentialsWithDetails();
    hasAWSCredentials = true;
    region = await getAWSRegion();
    // baseline:allow-next-line no-swallowed-errors — no credentials means skip SES push
  } catch {
    progress.info("No AWS credentials — skipping SES push");
    return templates.map((t) => ({ slug: t.slug, success: false }));
  }

  if (!hasAWSCredentials) {
    return templates.map((t) => ({ slug: t.slug, success: false }));
  }

  // Use SES client directly — it picks up credentials from the environment
  const {
    SESClient,
    GetTemplateCommand,
    CreateTemplateCommand,
    UpdateTemplateCommand,
  } = await import("@aws-sdk/client-ses");

  const ses = new SESClient({ region });

  try {
    const settled = await Promise.allSettled(
      templates.map(async (t) => {
        progress.start(`Pushing ${pc.cyan(t.slug)} to SES`);

        const templateData = {
          TemplateName: t.sesTemplateName,
          SubjectPart: t.subject,
          HtmlPart: t.compiledHtml,
          TextPart: t.compiledText,
        };

        // Check if template exists
        let exists = false;
        try {
          await ses.send(
            new GetTemplateCommand({ TemplateName: t.sesTemplateName })
          );
          exists = true;
        } catch (err) {
          const e = err as { name?: string };
          if (e.name !== "TemplateDoesNotExistException") {
            throw err;
          }
        }

        if (exists) {
          await ses.send(new UpdateTemplateCommand({ Template: templateData }));
        } else {
          await ses.send(new CreateTemplateCommand({ Template: templateData }));
        }

        progress.succeed(`Pushed ${pc.cyan(t.slug)} to SES`);
        return { slug: t.slug };
      })
    );

    for (let i = 0; i < templates.length; i++) {
      const result = settled[i];
      if (result.status === "fulfilled") {
        results.push({ slug: result.value.slug, success: true });
      } else {
        const msg =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
        results.push({ slug: templates[i].slug, success: false });
        progress.fail(`SES push failed for ${templates[i].slug}: ${msg}`);
      }
    }

    return results;
  } finally {
    ses.destroy();
  }
}

// ── API Remote Check ──

async function fetchRemoteTemplateSlugs(
  token: string | null,
  progress: DeploymentProgress
): Promise<Set<string> | null> {
  if (!token) {
    // No token = can't check remote, assume all exist (fall back to local-only detection)
    return null;
  }

  const apiBase = getApiBaseUrl();

  try {
    // Use the existing /pull endpoint which returns CLI-pushed templates
    const resp = await fetch(`${apiBase}/v1/templates/pull`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!resp.ok) {
      // API error = can't check remote, fall back to local-only detection
      progress.info(
        "Could not check remote templates — using local change detection only"
      );
      return null;
    }

    const data = (await resp.json()) as { templates: Array<{ slug: string }> };
    return new Set(data.templates.map((t) => t.slug));
    // baseline:allow-next-line no-swallowed-errors — network error falls back to local detection
  } catch {
    // Network error = can't check remote, fall back to local-only detection
    progress.info(
      "Could not check remote templates — using local change detection only"
    );
    return null;
  }
}

// ── API Push ──

type APIPushResult = {
  slug: string;
  id?: string;
  success: boolean;
};

async function pushToAPI(
  templates: CompiledTemplate[],
  token: string | null,
  progress: DeploymentProgress,
  force?: boolean
): Promise<APIPushResult[]> {
  if (!token) {
    progress.info(
      "No API token — skipping dashboard sync. Run: wraps auth login"
    );
    return templates.map((t) => ({ slug: t.slug, success: false }));
  }

  const apiBase = getApiBaseUrl();

  const results: APIPushResult[] = [];

  // Use batch endpoint if multiple templates
  if (templates.length > 1) {
    progress.start(`Syncing ${templates.length} templates to dashboard`);
    try {
      const resp = await fetch(`${apiBase}/v1/templates/push/batch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          templates: templates.map((t) => ({
            slug: t.slug,
            source: t.source,
            compiledHtml: t.compiledHtml,
            compiledText: t.compiledText,
            subject: t.subject,
            previewText: t.previewText,
            emailType: t.emailType,
            variables: t.variables,
            sourceHash: t.sourceHash,
            sesTemplateName: t.sesTemplateName,
            cliProjectPath: t.cliProjectPath,
            force: force ?? false,
          })),
        }),
      });

      if (Number(resp.status) === 409) {
        const data = (await resp.json()) as {
          conflicts: Array<{ slug: string; message: string }>;
          results: Array<{ slug: string; id: string; status: string }>;
        };
        // Handle conflicts
        for (const c of data.conflicts ?? []) {
          results.push({ slug: c.slug, success: false });
        }
        // Handle successes
        for (const r of data.results ?? []) {
          results.push({ slug: r.slug, id: r.id, success: true });
        }
        // Show summary
        const successCount = data.results?.length ?? 0;
        const conflictCount = data.conflicts?.length ?? 0;
        if (successCount > 0 && conflictCount > 0) {
          progress.succeed(`Synced ${successCount} templates to dashboard`);
          for (const c of data.conflicts ?? []) {
            progress.fail(
              `${pc.cyan(c.slug)} was edited on the dashboard. Use ${pc.bold("--force")} to overwrite.`
            );
          }
        } else if (conflictCount > 0) {
          for (const c of data.conflicts ?? []) {
            progress.fail(
              `${pc.cyan(c.slug)} was edited on the dashboard. Use ${pc.bold("--force")} to overwrite.`
            );
          }
        }
      } else if (resp.ok) {
        const data = (await resp.json()) as {
          results: Array<{ slug: string; id: string; status: string }>;
        };
        for (const r of data.results) {
          results.push({ slug: r.slug, id: r.id, success: true });
        }
        progress.succeed(`Synced ${templates.length} templates to dashboard`);
      } else {
        const body = await resp.text();
        throw new Error(`API returned ${resp.status}: ${body}`);
      }
    } catch (err) {
      const cause =
        err instanceof Error && err.cause instanceof Error
          ? `: ${err.cause.message}`
          : "";
      const msg = err instanceof Error ? err.message : String(err);
      progress.fail(`Dashboard sync failed: ${msg}${cause}`);
      for (const t of templates) {
        results.push({ slug: t.slug, success: false });
      }
    }
  } else if (templates.length === 1) {
    const t = templates[0];
    progress.start(`Syncing ${pc.cyan(t.slug)} to dashboard`);
    try {
      const resp = await fetch(`${apiBase}/v1/templates/push`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          slug: t.slug,
          source: t.source,
          compiledHtml: t.compiledHtml,
          compiledText: t.compiledText,
          subject: t.subject,
          previewText: t.previewText,
          emailType: t.emailType,
          variables: t.variables,
          sourceHash: t.sourceHash,
          sesTemplateName: t.sesTemplateName,
          cliProjectPath: t.cliProjectPath,
          force: force ?? false,
        }),
      });

      if (Number(resp.status) === 409) {
        results.push({ slug: t.slug, success: false });
        progress.fail(
          `${pc.cyan(t.slug)} was edited on the dashboard since your last push. Use ${pc.bold("--force")} to overwrite.`
        );
      } else if (resp.ok) {
        const data = (await resp.json()) as { id: string; slug: string };
        results.push({ slug: data.slug, id: data.id, success: true });
        progress.succeed(`Synced ${pc.cyan(t.slug)} to dashboard`);
      } else {
        const body = await resp.text();
        throw new Error(`API returned ${resp.status}: ${body}`);
      }
    } catch (err) {
      const cause =
        err instanceof Error && err.cause instanceof Error
          ? `: ${err.cause.message}`
          : "";
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ slug: t.slug, success: false });
      progress.fail(`Dashboard sync failed for ${t.slug}: ${msg}${cause}`);
    }
  }

  return results;
}

// ── Utilities ──

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

// findCliNodeModules imported from ../../../utils/email/template-compiler.js
