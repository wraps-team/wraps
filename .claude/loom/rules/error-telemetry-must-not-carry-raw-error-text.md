---
name: error-telemetry-must-not-carry-raw-error-text
severity: critical
origin: cli-honest-failures — Newly-delivered error telemetry ships raw error messages, including home-directory paths and credential material
applies-to: "packages/cli/src/**/*.ts"
---

## What

A `trackError(code, command, metadata)` call may not put free-form failure prose
in its metadata — no `message` / `detail` / `stack` / `stderr` field, and no
value expression that reads an error's own text (`error.message`,
`String(error)`, `sanitizeErrorMessage(...)`, `redactSensitiveValues(...)`, an
identifier named `errorMessage` or `msg`). Codes, enums, step names and
`errorType` only. The metadata must also be an inline object literal, so what
leaves the machine is readable at the call site.

## Why

`packages/cli/src/utils/shared/errors.ts:409` and `:521` (as of `85da2e88` —
both `UNHANDLED_ERROR` branches of `handleCLIError`) passed:

```ts
trackError("UNHANDLED_ERROR", cmdContext, {
  errorType: error instanceof Error ? error.constructor.name : typeof error,
  message: sanitizeErrorMessage(error),
});
```

`trackError` spreads its metadata straight into the `error:occurred` event
(`telemetry/events.ts:172`) and `TelemetryClient.track` spreads that straight
into the JSON body it POSTs to `https://wraps.dev/api/telemetry`. Nothing in
the chain blanks a field: `trackCommand` at least nulls `domain` / `accountId`
/ `email`, `trackError` nulls nothing. And `sanitizeErrorMessage` rewrites only
12-digit account IDs, email addresses, domain names and the account segment of
an ARN (`errors.ts:226-256`), so

    EACCES: permission denied, open '/Users/alice/Projects/northstar/x.tsx'

left the machine with the OS username and the customer's project name intact.
The partial redaction is what made it dangerous — the payload *looked*
sanitized.

The leak was also newly live. Until this feature `handleCLIError` called
`process.exit(1)` before the telemetry client's 100ms flush timer could fire,
so the event was dead-lettered; swapping to `process.exitCode` so `run()`'s
`finally { await telemetry.shutdown() }` drains the queue is what put it on the
wire. Fixed in `2e6cc6f2` by tracking `errorType` only — the message is still
printed to the user locally. `error-telemetry-payload.test.ts` pins the two
fixed branches; this rule covers every other call site.

The rule is deliberately wider than the one key that caused it. `message:` is
the obvious spelling, but `{ error: errorMessage }` and
`{ error_detail: redactSensitiveValues(msg) }` put the same bytes on the wire
under a different key — so the check reads the *value* expression, not only the
key name.

**Known debt, frozen in the check (2026-08-22).** Ten call sites already
shipped this class when the rule was written. Being pre-existing is not the
same as being dormant: what decides whether a site is *on the wire* is how its
branch ends. A branch that ends in its own `process.exit(1)` still kills the
flush timer, exactly as `handleCLIError` used to, so its event is dead-lettered
and this branch did not change it. A branch that ends in `throw` propagates to
`cli.ts` -> `handleCLIError` -> `process.exitCode`, and `run()`'s
`finally { await telemetry.shutdown() }` delivers it — which is what this
branch changed. Do not read the freeze list as one uniform class.

**Delivered — burned down in this feature (2026-08-22), not frozen.** Three
sites ended their branch with `throw`, so this branch put them on the wire with
the same bytes it removed from `errors.ts`. They are fixed, not budgeted, and
the check now carries no budget for them:

| Site | Field, before | Now |
|---|---|---|
| `commands/platform/connect.ts:968,1333` | `message: sanitizeErrorMessage(error)` — the exact shape fixed in errors.ts; both catches end `throw error;` | `{ step: "authenticated" }` / `{ step: "unauthenticated" }` |
| `commands/email/upgrade.ts:2142` | `error_detail: redactSensitiveValues(msg).slice(0, 3000)` — up to 3KB of Pulumi output, home paths and all; the catch ends `throw new Error(...)` with no outer catch in `upgrade()` | `{ step: "deploy" }` |

`platform-connect-error-telemetry.test.ts` and
`email-upgrade-error-telemetry.test.ts` drive all three branches through the
real `events.ts -> client.ts` chain and assert the serialized body.

