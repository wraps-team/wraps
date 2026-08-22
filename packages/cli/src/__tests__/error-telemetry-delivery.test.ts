import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Verified on the shipped 3.3.0 binary with a capture server at
 * WRAPS_TELEMETRY_URL: `wraps telemetry status` POSTed its event and
 * `wraps email verify` (exit 1) POSTed nothing at all. `trackError` only
 * queues and schedules a flush 100ms out; `TelemetryClient.shutdown()` is the
 * only awaited drain; and `handleCLIError`'s `process.exit(1)` jumped over
 * every one of them. So no error event has ever been delivered.
 *
 * cli.ts parses real `process.argv` and calls `run()` at module load, so it
 * cannot be imported and driven as a function — this is a source-text guard.
 *
 * It deliberately does NOT prove an event reaches the server; it proves only
 * that neither handleCLIError call site exits without a drain in front of it,
 * that the command path still forces an exit after that drain, and that
 * handleCLIError itself no longer calls process.exit. Delivery itself is
 * covered by packages/cli/src/telemetry/__tests__/client.test.ts.
 */

const SRC_DIR = join(import.meta.dirname, "..");
const CLI_PATH = join(SRC_DIR, "cli.ts");
const ERRORS_PATH = join(SRC_DIR, "utils/shared/errors.ts");

// Collapse whitespace so a reformat — different wrapping or indentation —
// cannot fail this.
const collapsed = readFileSync(CLI_PATH, "utf-8").replace(/\s+/g, " ");

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

// The interactive `.catch` handler's call site. Anchored on structure, not on
// the parameter's name: renaming `err` to `error` is a pure rename with no
// behavioural effect, and must not fail a telemetry-drain guard. The two-arg
// run() site (`handleCLIError(error, commandName)`) cannot match — this
// requires the closing paren straight after a single identifier.
const INTERACTIVE_CALL_SITE = /handleCLIError\(\s*\w+\s*\);/;

function findInteractiveCallSite(source: string): number {
  return source.search(INTERACTIVE_CALL_SITE);
}

// A band, not an exact count, matching every other count in this change set.
// Five today, one per error-rendering path in handleCLIError. Fewer means a
// path stopped setting the code and a failed command can exit 0 — the defect
// this guard exists for. More is legitimate: a new error type with its own
// render adds a sixth. Past twelve, handleCLIError has grown a dispatch layer
// this guard has not been read against.
const MIN_EXIT_CODE_ASSIGNMENTS = 5;
const MAX_EXIT_CODE_ASSIGNMENTS = 12;

function countExitCodeAssignments(body: string): number {
  return countOccurrences(body, "process.exitCode = 1;");
}

function exitCodeAssignmentsAreInBand(body: string): boolean {
  const assignments = countExitCodeAssignments(body);
  return (
    assignments >= MIN_EXIT_CODE_ASSIGNMENTS &&
    assignments <= MAX_EXIT_CODE_ASSIGNMENTS
  );
}

