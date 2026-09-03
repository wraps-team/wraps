/**
 * One CLI invocation emits one command outcome event.
 *
 * Two separate defects put the same command name on the wire more than once for
 * a single run, which inflated the failure rate on the CLI dashboard:
 *
 * 1. cli.ts reported the outcome itself even when the handler already had —
 *    fixed with `trackCommandFallback`, and covered as a unit in
 *    telemetry/__tests__/command-outcome-once.test.ts.
 * 2. `permissions` reported once on entry (carrying its flags, no `success`)
 *    and again on completion. That is what this file guards: it drives the real
 *    binary, so it catches a regression in either layer.
 *
 * `wraps permissions` is the probe because it is the only command that both
 * self-reports and runs offline with no AWS call.
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

function commandEvents(args: string[]): string[] {
  const home = mkdtempSync(join(tmpdir(), "wraps-one-event-"));
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
        WRAPS_TELEMETRY_DEBUG: "1",
        NO_COLOR: "1",
      },
    }
  );

  const stdout = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const events = [...stdout.matchAll(/"event": "([^"]*)"/g)].map((m) => m[1]);
  return events.filter((e) => e.startsWith("command:"));
}

describe("one invocation, one command event", () => {
  it("emits exactly one command event for a successful run", () => {
    const events = commandEvents(["permissions"]);

    // Guards the capture: no events at all means the debug flag or the spawn
    // stopped working and the assertion below would pass vacuously.
    expect(events.length, "no command events captured").toBeGreaterThan(0);
    expect(events).toEqual(["command:permissions"]);
  });

  it("emits exactly one command event for a rejected command", () => {
    // Throws from cli.ts's switch before any handler runs, so the routing-layer
    // fallback is the only thing that may report it.
    const events = commandEvents(["email", "domains"]);

    expect(events.length, "no command events captured").toBeGreaterThan(0);
    expect(events).toEqual(["command:email:domains"]);
  });
});
