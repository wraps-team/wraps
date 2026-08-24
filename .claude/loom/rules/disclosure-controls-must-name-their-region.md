---
name: disclosure-controls-must-name-their-region
severity: serious
origin: cli-first-deploy-step — Choosing a deploy path reveals its panel two cards below the fold, with no focus move and nothing announced
applies-to: "apps/{web,website}/src/**/*.tsx"
---

## What

A control that reveals a region must point at it. Two shapes are forbidden:

1. `aria-expanded={...}` on an element with no `aria-controls` (or `aria-owns`).
2. `aria-pressed={EXPR}` where the same `EXPR` also gates a conditionally
   rendered JSX block in that file — that is a disclosure, not a toggle — and
   the element has no `aria-controls`.

A segmented filter whose `aria-pressed` state changes *what data* a
permanently-rendered region shows (the `timeRange` button rows across the
analytics charts) is untouched. `aria-pressed` there is correct and
`aria-controls` is not required.

## Why

`apps/web/src/app/(onboarding)/[orgSlug]/onboarding/components/cli-deploy-connect-step.tsx:489,508,529`
(as of `016231a5^`) had three path-choice buttons carrying `aria-pressed` and
nothing else. Each one revealed a panel rendered *after* the whole card grid,
which below `md` puts it roughly 500px under the button that was tapped.

Nothing moved the viewport and nothing was announced. A phone user read their
tap as a no-op and tried the next button — firing a second
`onboarding_deployment_method_selected` and poisoning the denominator this step
exists to measure. A screen-reader user heard "selected" and got no sign that
four commands had appeared. This was a disclosure hand-built out of a plain
`Button`, replacing a primitive that used to supply the wiring.

Fixed in `016231a5`: each panel is a labelled `region` with a stable
`useId`-derived id, the buttons carry `aria-controls`/`aria-expanded`, and
selecting a path focuses the panel (`tabIndex -1`) and scrolls it into view.

The `aria-pressed` half of this rule needs the "same expression gates a
conditional render" qualifier to exist at all. A blanket
"`aria-pressed` without `aria-controls`" rule flags fourteen correct files in
`apps/web` — every analytics time-range row. With the qualifier, the only
`aria-pressed` sites in the repo that match are the three that caused this
finding.

**Pre-existing sites — not frozen.** Four hand-built disclosures already carry
`aria-expanded` with no `aria-controls`:
`apps/web/src/app/(onboarding)/[orgSlug]/onboarding/components/agent-prompt-option.tsx:62`,
`apps/website/src/components/docs-nav.tsx:391`,
`apps/website/src/components/blog/interactive.tsx:66`,
`apps/website/src/components/docs/agent-quickstart-prompt.tsx:57`.
Rules run only against files a chunk touches, so each trips when its file is
next edited.

## Check

