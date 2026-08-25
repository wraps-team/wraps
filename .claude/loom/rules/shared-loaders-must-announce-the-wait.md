---
name: shared-loaders-must-announce-the-wait
severity: serious
origin: cli-first-deploy-step — Step-4 gate strands the user on a permanent, silent full-screen spinner when the status API fails
applies-to: "**/{loader,spinner}.tsx"
---

## What

A shared `loader.tsx` / `spinner.tsx` component may not render a bare spinning
icon. It must sit in a `status` live region — an `<output>` element, or an
explicit `role="status"` — and it must carry an accessible name: a non-empty
`sr-only` text node, or an `aria-label` / `aria-labelledby`.

## Why

`apps/web/src/app/(onboarding)/[orgSlug]/onboarding/page.tsx:390` (as of
`64840d7e`) gated onboarding step 4 on `<Loader fullScreen />` whenever the
`/onboarding/status` query had no data. The queryFn throws on `!res.ok`, the
query client retries once and does not refetch on window focus, so a failing
status API settled the query into error-with-no-data and the gate's only branch
was that loader — permanently.

What made the dead end silent rather than merely annoying was
`apps/web/src/components/loader.tsx` (as of `64840d7e`):

```tsx
<div className={containerClass}>
  <Loader2 className={cn("animate-spin text-primary", sizeClasses[size], className)} />
</div>
```

A `<div>` wrapping an icon: no role, no name, no live region. A sighted user at
least saw something spinning; a screen-reader user got nothing at all — the page
changed and announced neither a wait nor, later, a failure (WCAG 4.1.3
Status Messages). The only way out of the screen was a manual reload the UI
never mentioned.

Fixed in `509e09cc`: `Loader` is now an `<output>` (implicit `role="status"`)
with a visually hidden "Loading..." label, so *every* full-screen loader in the
app announces the wait, and the step-4 gate grew a real error branch with
Try again / Back / Skip. `loader.test.tsx` pins the role and the label.

This is the half of the finding that mechanizes. One shared component gates a
large share of the app's waits, so pinning its semantics is worth a check even
though it is a single file: the regression that produced this defect was a
component written without them in the first place, not a later deletion.

`packages/ui/src/components/ui/spinner.tsx` satisfies the rule a different way —
`role="status"` plus `aria-label="Loading"` on the icon itself, with no wrapper
and no `sr-only` node. That is a correct accessible spinner, so the check accepts
an aria label as an alternative to the hidden text node rather than mandating one
spelling.

## Not mechanized — the dead end itself

The other half of the finding is that a component early-returns a loader on a
query state that can settle permanently, with no terminal branch. No static
pattern separates that from a loader gate that legitimately cannot fail: both are
`if (!data) return <Loader />`, and whether the query can settle into
error-with-no-data depends on the queryFn, the retry config, the refetch config
and whether a stale success value survives — none of which are visible at the
gate. A check on "early-returns a loader and has no isError branch" would fire on
every correct suspense-style gate in the app.

That half needs a review rule, not a lint rule: **when a component gates its whole
screen on a query, ask what the user sees when that query fails and never
succeeds.** The answer has to be something with words in it and a way out.

## Check

```bash
# Receives candidate file paths as "$@". Exit 0 = clean, non-zero = violated.
node -e '
const fs = require("node:fs");

const DQ = String.fromCharCode(34);
const SQ = String.fromCharCode(39);
const BQ = String.fromCharCode(96);
const OPENERS = DQ + SQ + BQ + "{(";

// Element or attribute carrying the `status` role: <output> has it implicitly,
// role="status" states it.
const STATUS_ROLE = new RegExp("<output[\\s>]|role\\s*=\\s*[" + OPENERS + "]{1,2}\\s*status");
// An accessible name: a visually hidden, non-empty text node, or an aria label.
const SR_ONLY_TEXT = new RegExp("sr-only[^>]*>\\s*\\{?\\s*[" + DQ + SQ + BQ + "]?\\s*[^<\\s]");
const ARIA_NAME = new RegExp(
  "aria-label\\s*=\\s*[" + OPENERS + "]{1,2}\\s*[^\\s" + DQ + SQ + BQ + ")}]|aria-labelledby\\s*="
);

let bad = false;
for (const raw of process.argv.slice(1)) {
  const file = raw.replace(/^\.\//, "");
  if (!/(^|\/)(loader|spinner)\.tsx$/.test(file)) continue;
  if (/(^|\/)(__tests__|__mocks__)\//.test(file)) continue;
  let source;
  try { source = fs.readFileSync(file, "utf8"); } catch { continue; }
  const code = source.replace(/\/\*[\s\S]*?\*\//g, (b) => b.replace(/[^\n]/g, " "));
  if (!/animate-spin|<Loader|<Spinner/.test(code)) continue;

  const missing = [];
  if (!STATUS_ROLE.test(code)) {
    missing.push("no status live region (<output> or role=" + DQ + "status" + DQ + ")");
  }
  if (!(SR_ONLY_TEXT.test(code) || ARIA_NAME.test(code))) {
    missing.push("no accessible name (non-empty sr-only text node or aria-label)");
  }
  if (missing.length === 0) continue;
  bad = true;
  const line = (code.split("\n").findIndex((l) => /return\s*\(?/.test(l)) + 1) || 1;
  console.log(
    file + ":" + line + ": shared loader has " + missing.join(" and ") +
    " - a bare spinning icon announces nothing, so every wait it gates is silence to a screen reader (WCAG 4.1.3)."
  );
}
process.exit(bad ? 1 : 0);
' -- "$@"
```

## Fix

Wrap the icon in a `status` live region and give it a hidden label:

```tsx
<output className={containerClass}><Loader2 aria-hidden="true" className="animate-spin" /><span className="sr-only">Loading...</span></output>
```
