---
name: numeric-assertions-must-pin-a-value
severity: serious
origin: doctor-self-healing — The aws.doctor envelope test asserts shape only — summary counts can be hardcoded zeros with the suite green; widened by — The `wraps doctor` JSON envelope's `findings` is asserted only as `expect.any(Array)`
applies-to: "**/*.{test,spec}.{ts,tsx}"
---

## What

A test may not assert a number or a boolean with `expect.any(Number)` /
`expect.any(Boolean)`, nor a named payload field with `expect.any(Array)`.
Those matchers check `typeof` (or `Array.isArray`), which strict TypeScript
already guarantees, so the assertion passes for a hardcoded `0`, `false`, or
`[]`.

## Why

`packages/cli/src/commands/__tests__/aws-doctor.test.ts:115` (as of `c5329dbb`)
was the only test covering the `aws.doctor` JSON envelope, and at :129-:131 it
asserted the summary like this:

```ts
expect((payload as JsonPayload).summary).toEqual({
  pass: expect.any(Number),
  warn: expect.any(Number),
  fail: expect.any(Number),
});
```

`summary` is the only part of that envelope a CI script branches on — a user's
pipeline reads `summary.fail > 0` and stops the deploy. Had `runDiagnostics`
returned `{ pass: 0, warn: 0, fail: 0 }` for an account with no CLI, no
credentials and an expired SSO token, every assertion in the file still passed:
the `checks` array was covered elsewhere, and the counts were covered by nothing.
A shape-only test on the one field that gates a deploy reports coverage that does
not exist.

Fixed in `439025de` by deriving the expected summary from the envelope's own
`checks` (`countByStatus()`) and adding a broken-account case that asserts
`summary.fail` is greater than zero.

The array half came from the same feature, one envelope over:
`packages/cli/src/commands/__tests__/wraps-doctor.test.ts:242` was the only test
covering the `wraps doctor` JSON envelope and asserted
`findings: expect.any(Array)`. `findings` is that envelope's only per-row field
and the one a script inventories infrastructure from. `Array.isArray` is true of
an empty array, so the whole email leg could drop out — or every row be filtered
away — with the test green, while `summary` (computed upstream of the payload)
kept reporting rows that never shipped. Fixed by asserting the rows themselves:
`expect(payload.findings.map((f) => \`${f.status}:${f.name}\`)).toEqual([...])`.

`expect.any(Array)` is flagged only where it is a **named property value**
(`findings: expect.any(Array)`) — a field of a payload object under `toEqual` /
`toHaveBeenCalledWith`, which is the position where it stands in for the thing
the test exists to check. A positional `expect.any(Array)` in a mock-call
argument list is left alone, for the same reason `expect.any(String)` is.

`expect.any(String)`, `expect.any(Date)` and friends are deliberately **not**
covered: they are widely used here as positional placeholders for mock-call
arguments the test is genuinely not about, and flagging those 30-odd sites would
bury this one. Numbers and booleans are different — they are almost always the
value the test exists to check.

Two sites already carry this defect and will trip the rule the next time they are
touched. That is intended, not noise:
`apps/web/src/actions/__tests__/members.test.ts:500` (`templateCount`,
`contactCount`, `verifiedDomains`, `hasAwsAccount`, `hasSentEmail` — the whole
point of that assertion is that the invite email was enriched with real
workspace data) and
`apps/web/src/app/(dashboard)/[orgSlug]/topics/components/__tests__/preference-center-settings-analytics.test.tsx:263`
(`failing_pairs`, the payload of an analytics event whose only field is a count).

## Check

```bash
# Receives candidate file paths as "$@". Exit 0 = clean, non-zero = violated.
node -e '
const fs = require("node:fs");

// Blank out comments and string/template bodies, preserving length and
// newlines so reported line numbers stay accurate. A commented-out or quoted
// `expect.any(Number)` is not an assertion.
function blank(src) {
  let out = "", i = 0;
  const n = src.length;
  const QUOTES = String.fromCharCode(34, 39, 96);
  const keep = (c) => (c === "\n" ? "\n" : " ");
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") { while (i < n && src[i] !== "\n") { out += " "; i++; } continue; }
    if (c === "/" && d === "*") {
      out += "  "; i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { out += keep(src[i]); i++; }
      out += "  "; i += 2; continue;
    }
    if (QUOTES.includes(c)) {
      out += c; i++;
      while (i < n && src[i] !== c) {
        if (src[i] === "\\") { out += "  "; i += 2; continue; }
        out += keep(src[i]); i++;
      }
      out += (i < n ? c : ""); i++; continue;
    }
    out += c; i++;
  }
  return out;
}

const BAD = /\bexpect\s*\.\s*any\s*\(\s*(Number|Boolean|Array)\s*\)/g;
// `key: expect.any(Array)` / `"key": expect.any(Array)` - a named field of a
// payload object, not a positional placeholder in a mock-call argument list.
const PROPERTY_KEY = /([\w$\]]|[\x22\x27\x60])\s*:\s*$/;
const WHY = {
  Number: "a hardcoded 0 passes it",
  Boolean: "a hardcoded false passes it",
  Array: "an empty or fully filtered array passes it",
};

let bad = false;
for (const file of process.argv.slice(1)) {
  if (!/\.(test|spec)\.tsx?$/.test(file)) continue;
  let raw;
  try { raw = fs.readFileSync(file, "utf8"); } catch { continue; }
  if (!/expect\s*\.\s*any/.test(raw)) continue;
  const src = blank(raw);
  const rawLines = raw.split("\n");
  let m;
  BAD.lastIndex = 0;
  while ((m = BAD.exec(src))) {
    const line = src.slice(0, m.index).split("\n").length;
    // An array matcher only counts where it stands in for a named field.
    if (m[1] === "Array" && !PROPERTY_KEY.test(src.slice(0, m.index))) continue;
    // Deliberate placeholders opt out with a nearby vacuous-matcher-ok comment.
    const window = rawLines.slice(Math.max(0, line - 4), line).join("\n");
    if (window.includes("vacuous-matcher-ok")) continue;
    bad = true;
    console.log(
      file + ":" + line + ": expect.any(" + m[1] +
      ") asserts only the type TypeScript already guarantees - " + WHY[m[1]]
    );
  }
}
process.exit(bad ? 1 : 0);
' -- "$@"
```

## Fix

Assert the value, deriving it from the same data the subject reports on so the
expectation cannot drift:

```ts
expect(payload.summary).toEqual(countByStatus(payload)); // + expect(payload.summary.fail).toBeGreaterThan(0)
```

For an array field, assert the rows it is supposed to carry:

```ts
expect(payload.findings.map((f) => `${f.status}:${f.name}`)).toEqual(["pass:AWS CLI installed", "fail:SQS queue wraps-email-events"]);
```

When the number really is incidental — a positional mock argument the test is not
about — say so with a `// vacuous-matcher-ok: <reason>` comment on or just above
the line.
