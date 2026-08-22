import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { telemetryCommandName } from "../telemetry/command-name.js";

/**
 * Telemetry event names must never carry raw argv.
 *
 * `commandName` in cli.ts is `${sub[0]}:${sub[1]}` straight off the positional
 * list. On the unknown-command path `sub[1]` is whatever the user typed next,
 * which for this CLI is routinely a domain or an email address — and that name
 * becomes the event name (`command:<name>`) plus the `command` property of
 * `error:occurred`. `trackCommand`'s PII scrub only blanks metadata fields, so
 * neither is touched. Before this feature those two events were queued and then
 * killed by `handleCLIError`'s `process.exit(1)`; the drain-before-exit added
 * here ships them, against a first-run notice that promises domains are never
 * collected.
 *
 * These are subprocess tests on purpose. cli.ts reads real `process.argv` and
 * runs at module load, so it cannot be imported and driven as a function — but
 * `WRAPS_TELEMETRY_DEBUG=1` makes `TelemetryClient.track` print the exact event
 * it would send and return before the network, so a spawned CLI reports its
 * telemetry payload with no socket and no dependence on whether telemetry is
 * enabled on this machine. HOME is redirected at a temp dir so the run cannot
 * read or create the developer's real telemetry config.
 */

const PKG_ROOT = join(import.meta.dirname, "../..");

function resolveTsx(): string {
  const candidates = [
    join(PKG_ROOT, "node_modules/.bin/tsx"),
    join(PKG_ROOT, "../../node_modules/.bin/tsx"),
  ];
  const found = candidates.find((c) => existsSync(c));
  if (!found) {
    throw new Error(`tsx not found; looked in:\n  ${candidates.join("\n  ")}`);
  }
  return found;
}

const homes: string[] = [];

type TelemetryCapture = {
  /** `event` values, e.g. "command:email:init", "error:occurred". */
  events: string[];
  /** `command` property values from `error:occurred`. */
  commands: string[];
  stdout: string;
};

function runCli(args: string[]): TelemetryCapture {
  const home = mkdtempSync(join(tmpdir(), "wraps-telemetry-home-"));
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
  const commands = [...stdout.matchAll(/"command": "([^"]*)"/g)].map(
    (m) => m[1]
  );
  return { events, commands, stdout };
}

afterAll(() => {
  for (const home of homes) {
    rmSync(home, { recursive: true, force: true });
  }
});

describe("telemetry identity never echoes raw argv", () => {
  it("does not put a mistyped command's domain in the event name", () => {
    // `wraps email check acme-corp.com` with the service word dropped — the
    // shape the CLI's own help invites (`email check`).
    const { events, commands, stdout } = runCli(["check", "acme-corp.com"]);

    // Guards the capture itself: no events means the regex, the debug flag or
    // the spawn stopped working and every assertion below is vacuous.
    expect(
      events.length,
      `no telemetry events captured in:\n${stdout}`
    ).toBeGreaterThan(0);
    expect(events).toContain("error:occurred");

    for (const event of events) {
      expect(event).not.toContain("acme-corp.com");
    }
    for (const command of commands) {
      expect(command).not.toContain("acme-corp.com");
    }
  }, 30_000);

  it("does not put a mistyped command's email address in the event name", () => {
    const { events, commands, stdout } = runCli([
      "send",
      "alice@acme-corp.com",
    ]);

    expect(
      events.length,
      `no telemetry events captured in:\n${stdout}`
    ).toBeGreaterThan(0);
    expect(events).toContain("error:occurred");

    for (const event of events) {
      expect(event).not.toContain("alice@");
      expect(event).not.toContain("acme-corp.com");
    }
    for (const command of commands) {
      expect(command).not.toContain("alice@");
      expect(command).not.toContain("acme-corp.com");
    }
  }, 30_000);

  it("still reports a real command pair verbatim", () => {
    // The scrub must not cost the dashboards their signal: a routed command
    // with a routed subcommand keeps the name it has always had.
    const { events, stdout } = runCli(["email", "agent"]);

    expect(
      events.length,
      `no telemetry events captured in:\n${stdout}`
    ).toBeGreaterThan(0);
    expect(events.some((e) => e.startsWith("command:email:agent"))).toBe(true);
  }, 30_000);
});

describe("telemetryCommandName", () => {
  it("keeps routed command pairs exactly as the dashboards know them", () => {
    expect(telemetryCommandName("email", "init")).toBe("email:init");
    expect(telemetryCommandName("email", "agent")).toBe("email:agent");
    expect(telemetryCommandName("aws", "verify-number")).toBe(
      "aws:verify-number"
    );
    expect(telemetryCommandName("status", undefined)).toBe("status");
  });

  it("drops an unrouted first positional instead of echoing it", () => {
    expect(telemetryCommandName("check", "acme-corp.com")).toBe("unknown");
    expect(telemetryCommandName("send", "alice@acme-corp.com")).toBe("unknown");
    expect(telemetryCommandName("acme-corp.com", undefined)).toBe("unknown");
    expect(telemetryCommandName(undefined, undefined)).toBe("unknown");
  });

  it("replaces a second positional that is not a command word", () => {
    // Routed service, user data where a subcommand belongs.
    expect(telemetryCommandName("email", "acme-corp.com")).toBe(
      "email:unknown"
    );
    expect(telemetryCommandName("email", "alice@acme-corp.com")).toBe(
      "email:unknown"
    );
    expect(telemetryCommandName("aws", "123456789012")).toBe("aws:unknown");
    expect(
      telemetryCommandName("email", "arn:aws:ses:us-east-1:1234:identity/x")
    ).toBe("email:unknown");
  });
});
