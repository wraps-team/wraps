/**
 * Creates and removes the fake home directory that `vitest.config.ts` points
 * HOME, USERPROFILE, the XDG dirs and PULUMI_HOME at. Runs once per vitest run.
 *
 * The directory is created here rather than in the config file because vitest can
 * evaluate a config more than once, and each evaluation would leak a directory.
 * The config only computes the path and publishes it in WRAPS_CLI_TEST_HOME.
 */
import { mkdirSync, rmSync } from "node:fs";

export function setup(): void {
  const fakeHome = process.env.WRAPS_CLI_TEST_HOME;
  if (!fakeHome) {
    throw new Error("WRAPS_CLI_TEST_HOME is not set; see vitest.config.ts");
  }
  mkdirSync(fakeHome, { recursive: true });
}

export function teardown(): void {
  const fakeHome = process.env.WRAPS_CLI_TEST_HOME;
  if (fakeHome?.includes("wraps-cli-home-")) {
    rmSync(fakeHome, { recursive: true, force: true });
  }
}
