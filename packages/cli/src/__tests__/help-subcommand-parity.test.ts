import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every subcommand the dispatcher advertises in an "Available commands:" hint
 * must appear in `showHelp()`. The help list is hand-maintained and had drifted
 * by thirteen subcommands — `email reply`, `email logs` and the top-level
 * `wraps workflow` were absent entirely — which made shipped features
 * undiscoverable and contradicted the docs (plan 270). `telemetry` is excluded
 * on purpose: help summarises that group in one line.
 */

const SRC_DIR = join(import.meta.dirname, "..");
const cliSource = readFileSync(join(SRC_DIR, "cli.ts"), "utf-8");

const helpStart = cliSource.indexOf("function showHelp() {");
const helpBody =
  helpStart === -1
    ? ""
    : cliSource.slice(helpStart, cliSource.indexOf("\n}\n", helpStart));

// label -> dispatcher's `"<label> command"` name used in errors.unknownCommand
// prefix -> the command prefix shown in showHelp() lines for this group
// `telemetry` is deliberately excluded: help summarises that whole group in a
// single line ("Manage anonymous telemetry settings"), which is a reasonable
// call for a settings toggle, not a drift bug.
const GROUPS: { label: string; prefix: string }[] = [
  { label: "inbound", prefix: "email inbound" },
  { label: "agent", prefix: "email agent" },
  { label: "reply", prefix: "email reply" },
  { label: "domains", prefix: "email domains" },
  { label: "templates", prefix: "email templates" },
  { label: "workflows", prefix: "email workflows" },
  { label: "logs", prefix: "email logs" },
  { label: "workflow", prefix: "workflow" },
  { label: "platform", prefix: "platform" },
  { label: "auth", prefix: "auth" },
  { label: "aws", prefix: "aws" },
];

function extractSubcommands(label: string): string[] {
  const re = new RegExp(
    `errors\\.unknownCommand\\(\\s*"${label} command"\\s*,[\\s\\S]{0,200}?"Available commands:\\s*([^"\\\\]+)`
  );
  const match = cliSource.match(re);
  if (!match) {
    return [];
  }
  return match[1]
    .split(",")
    .map((entry) => entry.trim().split(/\s+/)[0])
    .filter(Boolean);
}

describe("help-subcommand-parity: extraction guard", () => {
  it("locates a non-empty showHelp() body (guards the extraction itself)", () => {
    expect(helpStart).toBeGreaterThan(-1);
    expect(helpBody).not.toBe("");
  });

  it.each(GROUPS)(
    "extracts a non-empty subcommand list for $label",
    ({ label }) => {
      expect(extractSubcommands(label).length).toBeGreaterThan(0);
    }
  );
});

describe("wraps --help lists every subcommand the dispatcher accepts", () => {
  it.each(GROUPS)(
    "$label: every dispatcher subcommand appears under '$prefix' in showHelp()",
    ({ label, prefix }) => {
      const subcommands = extractSubcommands(label);
      for (const subcommand of subcommands) {
        expect(helpBody).toContain(`${prefix} ${subcommand}`);
      }
    }
  );
});
