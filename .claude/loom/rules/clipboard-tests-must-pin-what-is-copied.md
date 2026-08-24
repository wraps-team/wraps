---
name: clipboard-tests-must-pin-what-is-copied
severity: serious
origin: cli-first-deploy-step — No test asserts what the copy buttons actually put on the clipboard
applies-to: "**/*.{test,spec}.{ts,tsx}"
---

## What

A test that stubs `navigator.clipboard.writeText` has to assert, at least once,
**what** was written — `expect(mockWriteText).toHaveBeenCalledWith(...)`, or a
read of `mockWriteText.mock.calls`. Counting copies, asserting a "Copied" badge,
or asserting the rendered markup is not enough.

Bare `expect(mockWriteText).toHaveBeenCalled()` inside a `waitFor` settle gate
is fine, as long as some assertion in the file names the payload.

## Why

`apps/web/src/app/(onboarding)/[orgSlug]/onboarding/components/__tests__/cli-deploy-connect-step.test.tsx`
(as of `436e5db3^`) had sixteen units over the Deploy & Connect step and not one
of them read the clipboard argument. Unit 6 counted
`onboarding_cli_command_copied` captures without reading the `command` they
carried, unit 8 used a bare `toHaveBeenCalled()`, and unit 16 checked only the
rendered markup.

The clipboard is the one artifact the user actually pastes into a terminal, and
the component swaps its contents on the `selfHosted` gate. Rewiring the handler
to `handleCopy(CLI_STEPS[index].command, index)` — dropping the self-hosted swap
in `cliSteps` — passed all sixteen tests. A self-hosted user would then read
`wraps selfhost connect` on screen and paste `wraps platform connect`,
connecting their AWS account to the hosted control plane that the `selfHosted`
gate exists to keep them off. Screen and clipboard disagreeing is invisible to
every assertion that reads only the screen.

Fixed in `436e5db3` by asserting `toHaveBeenCalledWith` per click plus two units
that sweep every write on each side of the gate.

The rule is a file-level presence check rather than a ban on bare
`toHaveBeenCalled()`, because the two bare calls that survive in that file are
both correct: they are `waitFor` conditions that gate a following assertion
(`:369` waits for a *rejected* write, `:437` waits so it can parse
`mockFetch.mock.calls.at(-1)`). Banning the shape would flag those and miss the
real defect, which was an absence.

**Pre-existing site — not frozen.** `apps/web/src/app/(dashboard)/[orgSlug]/contacts/components/__tests__/contacts-table-a11y.test.tsx:145`
stubs the clipboard, exercises a success path at `:292`, and asserts only that
the `aria-live` status reads "Copied". The button is named
`Copy ada@example.com`; copying a different row's address would pass. Rules run
only against files a chunk touches, so it trips when that file is next edited.

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
// numbers stay exact. A quoted or commented-out assertion is not one.
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

// The test stands up a clipboard - navigator.clipboard replaced or defined
// with a writeText. Matched against the raw source because the property name
// is usually a string literal in Object.defineProperty.
const INSTALLS_CLIPBOARD = /navigator\s*(?:\.|,\s*[\x22\x27\x60])\s*clipboard/;
const HAS_WRITE_TEXT = /\bwriteText\b/;

// At least one assertion reads what was written. The subject has to name the
// clipboard write - mockWriteText, writeTextSpy, clipboard.writeText.
const SUBJECT = "[A-Za-z_$][\\w$]*(?:\\s*\\.\\s*[A-Za-z_$][\\w$]*)*";
const PINS = new RegExp(
  "expect\\s*\\(\\s*(" + SUBJECT + ")\\s*\\)\\s*\\.\\s*(?:not\\s*\\.\\s*)?toHaveBeen(?:Nth|Last)?CalledWith" +
  "|(" + SUBJECT + ")\\s*\\.\\s*mock\\s*\\.\\s*(?:calls|lastCall)",
  "g"
);
const namesClipboard = (s) => /(?:writetext|clipboard)/i.test((s || "").replace(/\s+/g, ""));

let bad = false;
for (const arg of process.argv.slice(1)) {
  const file = arg.replace(/^\.\//, "");
  if (!/\.(?:test|spec)\.tsx?$/.test(file)) continue;
  let raw;
  try { raw = fs.readFileSync(file, "utf8"); } catch { continue; }
  if (!(INSTALLS_CLIPBOARD.test(raw) && HAS_WRITE_TEXT.test(raw))) continue;
  if (raw.includes("clipboard-payload-ok")) continue;
  const src = blank(raw);

  let pinned = false;
  let m;
  PINS.lastIndex = 0;
  while ((m = PINS.exec(src))) {
    if (namesClipboard(m[1]) || namesClipboard(m[2])) { pinned = true; break; }
  }
  if (pinned) continue;

  const line = src.split("\n").findIndex((l) => HAS_WRITE_TEXT.test(l)) + 1;
  bad = true;
  console.log(
    file + ":" + line +
    ": stubs navigator.clipboard.writeText and never asserts its argument - this proves a copy happened, not that the right text was copied"
  );
}
process.exit(bad ? 1 : 0);

' -- "$@"
```

## Fix

Name the string the user will paste:

```ts
expect(mockWriteText).toHaveBeenCalledWith("curl -fsSL https://get.wraps.dev | sh");
```

When a file stubs the clipboard only to make it reject — a pure failure-path
test with no payload to pin — mark it with a
`// clipboard-payload-ok: <reason>` comment.
