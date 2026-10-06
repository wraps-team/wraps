/**
 * Workflows Push Command
 *
 * Parses workflow TypeScript files and pushes them to the Wraps platform.
 *
 * Usage:
 *   wraps email workflows push [options]
 *
 * Options:
 *   --workflow <name>  Push specific workflow
 *   --dry-run          Preview changes without pushing
 *   --draft            Push as draft without enabling the workflow
 *   --force            Force push even if edited on dashboard
 *   --yes              Skip confirmation prompts
 *   --json             Output as JSON
 *   --token            API token
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import * as clack from "@clack/prompts";
import pc from "picocolors";
import { trackCommand } from "../../../telemetry/events.js";
import {
  discoverTemplates,
  loadWrapsConfig,
} from "../../../utils/email/template-compiler.js";
import { transformWorkflow } from "../../../utils/email/workflow-transform.js";
import {
  discoverWorkflows,
  type ParsedWorkflow,
  parseWorkflowTs,
} from "../../../utils/email/workflow-ts.js";
import { validateTransformedWorkflow } from "../../../utils/email/workflow-validator.js";
import {
  type ApiTarget,
  checkApiTarget,
  resolveApiTarget,
} from "../../../utils/shared/api-target.js";
import { errors } from "../../../utils/shared/errors.js";
import {
  isJsonMode,
  jsonError,
  jsonSuccess,
} from "../../../utils/shared/json-output.js";
import { loadLockfile, saveLockfile } from "../../../utils/shared/lockfile.js";
import { DeploymentProgress } from "../../../utils/shared/output.js";
import { resolvePushOrg } from "../../../utils/shared/push-org.js";

type WorkflowsPushOptions = {
  workflow?: string;
  dryRun?: boolean;
  draft?: boolean;
  force?: boolean;
  yes?: boolean;
  json?: boolean;
  token?: string;
  org?: string;
};

type TransformedWorkflowData = {
  slug: string;
  parsed: ParsedWorkflow;
  transformed: ReturnType<typeof transformWorkflow>;
};

export async function workflowsPush(options: WorkflowsPushOptions) {
  const startTime = Date.now();
  const cwd = process.cwd();
  const wrapsDir = join(cwd, "wraps");
  const configPath = join(wrapsDir, "wraps.config.ts");

  if (!existsSync(configPath)) {
    throw errors.wrapsConfigNotFound();
  }

  if (!isJsonMode()) {
    clack.intro(pc.bold("Push Workflows"));
  }

  const progress = new DeploymentProgress();

  // Load wraps.config.ts
  progress.start("Loading configuration");
  const config = await loadWrapsConfig(wrapsDir);
  progress.succeed("Configuration loaded");

  // Discover workflow files
  const workflowsDir = join(wrapsDir, config.workflowsDir || "./workflows");

  if (!existsSync(workflowsDir)) {
    if (isJsonMode()) {
      jsonSuccess("email.workflows.push", {
        pushed: [],
        unchanged: [],
        errors: [],
      });
    } else {
      clack.log.info("No workflows/ directory found.");
    }
    return;
  }

  const workflowFiles = await discoverWorkflows(workflowsDir, options.workflow);

  if (workflowFiles.length === 0) {
    if (isJsonMode()) {
      jsonSuccess("email.workflows.push", {
        pushed: [],
        unchanged: [],
        errors: [],
      });
    } else {
      clack.log.info("No workflows found to push.");
    }
    return;
  }

  // Load lockfile
  const lockfile = await loadLockfile(wrapsDir);

  const target = await resolveApiTarget({ token: options.token });
  const org = await resolvePushOrg({
    target,
    flagOrg: options.org,
    configOrg: config.org,
    yes: options.yes,
  });
  if (
    org &&
    lockfile.org &&
    lockfile.org.toLowerCase() !== org.slug.toLowerCase()
  ) {
    // The lockfile's hashes and IDs belong to another org. Reusing them would
    // report everything "unchanged" and push nothing to this one.
    if (!isJsonMode()) {
      clack.log.info(
        `Last push went to "${lockfile.org}" — pushing everything to ${pc.cyan(org.slug)}.`
      );
    }
    lockfile.templates = {};
    lockfile.workflows = {};
  }

  // Discover local templates for reference validation
  const templatesDir = join(wrapsDir, config.templatesDir || "./templates");
  let localTemplateSlugs: Set<string> | undefined;

  if (existsSync(templatesDir)) {
    const templateFiles = await discoverTemplates(templatesDir);
    localTemplateSlugs = new Set(
      templateFiles.map((f) => f.replace(/\.tsx?$/, ""))
    );
  }

  // Parse, transform, and validate workflows
  const toProcess: TransformedWorkflowData[] = [];
  const unchanged: string[] = [];
  const parseErrors: Array<{ slug: string; error: string }> = [];
  const validationErrors: Array<{
    slug: string;
    errors: Array<{ nodeId?: string; message: string }>;
  }> = [];

  for (const file of workflowFiles) {
    const slug = file.replace(/\.ts$/, "");
    const filePath = join(workflowsDir, file);

    progress.start(`Processing ${pc.cyan(slug)}`);

    try {
      // Parse the workflow
      const parsed = await parseWorkflowTs(filePath, wrapsDir);

      // Check lockfile for change detection
      const localHashMatches =
        lockfile.workflows?.[slug]?.localHash === parsed.sourceHash;

      if (!options.force && localHashMatches) {
        unchanged.push(slug);
        progress.succeed(`${pc.cyan(slug)} unchanged`);
        continue;
      }

      // Transform to flat format
      const transformed = transformWorkflow(parsed.definition);

      // Validate
      const validation = validateTransformedWorkflow(
        transformed,
        localTemplateSlugs
      );

      const errs = validation.errors.filter((e) => e.severity === "error");
      if (errs.length > 0) {
        validationErrors.push({
          slug,
          errors: errs.map((e) => ({
            nodeId: e.nodeId,
            message: e.message,
          })),
        });
        progress.fail(`${pc.cyan(slug)} has validation errors`);
        continue;
      }

      toProcess.push({ slug, parsed, transformed });
      progress.succeed(`${pc.cyan(slug)} validated`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      parseErrors.push({ slug, error: errMsg });
      progress.fail(`Failed to parse ${pc.cyan(slug)}: ${errMsg}`);
    }
  }

  // Show validation errors and exit if any
  if (validationErrors.length > 0 || parseErrors.length > 0) {
    if (isJsonMode()) {
      jsonError("email.workflows.push", {
        code: "VALIDATION_FAILED",
        message: [
          ...parseErrors.map((e) => `${e.slug}: ${e.error}`),
          ...validationErrors.flatMap((v) =>
            v.errors.map(
              (e) =>
                `${v.slug}${e.nodeId ? ` [${e.nodeId}]` : ""}: ${e.message}`
            )
          ),
        ].join("; "),
      });
    } else {
      console.log();
      clack.log.error(
        pc.red("Cannot push due to validation errors. Fix errors and retry.")
      );
      console.log();
      for (const v of validationErrors) {
        console.log(`  ${pc.cyan(v.slug)}:`);
        for (const e of v.errors) {
          console.log(
            `    ${pc.red("✕")} ${e.nodeId ? `[${e.nodeId}] ` : ""}${e.message}`
          );
        }
      }
      for (const parseErr of parseErrors) {
        console.log(`  ${pc.cyan(parseErr.slug)}:`);
        console.log(`    ${pc.red("✕")} Parse error: ${parseErr.error}`);
      }
      console.log();
    }
    process.exitCode = 1;
    return;
  }

  if (toProcess.length === 0) {
    if (isJsonMode()) {
      jsonSuccess("email.workflows.push", {
        pushed: [],
        unchanged,
        errors: [],
      });
    } else {
      clack.log.info(
        `${unchanged.length} workflow(s) unchanged. Use --force to re-push.`
      );
    }
    return;
  }

  // Dry run: show what would be pushed
  if (options.dryRun) {
    if (isJsonMode()) {
      jsonSuccess("email.workflows.push", {
        dryRun: true,
        wouldPush: toProcess.map((w) => ({
          slug: w.slug,
          name: w.parsed.definition.name,
          triggerType: w.transformed.triggerType,
          steps: w.transformed.steps.length,
        })),
        unchanged,
        errors: [],
      });
    } else {
      console.log();
      clack.log.info(pc.bold("Dry run — no changes made"));
      console.log();
      for (const w of toProcess) {
        console.log(
          `  ${pc.green("●")} ${pc.cyan(w.slug)} — ${w.parsed.definition.name} (${w.transformed.steps.length} steps)`
        );
      }
      for (const slug of unchanged) {
        console.log(`  ${pc.dim("○")} ${pc.dim(slug)} — unchanged`);
      }
      console.log();
    }
    return;
  }

  // Push to API
  const apiResults = await pushToAPI(
    toProcess,
    target,
    progress,
    {
      force: options.force,
      draft: options.draft,
    },
    org?.id
  );

  // Only update lockfile for workflows that succeeded
  for (const w of toProcess) {
    const apiResult = apiResults.find((r) => r.slug === w.slug);
    if (apiResult?.success) {
      lockfile.workflows[w.slug] = {
        id: apiResult?.id,
        localHash: w.parsed.sourceHash,
        remoteHash: w.parsed.sourceHash,
        lastPushed: new Date().toISOString(),
      };
    }
  }
  lockfile.lastSync = new Date().toISOString();
  lockfile.org = org?.slug ?? config.org;
  await saveLockfile(wrapsDir, lockfile);

  // Output results
  const pushed = apiResults.filter((r) => r.success);
  const conflicts = apiResults.filter((r) => r.conflict);

  const failed = apiResults.filter((r) => !(r.success || r.conflict));

  const drafts = pushed.filter((r) => r.status === "draft");
  const paused = pushed.filter((r) => r.status === "paused");
  const enabled = pushed.filter((r) => r.status === "enabled");

  if (isJsonMode()) {
    if (conflicts.length === 0 && failed.length === 0) {
      jsonSuccess("email.workflows.push", {
        pushed: pushed.map((r) => ({
          slug: r.slug,
          id: r.id,
          status: r.status,
        })),
        unchanged,
        conflicts: [],
      });
    } else if (conflicts.length > 0) {
      jsonError("email.workflows.push", {
        code: "CONFLICT",
        message: `${conflicts.length} workflow(s) were edited on dashboard since last push`,
      });
    } else {
      jsonError("email.workflows.push", {
        code: "SYNC_FAILED",
        message: `${failed.length} workflow(s) failed to sync`,
      });
    }
  } else {
    console.log();
    if (enabled.length > 0) {
      clack.log.success(
        pc.green(`${enabled.length} workflow(s) pushed and enabled`)
      );
    }
    if (drafts.length > 0) {
      clack.log.success(
        pc.green(`${drafts.length} workflow(s) pushed as draft`)
      );
    }
    for (const r of paused) {
      clack.log.warn(
        `${r.slug} updated but left paused (it was paused in the dashboard). Resume it there.`
      );
    }
    if (failed.length > 0) {
      clack.log.error(`${failed.length} workflow(s) failed to sync`);
    }
    if (unchanged.length > 0) {
      clack.log.info(`${unchanged.length} unchanged (use --force to re-push)`);
    }
    if (conflicts.length > 0) {
      clack.log.error(
        `${conflicts.length} workflow(s) skipped due to dashboard edits. Use --force to overwrite.`
      );
      for (const c of conflicts) {
        console.log(`  ${pc.yellow("!")} ${pc.cyan(c.slug)}`);
      }
    }
    console.log();
  }

  trackCommand("email:workflows:push", {
    success: conflicts.length === 0 && failed.length === 0 && pushed.length > 0,
    duration_ms: Date.now() - startTime,
    pushed_count: pushed.length,
    unchanged_count: unchanged.length,
    conflict_count: conflicts.length,
  });

  if (conflicts.length > 0 || failed.length > 0) {
    process.exitCode = 1;
  }
}

// ── API Push ──

type APIPushResult = {
  slug: string;
  id?: string;
  status?: string;
  success: boolean;
  conflict?: boolean;
};

async function pushToAPI(
  workflows: TransformedWorkflowData[],
  target: ApiTarget,
  progress: DeploymentProgress,
  options: { force?: boolean; draft?: boolean },
  orgId?: string
): Promise<APIPushResult[]> {
  const check = checkApiTarget(target);
  if (!check.ok) {
    progress.info(
      `${check.reason} — skipping dashboard sync. ${check.suggestion}`
    );
    return workflows.map((w) => ({ slug: w.slug, success: false }));
  }

  const { apiBase, token } = check.target;
  const results: APIPushResult[] = [];

  // Use batch endpoint if multiple workflows
  if (workflows.length > 1) {
    progress.start(`Syncing ${workflows.length} workflows to dashboard`);
    try {
      const resp = await fetch(`${apiBase}/v1/workflows/push/batch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(orgId ? { "X-Organization-Id": orgId } : {}),
        },
        body: JSON.stringify({
          workflows: workflows.map((w) => ({
            slug: w.slug,
            name: w.parsed.definition.name,
            description: w.parsed.definition.description,
            sourceTs: w.parsed.source,
            sourceHash: w.parsed.sourceHash,
            steps: w.transformed.steps,
            transitions: w.transformed.transitions,
            triggerType: w.transformed.triggerType,
            triggerConfig: w.transformed.triggerConfig,
            settings: w.transformed.settings,
            defaults: w.transformed.defaults,
            cliProjectPath: w.parsed.cliProjectPath,
            force: options.force ?? false,
            draft: options.draft ?? false,
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
          results.push({ slug: c.slug, success: false, conflict: true });
        }
        // Handle successes
        for (const r of data.results ?? []) {
          results.push({
            slug: r.slug,
            id: r.id,
            status: r.status,
            success: true,
          });
        }
        // Show summary
        const successCount = data.results?.length ?? 0;
        const conflictCount = data.conflicts?.length ?? 0;
        if (successCount > 0 && conflictCount > 0) {
          progress.succeed(`Synced ${successCount} workflows to dashboard`);
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
          results.push({
            slug: r.slug,
            id: r.id,
            status: r.status,
            success: true,
          });
        }
        progress.succeed(`Synced ${workflows.length} workflows to dashboard`);
      } else {
        const body = await resp.text();
        throw new Error(`API returned ${resp.status}: ${body}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      progress.fail(`Dashboard sync failed: ${msg}`);
      for (const w of workflows) {
        results.push({ slug: w.slug, success: false });
      }
    }
  } else if (workflows.length === 1) {
    const w = workflows[0];
    progress.start(`Syncing ${pc.cyan(w.slug)} to dashboard`);
    try {
      const resp = await fetch(`${apiBase}/v1/workflows/push`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(orgId ? { "X-Organization-Id": orgId } : {}),
        },
        body: JSON.stringify({
          slug: w.slug,
          name: w.parsed.definition.name,
          description: w.parsed.definition.description,
          sourceTs: w.parsed.source,
          sourceHash: w.parsed.sourceHash,
          steps: w.transformed.steps,
          transitions: w.transformed.transitions,
          triggerType: w.transformed.triggerType,
          triggerConfig: w.transformed.triggerConfig,
          settings: w.transformed.settings,
          defaults: w.transformed.defaults,
          cliProjectPath: w.parsed.cliProjectPath,
          force: options.force ?? false,
          draft: options.draft ?? false,
        }),
      });

      if (Number(resp.status) === 409) {
        results.push({ slug: w.slug, success: false, conflict: true });
        progress.fail(
          `${pc.cyan(w.slug)} was edited on the dashboard since last push. Use ${pc.bold("--force")} to overwrite.`
        );
      } else if (resp.ok) {
        const data = (await resp.json()) as {
          id: string;
          slug: string;
          status: string;
        };
        results.push({
          slug: data.slug,
          id: data.id,
          status: data.status,
          success: true,
        });
        progress.succeed(`Synced ${pc.cyan(w.slug)} to dashboard`);
      } else {
        const body = await resp.text();
        throw new Error(`API returned ${resp.status}: ${body}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ slug: w.slug, success: false });
      progress.fail(`Dashboard sync failed for ${w.slug}: ${msg}`);
    }
  }

  return results;
}
