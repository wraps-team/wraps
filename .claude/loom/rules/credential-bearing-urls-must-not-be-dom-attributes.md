---
name: credential-bearing-urls-must-not-be-dom-attributes
severity: critical
origin: cli-first-deploy-step — Org webhook credential is shipped to PostHog in full via autocapture of the Open AWS Console href
applies-to: "apps/**/*.tsx"
---

## What

A URL that carries a credential may not be rendered as an `href` or `src`
attribute. If the expression behind `href={...}` / `src={...}` names an
identifier whose name contains `secret`, `token`, `password`, `credential`,
`apiKey`, `signature`, or is `quickCreateUrl`, the URL has to be opened from
script (`window.open`) instead, so the credential never becomes markup.

## Why

`apps/web/src/app/(onboarding)/[orgSlug]/onboarding/components/cli-deploy-connect-step.tsx:859`
(as of `4865c14d`) rendered the post-deploy "Open AWS Console" control as:

```tsx
<a href={quickCreateUrl} rel="noopener noreferrer" target="_blank">
```

`quickCreateUrl` is built by `generateQuickCreateUrl(organizationId, webhookSecret)`
in the same file, and its query string carries `param_WrapsWebhookSecret` — the
org's live webhook secret, freshly minted from `crypto.getRandomValues` on mount.
PostHog autocapture serialises anchor attributes, `href` included, as `attr__href`
on the click event. So every click on that control shipped a live bearer
credential, in full, to the analytics project.

It is a bearer credential in the strict sense: the SES webhook route
authenticates inbound events by timing-safe-comparing this secret against the
stored secret for an AWS account number, and the account number is not secret.
A leaked pair lets an attacker write forged bounce and complaint events into an
org's event stream.

The primary deploy control in the same component was already correct — it called
`window.open(quickCreateUrl, ...)`, and `window.open` targets are not
autocaptured. Only the second, post-deploy control regressed to an anchor. That
is exactly the shape this rule exists to catch: one control in a component gets
it right, the copy of it next to it does not, and nothing in review flags the
difference because both look like ordinary links.

Fixed in `64840d7e` by routing the control through `handleOpenAwsConsole()` with
`window.open`, plus `ph-no-capture` on the button as defence in depth.
`cli-deploy-connect-step.test.tsx` pins that no DOM attribute carries the secret.

**What the check reads, and what it cannot see.** It matches on *identifier
names* in the attribute expression, after discarding string-literal text — so a
docs link whose path reads `/guides/api-tokens` is not flagged, while
`` href={`...&s=${webhookSecret}`} `` is. It cannot see a credential URL that
arrives under a neutral name (`const url = buildUrl(secret)` then `href={url}`);
naming is the signal it has. `action`/`formAction` are deliberately out of
scope: in React those hold server-action functions, not URLs, and including
them false-positived on `apps/web/src/app/(dashboard)/settings/security/components/change-password.tsx:195`.

## Check

```bash
# Receives candidate file paths as "$@". Exit 0 = clean, non-zero = violated.
node -e '
const fs = require("node:fs");

const DQ = String.fromCharCode(34);
const SQ = String.fromCharCode(39);
const BQ = String.fromCharCode(96);
const QUOTES = DQ + SQ + BQ;

// Balanced `{...}` starting at `open`; brace- and string-aware.
function braced(code, open) {
  let depth = 0;
  let quote = "";
  for (let i = open; i < code.length; i += 1) {
    const c = code[i];
    if (quote) {
      if (c === "\\") { i += 1; continue; }
      if (c === quote) quote = "";
      continue;
    }
    if (QUOTES.includes(c)) { quote = c; continue; }
    if (c === "{") { depth += 1; continue; }
    if (c === "}") { depth -= 1; if (depth === 0) return code.slice(open + 1, i); }
  }
  return null;
}

// Drop literal string text, keeping `${...}` interpolations, so only real
// identifiers are matched: a docs URL whose path says "tokens" is not a
// credential.
function identifiersOnly(expr) {
  let out = "";
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (c === DQ || c === SQ) {
      i += 1;
      while (i < expr.length && expr[i] !== c) i += expr[i] === "\\" ? 2 : 1;
      i += 1;
      out += " ";
      continue;
    }
    if (c === BQ) {
      i += 1;
      while (i < expr.length && expr[i] !== BQ) {
        if (expr[i] === "\\") { i += 2; continue; }
        if (expr[i] === "$" && expr[i + 1] === "{") {
          const inner = braced(expr, i + 1);
          if (inner === null) { i += 2; continue; }
          out += " " + identifiersOnly(inner) + " ";
          i += 2 + inner.length + 1;
          continue;
        }
        i += 1;
      }
      i += 1;
      out += " ";
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

// `//` that starts a comment, not the `//` of a URL scheme.
function inLineComment(line) {
  const at = line.search(/(^|[^:/])\/\//);
  return at !== -1;
}

const SECRET_WORD =
  /secret|token|password|passwd|credential|apikey|api_key|signature|quickcreateurl/i;
const IDENT = /[A-Za-z_$][\w$]*/g;

function credentialIdentifier(expr) {
  const text = identifiersOnly(expr);
  IDENT.lastIndex = 0;
  let id;
  while ((id = IDENT.exec(text)) !== null) {
    if (SECRET_WORD.test(id[0])) return id[0];
  }
  return null;
}

const URL_ATTR = /(^|[\s{(])(href|src)\s*=\s*\{/g;

let bad = false;
for (const raw of process.argv.slice(1)) {
  const file = raw.replace(/^\.\//, "");
  if (!/\.[jt]sx$/.test(file)) continue;
  let source;
  try { source = fs.readFileSync(file, "utf8"); } catch { continue; }
  // Block comments only. A bare apostrophe in JSX prose (as in "won" + t)
  // makes quote-tracking unusable here, and a slash-star never legitimately
  // opens inside JSX text.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, (b) => b.replace(/[^\n]/g, " "));
  URL_ATTR.lastIndex = 0;
  let m;
  while ((m = URL_ATTR.exec(code)) !== null) {
    const open = m.index + m[0].length - 1;
    URL_ATTR.lastIndex = open + 1;
    const before = code.lastIndexOf("\n", m.index) + 1;
    if (inLineComment(code.slice(before, m.index))) continue;
    const expr = braced(code, open);
    if (expr === null) continue;
    const hit = credentialIdentifier(expr);
    if (!hit) continue;
    const line = code.slice(0, open).split("\n").length;
    bad = true;
    console.log(
      file + ":" + line + ": " + m[2] + "={" + expr.trim().replace(/\s+/g, " ").slice(0, 60) +
      "} puts a credential-bearing URL (" + hit + ") in a DOM attribute; " +
      "PostHog autocapture ships it as attr__" + m[2].toLowerCase() + " on every click. " +
      "Open it from script with window.open() instead."
    );
  }
}
process.exit(bad ? 1 : 0);
' -- "$@"
```

## Fix

Open the URL from script and give the control a button, so the credential never
reaches the DOM:

```tsx
<Button className="ph-no-capture" onClick={() => window.open(quickCreateUrl, "_blank", "noopener,noreferrer")} type="button">Open AWS Console</Button>
```
