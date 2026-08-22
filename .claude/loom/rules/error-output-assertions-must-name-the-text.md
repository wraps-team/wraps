---
name: error-output-assertions-must-name-the-text
severity: serious
origin: cli-honest-failures — The generic-tail error message render is guarded only by a bare toHaveBeenCalled()
applies-to: "packages/cli/**/*.{test,spec}.{ts,tsx}"
---

## What

A CLI test may not assert an error or warning sink with a bare
`expect(spy).toHaveBeenCalled()`. If the spy is an error/warning output channel
— `console.error`, `clack.log.error`, `prompts.log.warn`, a `consoleErrorSpy` /
`warnSpy` / `logError` around one — the assertion has to name the text, with
`toHaveBeenCalledWith(...)` or `expect.stringContaining(...)`.

`not.toHaveBeenCalled()` is untouched: an absence is a real assertion.

## Why

`packages/cli/src/utils/__tests__/errors.test.ts:112` (as of `85da2e88`) was the
only test covering the generic tail of `handleCLIError` — the branch every
unrecognised error falls through to — and it asserted the render like this:

```ts
expect(consoleErrorSpy).toHaveBeenCalled();
expect(consoleLogSpy).toHaveBeenCalled();
```

That branch prints the message and then a blank spacer line through the *same*
`console.error`, so `toHaveBeenCalled()` was already satisfied before the
message was rendered at all. Deleting the message line, or rendering
`undefined`, left the test green.

What made it load-bearing rather than merely weak is what this feature changed
around it. `handleCLIError` used to ship the failure text to telemetry as well;
this branch cut that back to `errorType` alone (see
`error-telemetry-must-not-carry-raw-error-text`). After that, the printed line
is the **only surviving copy of what went wrong** — the clack line above it is
the fixed string "An unexpected error occurred", and the issue-tracker URL below
it is a constant. A user pasting a CLI failure into a bug report, and the
maintainer reading it, both depend entirely on a line no test read. Fixed by
naming the text:

```ts
expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Unknown error"));
```

(`stringContaining`, not `toBe`: `pc.dim` is identity under `NO_COLOR` but wraps
the message in ANSI under `FORCE_COLOR`.)

Scoped to `packages/cli` on purpose. Elsewhere a printed error is usually a
secondary trace of a failure that also raised, returned or was logged
structurally; in the CLI, print *is* the delivery mechanism.

**Pre-existing sites — not frozen.** Fourteen assertions already carry this
shape. Rules run only against files a chunk touches, so they trip when their
file is next edited, which is intended rather than noise:
`utils/__tests__/scanner.test.ts` (9 — the `scanSES*` "handles API errors
gracefully" tests, which would pass on a scanner that printed an empty string),
`utils/__tests__/metadata.test.ts` (2), `utils/__tests__/errors.test.ts`
(220, 230), `commands/__tests__/platform-connect-selfhost.test.ts` (492 — the
warn text is the entire user-facing output of that branch).

The two in `errors.test.ts` are the interesting ones: their comment says
"proves this went through the human chain, not the JSON tail", which is a real
thing to assert — and `toHaveBeenCalledWith(expect.stringContaining("expired"))`
asserts it *and* the text. Reach for the opt-out only when the call genuinely
has no text worth pinning.

## Check

```bash
# Receives candidate file paths as "$@". Exit 0 = clean, non-zero = violated.
node -e '
const fs = require("node:fs");

const DQ = String.fromCharCode(34);
const SQ = String.fromCharCode(39);
const BQ = String.fromCharCode(96);
const QUOTES = DQ + SQ + BQ;

// Blank comments and string bodies, preserving length and newlines so line
// numbers stay accurate. A quoted or commented-out assertion is not one.
function blank(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  const keep = (c) => (c === "\n" ? "\n" : " ");
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "/") { while (i < n && src[i] !== "\n") { out += " "; i += 1; } continue; }
    if (c === "/" && d === "*") {
      out += "  "; i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { out += keep(src[i]); i += 1; }
      out += "  "; i += 2; continue;
    }
    if (QUOTES.includes(c)) {
      out += c; i += 1;
      while (i < n && src[i] !== c) {
        if (src[i] === "\\") { out += "  "; i += 2; continue; }
        out += keep(src[i]); i += 1;
      }
      out += i < n ? c : ""; i += 1; continue;
    }
    out += c; i += 1;
  }
  return out;
}

// `expect(<subject>).toHaveBeenCalled()` - positive only. `.not.` and
// `toHaveBeenCalledTimes` / `toHaveBeenCalledWith` do not match.
const BARE = /\bexpect\s*\(\s*([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)\s*\)\s*\.\s*toHaveBeenCalled\s*\(\s*\)/g;

// The subject is an error/warning sink: something whose call argument is the
// text a human reads.
function isErrorSink(subject) {
  const chain = subject.replace(/\s+/g, "");
  const last = chain.split(".").pop();
  if (/^(?:error|warn)/i.test(last)) return true;
  const flat = chain.replace(/\./g, "");
  return (
    /(?:console|clack|prompt|logger|log|toast|spinner|stderr|stdout)/i.test(flat) &&
    /(?:error|warn)/i.test(flat)
  );
}

let bad = false;
for (const arg of process.argv.slice(1)) {
  const file = arg.replace(/^\.\//, "");
  if (!/\.(?:test|spec)\.tsx?$/.test(file)) continue;
  let raw;
  try { raw = fs.readFileSync(file, "utf8"); } catch { continue; }
  if (!raw.includes("toHaveBeenCalled()")) continue;
  const src = blank(raw);
  const rawLines = raw.split("\n");
  let m;
  BARE.lastIndex = 0;
  while ((m = BARE.exec(src))) {
    if (!isErrorSink(m[1])) continue;
    const line = src.slice(0, m.index).split("\n").length;
    const window = rawLines.slice(Math.max(0, line - 4), line).join("\n");
    if (window.includes("vacuous-matcher-ok")) continue;
    bad = true;
    console.log(
      file + ":" + line + ": expect(" + m[1].replace(/\s+/g, "") +
      ").toHaveBeenCalled() asserts that something was printed, not what - the blank spacer line this same handler emits satisfies it"
    );
  }
}
process.exit(bad ? 1 : 0);

' -- "$@"
```

## Fix

Name the text — the substring that proves the right message reached the user:

```ts
expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Unknown error"));
```

When the call really has no text worth pinning, say so with a
`// vacuous-matcher-ok: <reason>` comment on or just above the line — the same
marker `numeric-assertions-must-pin-a-value` uses.