```bash
# Receives candidate file paths as "$@". Exit 0 = clean, non-zero = violated.
node -e '
const fs = require("node:fs");

const DQ = String.fromCharCode(34);
const SQ = String.fromCharCode(39);
const BQ = String.fromCharCode(96);
const QUOTES = DQ + SQ + BQ;

// Blank comments and template/string bodies while preserving length and every
// newline, so line numbers stay exact and an aria-expanded written inside a
// comment or a test matcher is not read as a JSX attribute. Quote characters
// themselves survive, so `x === "cli"` still compares equal between the
// attribute and the conditional render.
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
        if (src[i] === "\\") { out += src[i] + (src[i + 1] || ""); i += 2; continue; }
        out += src[i]; i += 1;
      }
      out += i < n ? c : ""; i += 1; continue;
    }
    out += c; i += 1;
  }
  return out;
}

// From an attribute index, walk back to the "<" that opens its element.
function tagStart(src, at) {
  for (let i = at; i >= 0; i -= 1) {
    if (src[i] === "<" && /[A-Za-z]/.test(src[i + 1] || "")) return i;
    if (src[i] === ">") return -1;
  }
  return -1;
}

// From that "<", walk forward to the ">" that closes the opening tag, skipping
// balanced braces/parens so `className={cn(a > b)}` cannot end it early.
function tagEnd(src, from) {
  let brace = 0;
  let paren = 0;
  for (let i = from; i < src.length; i += 1) {
    const c = src[i];
    if (c === "{") brace += 1;
    else if (c === "}") brace -= 1;
    else if (c === "(") paren += 1;
    else if (c === ")") paren -= 1;
    else if (c === ">" && brace === 0 && paren === 0) return i;
  }
  return -1;
}

// Read a {...} attribute value starting at the "{".
function braceValue(src, from) {
  let depth = 0;
  for (let i = from; i < src.length; i += 1) {
    const c = src[i];
    if (c === "{") depth += 1;
    else if (c === "}") { depth -= 1; if (depth === 0) return src.slice(from + 1, i); }
  }
  return null;
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const EXPANDED = /\baria-expanded\s*=/g;
const PRESSED = /\baria-pressed\s*=\s*\{/g;

let bad = false;
for (const arg of process.argv.slice(1)) {
  const file = arg.replace(/^\.\//, "");
  if (!/\.tsx$/.test(file)) continue;
  if (/(?:^|\/)(?:__tests__|__mocks__)\//.test(file)) continue;
  if (/\.(?:test|spec|stories)\.tsx$/.test(file)) continue;
  let raw;
  try { raw = fs.readFileSync(file, "utf8"); } catch { continue; }
  if (!/aria-(?:expanded|pressed)/.test(raw)) continue;
  const src = blank(raw);
  const flat = src.replace(/\s+/g, " ");
  const rawLines = raw.split("\n");

  const report = (index, why) => {
    const line = src.slice(0, index).split("\n").length;
    const window = rawLines.slice(Math.max(0, line - 4), line).join("\n");
    if (window.includes("aria-controls-ok")) return;
    bad = true;
    console.log(file + ":" + line + ": " + why);
  };

  const wired = (index) => {
    const start = tagStart(src, index);
    if (start < 0) return true;
    const end = tagEnd(src, start);
    if (end < 0) return true;
    return /\baria-(?:controls|owns)\s*=/.test(src.slice(start, end));
  };

  let m;
  EXPANDED.lastIndex = 0;
  while ((m = EXPANDED.exec(src))) {
    if (wired(m.index)) continue;
    report(m.index, "aria-expanded with no aria-controls - the control announces open/closed but names no region, so nothing points a screen reader at what appeared");
  }

  PRESSED.lastIndex = 0;
  while ((m = PRESSED.exec(src))) {
    const value = braceValue(src, m.index + m[0].length - 1);
    if (value === null) continue;
    const expr = value.replace(/\s+/g, " ").trim();
    if (expr.length < 3) continue;
    // The same expression gating a conditionally rendered JSX block makes this
    // a disclosure, not a segmented filter: the press reveals a region.
    if (!new RegExp(esc(expr) + " ?&&(?: ?[^;{}()]{1,60}?&&)* ?[(<]").test(flat)) continue;
    if (wired(m.index)) continue;
    report(m.index, "aria-pressed={" + expr + "} on a control whose state also gates a conditionally rendered block, with no aria-controls - this is a disclosure, and nothing connects the button to the region it reveals");
  }
}
process.exit(bad ? 1 : 0);

' -- "$@"
```

## Fix

Give the revealed region a stable id and point the control at it — then make
sure something actually moves when it opens:

```tsx
<Button aria-controls={panelId} aria-expanded={open} aria-pressed={open} onClick={choose}>Use the CLI</Button>
...
{open && <section aria-label="CLI" id={panelId} ref={panelRef} tabIndex={-1}>…</section>}
```

If a library owns the wiring and injects `aria-controls` at runtime (a Radix
trigger in a portal), say so with an `// aria-controls-ok: <reason>` comment on
or just above the attribute.
