/**
 * Workflows Validate Command
 *
 * Validates workflow TypeScript files in wraps/workflows/ directory.
 *
 * Usage:
 *   wraps email workflows validate [options]
 *
 * Options:
 *   --workflow <name>  Validate specific workflow
 *   --json             Output as JSON
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
  parseWorkflowTs,
} from "../../../utils/email/workflow-ts.js";
import { validateTransformedWorkflow } from "../../../utils/email/workflow-validator.js";
import { errors } from "../../../utils/shared/errors.js";
import {
  isJsonMode,
  jsonError,
  jsonSuccess,
} from "../../../utils/shared/json-output.js";
import { DeploymentProgress } from "../../../utils/shared/output.js";

type WorkflowsValidateOptions = {
  workflow?: string;
  json?: boolean;
};

export async function workflowsValidate(options: WorkflowsValidateOptions) {
  const startTime = Date.now();
  const cwd = process.cwd();
  const wrapsDir = join(cwd, "wraps");
  const configPath = join(wrapsDir, "wraps.config.ts");

  if (!existsSync(configPath)) {
    throw errors.wrapsConfigNotFound();
  }

  if (!isJsonMode()) {
    clack.intro(pc.bold("Validate Workflows"));
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
      jsonSuccess("email.workflows.validate", { workflows: [], errors: [] });
    } else {
      clack.log.info("No workflows/ directory found.");
    }
    return;
  }

  const workflowFiles = await discoverWorkflows(workflowsDir, options.workflow);

  if (workflowFiles.length === 0) {
    if (isJsonMode()) {
      jsonSuccess("email.workflows.validate", { workflows: [], errors: [] });
    } else {
      clack.log.info("No workflows found to validate.");
    }
    return;
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

  // Parse and validate workflows
  const validationResults: Array<{
    slug: string;
    valid: boolean;
    errors: Array<{ nodeId?: string; message: string; severity: string }>;
    warnings: Array<{ nodeId?: string; message: string; severity: string }>;
  }> = [];

  const parseErrors: Array<{ slug: string; error: string }> = [];

  for (const file of workflowFiles) {
    const slug = file.replace(/\.ts$/, "");
    const filePath = join(workflowsDir, file);

    progress.start(`Validating ${pc.cyan(slug)}`);

    try {
      // Parse the workflow
      const parsed = await parseWorkflowTs(filePath, wrapsDir);

      // Transform to flat format
      const transformed = transformWorkflow(parsed.definition);

      // Validate
      const result = validateTransformedWorkflow(
        transformed,
        localTemplateSlugs
      );

      const errs = result.errors.filter((e) => e.severity === "error");
      const warnings = result.errors.filter((e) => e.severity === "warning");

      validationResults.push({
        slug,
        valid: errs.length === 0,
        errors: errs.map((e) => ({
          nodeId: e.nodeId,
          message: e.message,
          severity: e.severity,
        })),
        warnings: warnings.map((e) => ({
          nodeId: e.nodeId,
          message: e.message,
          severity: e.severity,
        })),
      });

      if (errs.length === 0 && warnings.length === 0) {
        progress.succeed(`${pc.cyan(slug)} is valid`);
      } else if (errs.length === 0) {
        progress.succeed(
          `${pc.cyan(slug)} is valid with ${warnings.length} warning(s)`
        );
      } else {
        progress.fail(
          `${pc.cyan(slug)} has ${errs.length} error(s), ${warnings.length} warning(s)`
        );
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      parseErrors.push({ slug, error: errMsg });
      progress.fail(`Failed to parse ${pc.cyan(slug)}: ${errMsg}`);
    }
  }

  const allValid =
    parseErrors.length === 0 && validationResults.every((r) => r.valid);

  // Output results
  if (isJsonMode()) {
    if (allValid) {
      jsonSuccess("email.workflows.validate", {
        workflows: validationResults,
        parseErrors,
      });
    } else {
      jsonError("email.workflows.validate", {
        code: "VALIDATION_FAILED",
        message: "One or more workflows have validation errors",
      });
    }
  } else {
    console.log();

    const validCount = validationResults.filter((r) => r.valid).length;
    const invalidCount = validationResults.filter((r) => !r.valid).length;
    const parseErrorCount = parseErrors.length;

    if (parseErrorCount === 0 && invalidCount === 0) {
      clack.log.success(
        pc.green(`${validCount} workflow(s) validated successfully`)
      );
    } else {
      if (validCount > 0) {
        clack.log.success(pc.green(`${validCount} workflow(s) valid`));
      }
      if (invalidCount > 0) {
        clack.log.error(pc.red(`${invalidCount} workflow(s) have errors`));
      }
      if (parseErrorCount > 0) {
        clack.log.error(
          pc.red(`${parseErrorCount} workflow(s) failed to parse`)
        );
      }

      // Show details
      console.log();
      for (const result of validationResults) {
        if (!result.valid) {
          console.log(`  ${pc.cyan(result.slug)}:`);
          for (const err of result.errors) {
            console.log(
              `    ${pc.red("✕")} ${err.nodeId ? `[${err.nodeId}] ` : ""}${err.message}`
            );
          }
        }
      }

      for (const parseErr of parseErrors) {
        console.log(`  ${pc.cyan(parseErr.slug)}:`);
        console.log(`    ${pc.red("✕")} Parse error: ${parseErr.error}`);
      }
    }

    console.log();
  }

  trackCommand("email:workflows:validate", {
    success: allValid,
    duration_ms: Date.now() - startTime,
    valid_count: validationResults.filter((r) => r.valid).length,
    invalid_count: validationResults.filter((r) => !r.valid).length,
    parse_error_count: parseErrors.length,
  });

  if (!allValid) {
    process.exitCode = 1;
  }
}
