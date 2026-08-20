---
name: contacts-export-filters-must-come-from-the-url
severity: critical
origin: contacts-health-panel — The CSV-export boundary got the guard but no test — 106 component tests miss its regression
applies-to: "apps/web/src/**/*.{ts,tsx}"
---

## What

Every filter handed to `exportAllContacts` must be the same value the visible
list was filtered by: `emailStatus` must be a binding narrowed by
`isEmailStatus()`, and `search` must not be component state.

## Why

The export is the one place in the contacts page where a wrong filter leaves the
building. Two separate defects landed on this single call:

- `emailStatus: (statusFilter as EmailStatus) || undefined`, where
  `statusFilter` was the raw `searchParams.get("emailStatus")`. A crafted
  `?emailStatus=whatever` read "All Statuses" in the on-screen `<Select>` (which
  validates) and went to the server unvalidated in the export (which did not).
  The cast is what silenced the compiler.
- `search: trimmedSearchInput || undefined` — local input state rather than the
  URL. The list is filtered by `?search=`, so any moment the two disagree the
  CSV is a different query than the table. The health-bucket links in
  `apps/web/src/app/(dashboard)/[orgSlug]/contacts/components/contact-analytics.tsx:233`
  create exactly that moment: they `params.delete("search")` while the box kept
  its term (see `url-seeded-search-state-must-resync`).

Both are now correct in
`apps/web/src/app/(dashboard)/[orgSlug]/contacts/components/contacts-table.tsx`
(`statusFilter = isEmailStatus(rawStatusFilter) ? rawStatusFilter : null`,
`search: searchParam || undefined`). The reviewer's finding was that the guard
had no regression net:
`apps/web/src/app/(dashboard)/[orgSlug]/contacts/components/__tests__/contacts-table-a11y.test.tsx:401`
covers the `<Select>` half only, so nothing failed if the export half was
reverted. This check is that net, at the call site rather than through 106
component tests.

## Check

```bash
# Receives candidate file paths as "$@". Exit 0 = clean, non-zero = violated.
node -e '
const fs = require("node:fs");

// Blank out comments, strings, template literals and regex literals so the
// structural scan below cannot be fooled by their contents. Length and
// newlines are preserved so reported line numbers stay accurate.
function blank(src) {
  let out = "", i = 0, prev = "";
  const n = src.length;
  const QUOTES = String.fromCharCode(34, 39, 96); // double, single, backtick
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
      out += c; i++; prev = c; continue;
    }
    if (c === "/" && "(,=:[!&|?{};+".includes(prev)) {
      let j = i + 1, cls = false, ok = false;
      while (j < n) {
        const e = src[j];
        if (e === "\\") { j += 2; continue; }
        if (e === "\n") break;
        if (e === "[") cls = true;
        else if (e === "]") cls = false;
        else if (e === "/" && !cls) { ok = true; break; }
        j++;
      }
      if (ok) {
        out += "/";
        for (let k = i + 1; k < j; k++) out += keep(src[k]);
        out += "/"; i = j + 1; prev = "/"; continue;
      }
    }
    out += c;
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return out;
}

function paren(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")") { depth--; if (depth === 0) return src.slice(open + 1, i); }
  }
  return src.slice(open + 1);
}

// Value text of a top-level `name:` property inside an argument list.
function prop(args, name) {
  const m = new RegExp("(^|[,{\\s])" + name + "\\s*:").exec(args);
  if (!m) return null;
  let depth = 0, out = "";
  for (let i = m.index + m[0].length; i < args.length; i++) {
    const c = args[i];
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) { if (depth === 0) break; depth--; }
    else if (c === "," && depth === 0) break;
    out += c;
  }
  return out.trim();
}

const ids = (s) => s.match(/[A-Za-z_$][\w$]*/g) || [];
const lineOf = (src, idx) => src.slice(0, idx).split("\n").length;

let bad = false;
for (const file of process.argv.slice(1)) {
  if (!/\.(t|j)sx?$/.test(file)) continue;
  if (/(^|\/)__tests__\//.test(file) || /\.test\.[jt]sx?$/.test(file)) continue;
  let raw;
  try { raw = fs.readFileSync(file, "utf8"); } catch { continue; }
  if (!raw.includes("exportAllContacts")) continue;
  const src = blank(raw);

  // const name -> text of its initializer
  const decl = new Map();
  const declRe = /\bconst\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]+)?=/g;
  let m;
  while ((m = declRe.exec(src))) {
    let depth = 0, out = "";
    for (const c of src.slice(m.index + m[0].length)) {
      if ("([{".includes(c)) depth++;
      else if (")]}".includes(c)) depth--;
      else if (c === ";" && depth === 0) break;
      out += c;
    }
    decl.set(m[1], out);
  }

  // names holding component-local state, directly or derived from it
  const local = new Set();
  const stateRe = /\bconst\s*\[\s*([A-Za-z_$][\w$]*)\s*,\s*set[A-Za-z_$][\w$]*\s*\]\s*=\s*useState\b/g;
  while ((m = stateRe.exec(src))) local.add(m[1]);
  for (let pass = 0; pass < 3; pass++) {
    for (const [name, init] of decl) {
      if (!local.has(name) && ids(init).some((t) => local.has(t))) local.add(name);
    }
  }

  const callRe = /\bexportAllContacts\s*\(/g;
  while ((m = callRe.exec(src))) {
    const args = paren(src, m.index + m[0].length - 1);
    const line = lineOf(src, m.index);

    const status = prop(args, "emailStatus");
    if (status !== null) {
      const base = status.replace(/\s*(\?\?|\|\|)\s*undefined\s*$/, "").replace(/^\(|\)$/g, "").trim();
      const guarded = /^[A-Za-z_$][\w$]*$/.test(base) && decl.has(base) &&
        /\bisEmailStatus\s*\(/.test(decl.get(base));
      if (!guarded) {
        bad = true;
        console.log(file + ":" + line + ": exportAllContacts receives emailStatus: " + status.replace(/\s+/g, " ") + " - pass a binding narrowed by isEmailStatus() instead");
      }
    }

    const search = prop(args, "search");
    if (search !== null) {
      const tainted = ids(search).filter((t) => local.has(t));
      if (tainted.length > 0) {
        bad = true;
        console.log(file + ":" + line + ": exportAllContacts receives search: " + search.replace(/\s+/g, " ") + " - " + tainted[0] + " is component state, not the URL the list was filtered by");
      }
    }
  }
}
process.exit(bad ? 1 : 0);
' -- "$@"
```

## Fix

Narrow once, near the other URL reads, and pass the narrowed binding:

```tsx
const statusFilter = isEmailStatus(rawStatusFilter) ? rawStatusFilter : null;
await exportAllContacts(orgId, { search: searchParam || undefined, emailStatus: statusFilter ?? undefined });
```

Never `as EmailStatus`, and never `searchInput` — the box may hold a term the
list was never filtered by.
