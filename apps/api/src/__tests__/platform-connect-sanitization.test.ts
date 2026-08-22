/**
 * Platform Connect — Telemetry Error Payloads
 *
 * `trackError` spreads its metadata straight into the `error:occurred` body
 * POSTed to the telemetry endpoint, so anything an error's own text carries
 * (absolute home paths, OS usernames, account IDs, ARNs) would leave the
 * machine. `platform connect` therefore reports the error *code* and the step
 * only — it sends no error text at all, which is strictly stronger than
 * redacting it, because the redactor leaves home paths and usernames intact.
 *
 * This scan pins that: no `trackError` call in connect.ts may pass raw error
 * text. If a message field is ever reintroduced it must at minimum be run
 * through `sanitizeErrorMessage` first.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** Payload shapes that would carry an error's own text off the machine. */
const RAW_ERROR_PATTERNS = [
  { label: "message field", pattern: /\bmessage\s*:/ },
  {
    label: "error_detail field",
    pattern: /\berror_(?:detail|message|text)\s*:/,
  },
  { label: "String(error)", pattern: /String\(\s*[\w$]*[eE]rr[\w$]*\s*\)/ },
  { label: "error.message", pattern: /[\w$]*[eE]rror[\w$]*\s*\.\s*message\b/ },
  { label: "template-interpolated error", pattern: /\$\{[^}]*[eE]rror[^}]*\}/ },
];

/**
 * Extract whole `trackError(...)` calls, paren-balanced so a nested call such
 * as `String(error)` cannot truncate the match at its inner `)`.
 */
function extractTrackErrorCalls(source: string): string[] {
  const calls: string[] = [];
  const needle = "trackError(";

  let searchFrom = 0;
  let start = source.indexOf(needle, searchFrom);

  while (start !== -1) {
    let depth = 0;
    let end = -1;

    for (let i = start + needle.length - 1; i < source.length; i++) {
      const char = source[i];
      if (char === "(") {
        depth++;
      } else if (char === ")") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }

    if (end === -1) {
      break;
    }

    calls.push(source.slice(start, end + 1));
    searchFrom = end + 1;
    start = source.indexOf(needle, searchFrom);
  }

  return calls;
}

describe("Platform connect — telemetry error payloads", () => {
  it("sends no raw error text to trackError", () => {
    const source = readFileSync(
      resolve(
        __dirname,
        "../../../..",
        "packages/cli/src/commands/platform/connect.ts"
      ),
      "utf-8"
    );

    const trackErrorCalls = extractTrackErrorCalls(source);

    // Guard: a rename of `trackError` must not silently empty the scan.
    expect(trackErrorCalls.length).toBeGreaterThan(0);

    // No call may carry error text — unless it is sanitized first.
    const offenders = trackErrorCalls.flatMap((call) => {
      if (call.includes("sanitize")) {
        return [];
      }
      return RAW_ERROR_PATTERNS.filter(({ pattern }) => pattern.test(call)).map(
        ({ label }) => `${label} in: ${call}`
      );
    });

    expect(
      offenders,
      `trackError in platform/connect.ts must send code + step only, never error text:\n${offenders.join("\n")}`
    ).toEqual([]);

    // Both doors closed: if a message field is ever reintroduced despite the
    // rule above, it must still go through sanitizeErrorMessage.
    for (const call of trackErrorCalls) {
      if (/\bmessage\s*:/.test(call)) {
        expect(call).toContain("sanitize");
      }
    }
  });
});
