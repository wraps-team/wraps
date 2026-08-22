import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `wraps email verify` (no --domain) printed a correct, specific message and
 * then contradicted it: "An unexpected error occurred", the same message
 * again, and an invitation to file a GitHub issue about the user's own typo —
 * because the branch threw a bare `Error`, which falls through
 * handleCLIError's generic tail and is reported as UNHANDLED_ERROR. All 23
 * rejection sites in cli.ts did this. `wraps doctr` was worse: the
 * "Did you mean wraps doctor?" line was immediately buried under the crash
 * block.
 *
 * This guards the class: a rejection in cli.ts is expressed as an error from
 * the `errors` registry, and the site does not also print the message itself.
 * The second half is not tidiness — an unguarded clack.log.error writes to
 * stdout ahead of the JSON envelope, so `--json` consumers were parsing human
 * text and an envelope out of one stream.
 *
 * cli.ts parses real `process.argv` and calls `run()` at module load, so it
 * cannot be imported and driven as a function; it is also excluded from
 * coverage in vitest.config.ts. A source-text scan is the only cover the 23
 * conversions get.
 *
 * It deliberately does NOT prove the message a site throws is a good one, and
 * it is scoped to cli.ts: 106 non-test `throw new Error(` sites exist across
 * packages/cli/src and most of them are genuine system errors, not user
 * input. Extracting a branch into commands/<x>/index.ts would evade this
 * scan — that is a known limit, not an oversight.
 */

const SRC_DIR = join(import.meta.dirname, "..");
const CLI_PATH = join(SRC_DIR, "cli.ts");
const cliSource = readFileSync(CLI_PATH, "utf-8");

const ANNOTATION = "cli-honest:allow-direct-error";

/** Line comments explain hazards; only emitted code can mislead a user. */
function isComment(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("//") || trimmed.startsWith("*");
}

/**
 * Exceptions are annotated at the call site rather than widened into an
 * allow-list, matching `baseline:allow-no-region` in
 * baseline/architecture.test.ts. The annotation is accepted on the offending
 * line or the line above it, because these calls wrap across lines.
 */
function annotated(lines: string[], index: number): boolean {
  return (
    lines[index]?.includes(ANNOTATION) === true ||
    lines[index - 1]?.includes(ANNOTATION) === true
  );
}

function offenders(source: string, needle: string): string[] {
  const lines = source.split("\n");
  return lines.flatMap((line, index) => {
    if (isComment(line) || annotated(lines, index)) {
      return [];
    }
    return line.includes(needle) ? [`cli.ts:${index + 1}`] : [];
  });
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("cli.ts rejects bad input through the errors registry", () => {
  it("scans cli.ts (a rename must not silence the scan)", () => {
    expect(existsSync(CLI_PATH)).toBe(true);
  });

  it("finds registry rejections to guard (guards the extraction itself)", () => {
    // A band, not a floor: 23 sites today. If this drops to 0 the search
    // string stopped matching and every assertion here is vacuous; if it
    // climbs past 40, cli.ts grew a dispatch layer this guard has not been
    // read against.
    const registryThrows = countOccurrences(cliSource, "throw errors.");
    expect(registryThrows).toBeGreaterThanOrEqual(18);
    expect(registryThrows).toBeLessThanOrEqual(40);
  });

  it("imports the registry alongside the handler", () => {
    expect(cliSource).toContain(
      'import { errors, handleCLIError } from "./utils/shared/errors.js";'
    );
  });

  // TRACER (TDD unit 9). The two file-wide totals below only go green once all
  // 23 sites are converted; this one goes green on the FIRST converted site, so
  // the chunk has a signal before the sweep instead of after it. Do not drop it.
  it("converts the unknown-command branch and stops it printing its own error", () => {
    const collapsed = cliSource.replace(/\s+/g, " ");
    const start = collapsed.indexOf("showHelp(); break; default: {");
    const end = collapsed.indexOf(
      'throw errors.unknownCommand("command", primaryCommand, hint);',
      start
    );
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(collapsed.slice(start, end)).not.toContain("clack.log.error(");
  });

  it("throws no bare Error, which would be reported as a crash", () => {
    const found = offenders(cliSource, "throw new Error(");
    expect(found, found.join("\n")).toEqual([]);
  });

  it("prints the rejection once, from the renderer, not also from the call site", () => {
    const found = offenders(cliSource, "clack.log.error(");
    expect(found, found.join("\n")).toEqual([]);
  });

  it("catches a bare throw fed through the same scan (negative control)", () => {
    const found = offenders(
      'const x = 1;\nthrow new Error("boom");\n',
      "throw new Error("
    );
    expect(found).toHaveLength(1);
  });

  it("lets an annotated call site through (negative control)", () => {
    const found = offenders(
      `// ${ANNOTATION} — fixture\nthrow new Error("boom");\n`,
      "throw new Error("
    );
    expect(found).toEqual([]);
  });
});
