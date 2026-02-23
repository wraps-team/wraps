import { execSync } from "node:child_process";
import { join } from "node:path";
import { createTestSuite } from "@workflow/world-testing";
import { beforeAll, test } from "vitest";

const hasAWS = !!process.env.AWS_REGION;

if (hasAWS) {
  // Use a dedicated queue prefix so tests don't compete with SST Lambda consumers
  const prefix = `wf-test-${Date.now().toString(36)}`;
  process.env.WORKFLOW_AWS_TABLE_PREFIX ??= "workflow";
  process.env.WORKFLOW_AWS_QUEUE_PREFIX = prefix;

  // Ensure pnpm-linked packages are resolvable from the child process
  const pnpmModules = join(process.cwd(), "node_modules/.pnpm/node_modules");
  process.env.NODE_PATH = process.env.NODE_PATH
    ? `${pnpmModules}:${process.env.NODE_PATH}`
    : pnpmModules;

  beforeAll(async () => {
    execSync("node bin/world-aws-setup.js", {
      stdio: "inherit",
      cwd: new URL("..", import.meta.url).pathname,
      env: process.env,
    });
  }, 120_000);

  test("smoke", () => {});
  createTestSuite("@wraps.dev/world-aws");
} else {
  test.skip("skipped: AWS_REGION not set", () => {});
}
