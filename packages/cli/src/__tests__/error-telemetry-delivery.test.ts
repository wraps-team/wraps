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
  });

  it("drains again on the interactive path, which already shut down before the rejection arrived", () => {
    expect(collapsed).toContain("await getTelemetryClient().shutdown();");
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
    expect(countOccurrences(body, "process.exitCode = 1;")).toBe(5);
  });
});