describe("error-path telemetry is drained before the process exits", () => {
  it.each([CLI_PATH, ERRORS_PATH])(
    "scans %s (a rename must not silence the scan)",
    (path) => {
      expect(existsSync(path)).toBe(true);
    }
  );

  it("finds handleCLIError call sites (guards the extraction itself)", () => {
    // A band, not a floor: two call sites today (`cli.ts:567` interactive,
    // `cli.ts:1739` command path). The import line does NOT match this needle
    // — no `(` follows the identifier there. Fewer means the search string
    // stopped matching and everything below is vacuous; more means a third
    // site appeared that this guard has not been taught about.
    const sites = countOccurrences(collapsed, "handleCLIError(");
    expect(sites).toBeGreaterThanOrEqual(2);
    expect(sites).toBeLessThanOrEqual(3);
  });

  it("keeps run()'s shutdown in a finally and forces the exit after it", () => {
    // Anchored on run()'s own call site, not on any `finally`: interactiveMenu's
    // finally at cli.ts:558-560 collapses to `} finally { await
    // telemetry.shutdown(); }` as well, so a bare file-wide toContain would
    // stay green even after run()'s finally was deleted outright.
    const start = collapsed.indexOf("handleCLIError(error, commandName);");
    expect(start).toBeGreaterThan(-1);
    const tail = collapsed.slice(start, start + 600);
    expect(tail).toContain("} finally {");
    expect(tail).toContain("await telemetry.shutdown();");
    // handleCLIError only sets process.exitCode now, so run() must force the
    // exit once the drain is done — otherwise a command that threw with a live
    // clack spinner keeps the event loop alive and the CLI hangs instead of
    // failing.
    expect(tail).toContain("process.exit(process.exitCode");
    // Presence is not enough: swapping the two statements keeps every
    // assertion above green while reinstating the exact defect this guard
    // exists to catch — the process exits with the error event still queued.
    expect(tail.indexOf("await telemetry.shutdown();")).toBeLessThan(
      tail.indexOf("process.exit(process.exitCode")
    );
  });

  it("drains again on the interactive path, which already shut down before the rejection arrived", () => {
    // Anchored on the interactive call site, like the run() test above: a
    // file-wide toContain cannot tell this drain apart from the same call
    // sitting in an unrelated function, in dead code, or after the
    // process.exit that follows it — each of which loses the event.
    const start = findInteractiveCallSite(collapsed);
    expect(start).toBeGreaterThan(-1);
    const tail = collapsed.slice(start, start + 700);
    expect(tail).toContain("await getTelemetryClient().shutdown();");
    expect(tail.indexOf("await getTelemetryClient().shutdown();")).toBeLessThan(
      tail.indexOf("process.exit(1);")
    );
  });

  it("no longer lets handleCLIError terminate the process itself", () => {
    const errorsSource = readFileSync(ERRORS_PATH, "utf-8");
    // Guards the extraction: if handleCLIError vanished or was renamed, the
    // slice below is empty and the assertions are vacuous.
    const start = errorsSource.indexOf("export function handleCLIError(");
    expect(start).toBeGreaterThan(-1);
    const end = errorsSource.indexOf("\n}\n", start);
    expect(end).toBeGreaterThan(start);
    const body = errorsSource.slice(start, end);

    expect(body).not.toContain("process.exit(");
    // The count itself, not a boolean: collapsing it to
    // `expect(inBand(body)).toBe(true)` reports only `expected false to be
    // true`, naming neither the count nor the band it missed.
    const assignments = countExitCodeAssignments(body);
    expect(
      assignments,
      `handleCLIError sets process.exitCode ${assignments} time(s); expected ${MIN_EXIT_CODE_ASSIGNMENTS}-${MAX_EXIT_CODE_ASSIGNMENTS}`
    ).toBeGreaterThanOrEqual(MIN_EXIT_CODE_ASSIGNMENTS);
    expect(assignments).toBeLessThanOrEqual(MAX_EXIT_CODE_ASSIGNMENTS);
  });

  // The block below is the regression guard for a defect in the guards
  // themselves: they used to pin verbatim local identifiers and an exact
  // statement count, so a pure refactor of cli.ts or errors.ts — one that
  // changed no behaviour at all — failed a telemetry test and pointed the
  // developer at telemetry code that nobody had touched.
  describe("the source anchors survive pure refactors", () => {
    // Fixtures the test owns, NOT a mutation of the real cli.ts. Mutating the
    // real source only works while the source still says `err`: the moment
    // somebody performs the very rename this guard licenses, the `replace`
    // silently becomes a no-op and the assertion fails on unmutated text —
    // reinstating the defect inside the test written to prevent it.
    it.each(["err", "error", "e", "caught"])(
      "finds the interactive call site whatever the catch parameter is named (%s)",
      (name) => {
        const fixture = `} .catch(async (${name}) => { handleCLIError(${name}); await getTelemetryClient().shutdown(); process.exit(1); });`;
        expect(findInteractiveCallSite(fixture)).toBeGreaterThan(-1);
      }
    );

    it("still rejects a call site that is not a single-argument call", () => {
      // run()'s two-argument site must never satisfy the interactive locator,
      // whatever cli.ts currently says.
      const fixture =
        "handleCLIError(error, commandName); await telemetry.shutdown();";
      expect(findInteractiveCallSite(fixture)).toBe(-1);
    });

    it("accepts a sixth error branch with its own exit code", () => {
      const errorsSource = readFileSync(ERRORS_PATH, "utf-8");
      const start = errorsSource.indexOf("export function handleCLIError(");
      const end = errorsSource.indexOf("\n}\n", start);
      const body = errorsSource.slice(start, end);
      const grown = `${body}\n  process.exitCode = 1;`;
      expect(exitCodeAssignmentsAreInBand(grown)).toBe(true);
      expect(exitCodeAssignmentsAreInBand("")).toBe(false);
    });

    // Literal counts, deliberately not the MIN/MAX constants: a test written
    // in terms of the constants moves with them, so widening the band to
    // `>= 1` stays green and a handleCLIError that lost one of its five
    // exit-code assignments sails through — a failed Pulumi deploy printing
    // its error and exiting 0. These four cases pin the band itself.
    it.each([
      [4, false],
      [5, true],
      [12, true],
      [13, false],
    ])("holds the band at 5-12: %i assignments -> %s", (count, expected) => {
      expect(
        exitCodeAssignmentsAreInBand("process.exitCode = 1;".repeat(count))
      ).toBe(expected);
    });
  });
});
