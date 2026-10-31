/**
 * `email templates delete <id...>` and `email suppressions add <email...>` take
 * a list of positionals. cli.ts rejects positionals past index 3 for every other
 * command (they usually mean a value was given to a boolean flag), so these two
 * are exempt. The command unit tests call the handlers directly and never reach
 * that guard; this file drives the real entry point with --dry-run, which makes
 * no request.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const PKG_ROOT = join(import.meta.dirname, "../..");

function resolveTsx(): string {
  const candidates = [
    join(PKG_ROOT, "node_modules/.bin/tsx"),
    join(PKG_ROOT, "../../node_modules/.bin/tsx"),
  ];
  const found = candidates.find((c) => existsSync(c));
  if (!found) {
    throw new Error("tsx not found; cannot drive the CLI");
  }
  return found;
}

const homes: string[] = [];

afterAll(() => {
  for (const home of homes) {
    rmSync(home, { recursive: true, force: true });
  }
});

function runCli(args: string[]): { status: number | null; json: unknown } {
  const home = mkdtempSync(join(tmpdir(), "wraps-variadic-"));
  homes.push(home);
  const result = spawnSync(
    resolveTsx(),
    [join(PKG_ROOT, "src/cli.ts"), ...args],
    {
      cwd: PKG_ROOT,
      encoding: "utf-8",
      timeout: 60_000,
      env: {
        ...process.env,
        HOME: home,
        WRAPS_TELEMETRY_DISABLED: "1",
        NO_COLOR: "1",
      },
    }
  );
  return { status: result.status, json: JSON.parse(result.stdout) };
}

describe("variadic positionals reach the handler", () => {
  it("email templates delete takes every id", () => {
    const { status, json } = runCli([
      "email",
      "templates",
      "delete",
      "tpl_a",
      "tpl_b",
      "tpl_c",
      "--dry-run",
      "--json",
    ]);
    expect(status).toBe(0);
    expect(JSON.stringify(json)).not.toContain("Unrecognized argument");
    expect(json).toMatchObject({ success: true });
    for (const id of ["tpl_a", "tpl_b", "tpl_c"]) {
      expect(JSON.stringify(json)).toContain(id);
    }
  }, 60_000);

  it("email suppressions add takes every address", () => {
    const { status, json } = runCli([
      "email",
      "suppressions",
      "add",
      "a@example.com",
      "b@example.com",
      "--account",
      "acc_1",
      "--reason",
      "bounce",
      "--dry-run",
      "--json",
    ]);
    expect(status).toBe(0);
    expect(JSON.stringify(json)).not.toContain("Unrecognized argument");
    expect(json).toMatchObject({ success: true });
    for (const email of ["a@example.com", "b@example.com"]) {
      expect(JSON.stringify(json)).toContain(email);
    }
  }, 60_000);

  it("other commands still reject extra positionals", () => {
    const { status, json } = runCli([
      "email",
      "logs",
      "get",
      "msg_1",
      "msg_2",
      "--json",
    ]);
    expect(status).not.toBe(0);
    expect(JSON.stringify(json)).toContain("Unrecognized argument: msg_2");
  }, 60_000);
});
