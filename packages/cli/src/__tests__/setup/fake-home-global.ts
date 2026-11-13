/**
 * Creates and removes the fake home directory that `vitest.config.ts` points
 * HOME, USERPROFILE, the XDG dirs and PULUMI_HOME at. Runs once per vitest run.
 *
 * The directory is created here rather than in the config file because vitest can
 * evaluate a config more than once, and each evaluation would leak a directory.
 * The config only computes the path and publishes it in WRAPS_CLI_TEST_HOME.
 */
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";

let created: string | undefined;

/** True only for a `wraps-cli-home-*` dir sitting directly under `tmp`. */
export function isRemovableFakeHome(dir: string, tmp: string): boolean {
  const resolved = resolve(dir);
  return (
    dirname(resolved) === resolve(tmp) &&
    basename(resolved).startsWith("wraps-cli-home-")
  );
}

export function setup(): void {
  const fakeHome = process.env.WRAPS_CLI_TEST_HOME;
  if (!fakeHome) {
    throw new Error("WRAPS_CLI_TEST_HOME is not set; see vitest.config.ts");
  }
  mkdirSync(fakeHome, { recursive: true });
  created = fakeHome;
}

export function teardown(): void {
  // Remove only the dir setup() made, and only if it is where we expect.
  if (created && isRemovableFakeHome(created, tmpdir())) {
    rmSync(created, { recursive: true, force: true });
  }
  created = undefined;
}