**Dead-lettered — frozen in the check.** The remaining seven sites end their
branch with a local `process.exit(1)` inside the command itself, so no drain
runs and nothing is transmitted. They are still the same latent leak — one
refactor from `exit` to `throw` publishes them — and the check carries them in
a `KNOWN_DEBT` map at their exact current counts so it can run green while they
are burned down:

| Site | Field |
|---|---|
| `commands/email/test.ts:376` | `error: errorMessage` — raw, unredacted |
| `commands/sms/test.ts:248` | `error: errorMessage` |
| `commands/sms/verify-number.ts:114,180,292,357,496` | `error: errorMessage` |

That map may only shrink. Adding to it is not a fix — it is the same leak with
a note attached, and for a `throw`-terminated branch it is not even dormant.
`utils/shared/errors.ts`, `commands/platform/connect.ts` and
`commands/email/upgrade.ts` carry no budget, so the site the finding came from
and the three delivered sites are all guarded with zero slack.

## Check

```bash
# Receives candidate file paths as "$@". Exit 0 = clean, non-zero = violated.
node -e '
const fs = require("node:fs");

// Quote characters as codes: this script is embedded in a single-quoted shell
// argument, so it must contain no literal apostrophe.
const DQ = String.fromCharCode(34);
const SQ = String.fromCharCode(39);
const BQ = String.fromCharCode(96);

// Keys whose value is, by name, free-form failure prose rather than a code.
const HAZARD_KEY =
  /^(message|msg|errorMessage|error_message|errorDetail|error_detail|detail|details|stack|stderr|stdout|output|reason|raw|body|text)$/i;
// Value expressions that read the error prose itself, however it is laundered.
const HAZARD_VALUE =
  /\.message\b|\bString\s*\(\s*(?:error|err|e)\b|\bsanitizeErrorMessage\s*\(|\bredactSensitiveValues\s*\(|\bextractPulumiErrorSummary\s*\(|\b[\w$]*(?:[Mm]essage|Msg|msg|stderr|stdout)\b/;

// Sites that already shipped this leak when the rule was written (2026-08-22)
// AND are dead-lettered behind a local process.exit(1), so nothing is
// transmitted today. Frozen at their current count so the rule runs green
// while they are burned down. This map may only shrink. A new hazard in a
// listed file, or any hazard in a file not listed, fails.
//
// platform/connect.ts and email/upgrade.ts were on this list and are NOT any
// more: their branches end in `throw`, so they were delivered, and they were
// fixed rather than frozen. Do not re-add them.
const KNOWN_DEBT = {
  "packages/cli/src/commands/email/test.ts": { error: 1 },
  "packages/cli/src/commands/sms/test.ts": { error: 1 },
  "packages/cli/src/commands/sms/verify-number.ts": { error: 5 },
};

function stripComments(source) {
  let out = "";
  let i = 0;
  let state = "code";
  let quote = "";
  while (i < source.length) {
    const c = source[i];
    const n = source[i + 1];
    if (state === "code") {
      if (c === "/" && n === "/") { state = "line"; out += "  "; i += 2; continue; }
      if (c === "/" && n === "*") { state = "block"; out += "  "; i += 2; continue; }
      if (c === DQ || c === SQ || c === BQ) { state = "string"; quote = c; }
      out += c; i += 1; continue;
    }
    if (state === "string") {
      if (c === "\\") { out += source.slice(i, i + 2); i += 2; continue; }
      if (c === quote) state = "code";
      out += c; i += 1; continue;
    }
    if (state === "line") {
      if (c === "\n") { state = "code"; out += c; i += 1; continue; }
      out += " "; i += 1; continue;
    }
    if (c === "*" && n === "/") { state = "code"; out += "  "; i += 2; continue; }
    out += c === "\n" ? c : " "; i += 1;
  }
  return out;
}

function splitTop(body) {
  const parts = [];
  let cur = "", depth = 0, quote = "";
  for (let i = 0; i < body.length; i += 1) {
    const c = body[i];
    if (quote) {
      if (c === "\\") { cur += body.slice(i, i + 2); i += 1; continue; }
      if (c === quote) quote = "";
      cur += c; continue;
    }
    if (c === DQ || c === SQ || c === BQ) { quote = c; cur += c; continue; }
    if (c === "(" || c === "[" || c === "{") depth += 1;
    if (c === ")" || c === "]" || c === "}") depth -= 1;
    if (c === "," && depth === 0) { parts.push(cur); cur = ""; continue; }
    cur += c;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

// [{ key, value }] for an object literal (nested objects included); null otherwise.
function entries(text) {
  const t = text.trim();
  if (!(t.startsWith("{") && t.endsWith("}"))) return null;
  const out = [];
  for (const part of splitTop(t.slice(1, -1))) {
    const seg = part.trim();
    if (!seg) continue;
    let depth = 0, quote = "", colon = -1;
    for (let i = 0; i < seg.length; i += 1) {
      const c = seg[i];
      if (quote) { if (c === "\\") { i += 1; continue; } if (c === quote) quote = ""; continue; }
      if (c === DQ || c === SQ || c === BQ) { quote = c; continue; }
      if (c === "(" || c === "[" || c === "{") depth += 1;
      else if (c === ")" || c === "]" || c === "}") depth -= 1;
      else if (c === ":" && depth === 0) { colon = i; break; }
    }
    if (colon === -1) { out.push({ key: seg, value: seg }); continue; }
    const key = seg.slice(0, colon).trim().replace(/^["\\x27\\x60]|["\\x27\\x60]$/g, "");
    const value = seg.slice(colon + 1).trim();
    out.push({ key, value });
    const nested = entries(value);
    if (nested) out.push(...nested);
  }
  return out;
}

// Drops plain string literals so `step: "MessageRejected"` is not read as prose.
// Template literals survive: `${error.message}` is exactly the hazard.
function withoutPlainStrings(text) {
  return text.replace(/"(?:\\.|[^"\\])*"|\\x27(?:\\.|[^\\x27\\\\])*\\x27/g, DQ + DQ);
}

function callsTo(code, fnName) {
  const found = [];
  const pattern = new RegExp("\\b" + fnName + "\\s*\\(", "g");
  let m;
  while ((m = pattern.exec(code))) {
    let i = pattern.lastIndex, depth = 1, quote = "", body = "";
    while (i < code.length) {
      const c = code[i];
      if (quote) {
        if (c === "\\") { body += code.slice(i, i + 2); i += 2; continue; }
        if (c === quote) quote = "";
      } else if (c === DQ || c === SQ || c === BQ) quote = c;
      else if (c === "(" || c === "[" || c === "{") depth += 1;
      else if (c === ")" || c === "]" || c === "}") { depth -= 1; if (depth === 0) break; }
      body += c; i += 1;
    }
    // Skip the declaration itself (export function trackError().
    const before = code.slice(Math.max(0, m.index - 24), m.index);
    if (!/\b(?:function|const|let|var)\s+$/.test(before)) {
      found.push({ args: splitTop(body).map((a) => a.trim()), index: m.index });
    }
    pattern.lastIndex = i;
  }
  return found;
}

let bad = false;
for (const arg of process.argv.slice(1)) {
  const file = arg.replace(/^\.\//, "");
  if (!/\.tsx?$/.test(file)) continue;
  let source;
  try { source = fs.readFileSync(file, "utf8"); } catch { continue; }
  if (!source.includes("trackError")) continue;

  const code = stripComments(source);
  const hits = [];
  for (const call of callsTo(code, "trackError")) {
    const meta = call.args[2];
    if (!meta) continue;
    const line = code.slice(0, call.index).split("\n").length;
    const props = entries(meta);
    if (props === null) {
      console.log(
        file + ":" + line + ": trackError metadata is not an object literal (" +
        meta.replace(/\s+/g, " ").slice(0, 60) +
        ") - inline the fields so what goes on the wire is readable here"
      );
      bad = true;
      continue;
    }
    for (const { key, value } of props) {
      if (!(HAZARD_KEY.test(key) || HAZARD_VALUE.test(withoutPlainStrings(value)))) continue;
      hits.push({ line, key, value: value.replace(/\s+/g, " ").slice(0, 60) });
    }
  }

  const budget = { ...(KNOWN_DEBT[file] || {}) };
  for (const hit of hits) {
    if (budget[hit.key] > 0) { budget[hit.key] -= 1; continue; }
    bad = true;
    console.log(
      file + ":" + hit.line + ": trackError metadata field `" + hit.key +
      "` carries free-form error text (" + hit.value +
      ") - error:occurred is POSTed verbatim, so this ships home-directory paths, project names and credential material"
    );
  }
}
process.exit(bad ? 1 : 0);
' -- "$@"
```

## Fix

Track the error's *type*, never its text — the message is still printed to the
user locally, and `errorType` is enough to bucket unhandled failures:

```ts
trackError("UNHANDLED_ERROR", cmdContext, { errorType: error instanceof Error ? error.constructor.name : typeof error });
```
