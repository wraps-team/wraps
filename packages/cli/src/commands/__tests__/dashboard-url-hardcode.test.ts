import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const COMMANDS_DIR = join(import.meta.dirname, "..");

/**
 * Commands that may legitimately name the hosted platform.
 *
 * `wraps platform connect` exists to connect an account TO app.wraps.dev, so
 * printing that URL is the whole point. `platform disconnect` is the same
 * case inverted: it names the plane being switched off, and resolving that
 * through resolveDashboardUrl would tell a self-hosted customer their events
 * stop reaching their OWN dashboard — the one this command deliberately keeps
 * connected. Everywhere else, the dashboard a customer should be sent to is
 * whatever their account actually reports to — see resolveDashboardUrl.
 */
const ALLOWED = ["platform/connect.ts", "platform/disconnect.ts"];

function sourceFiles(dir: string, prefix = ""): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    const rel = prefix ? `${prefix}/${entry}` : entry;
    if (statSync(full).isDirectory()) {
      return entry === "__tests__" ? [] : sourceFiles(full, rel);
    }
    return entry.endsWith(".ts") && !entry.endsWith(".test.ts") ? [rel] : [];
  });
}

/** Line comments explain the hazard; only emitted strings can mislead a user. */
function isComment(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("//") || trimmed.startsWith("*");
}

describe("hardcoded dashboard URLs in command output", () => {
  const offenders = sourceFiles(COMMANDS_DIR).flatMap((rel) => {
    if (ALLOWED.includes(rel)) {
      return [];
    }
    return readFileSync(join(COMMANDS_DIR, rel), "utf-8")
      .split("\n")
      .map((line, index) => ({ line, number: index + 1 }))
      .filter(({ line }) => line.includes("app.wraps.dev") && !isComment(line))
      .map(({ number }) => `${rel}:${number}`);
  });

  it("sends every account to its own dashboard, not ours", () => {
    // A self-hosted customer pays precisely so their sends never reach us;
    // printing app.wraps.dev hands them a dashboard holding none of their data.
    // Commit 680a2ae4 fixed five email commands and missed `wraps status`, so
    // this guards the class rather than the instance. Route new output through
    // resolveDashboardUrl(accountId, region), or add a documented exception.
    expect(offenders).toEqual([]);
  });

  it("scans a meaningful number of command files", () => {
    // Guards the traversal above, not the commands.
    expect(sourceFiles(COMMANDS_DIR).length).toBeGreaterThan(20);
  });
});
