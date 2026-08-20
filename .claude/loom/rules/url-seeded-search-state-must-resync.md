---
name: url-seeded-search-state-must-resync
severity: serious
origin: contacts-health-panel — Health-bucket link deletes `search` from the URL, but the table's search box and CSV export keep applying it
applies-to: "apps/web/src/**/*.tsx"
---

## What

A `useState` seeded from `searchParams.get(...)` must have a `useEffect` that
writes its setter, so the control follows the URL when something other than the
control itself changes that param.

## Why

`contacts-table.tsx` seeded its search box once:
`const [searchInput, setSearchInput] = useState(searchParams.get("search") || "")`.
`healthFilterHref` in
`apps/web/src/app/(dashboard)/[orgSlug]/contacts/components/contact-analytics.tsx:233`
deliberately calls `params.delete("search")` — a health bucket is an
organization-wide count, so inheriting a term would land "80 bounced" on a table
showing three rows.

Next re-renders the page segment on a search-params-only navigation without
remounting it (the same fact the 400ms search debounce depends on), so the
initializer never ran again. After clicking a bucket the box still displayed
`ada` while the rows were no longer filtered by it. Cosmetic until the CSV
export next to it, which mixed the stale local term with the fresh URL status
and handed the operator a file that did not match the list on screen — see the
companion rule `contacts-export-filters-must-come-from-the-url`.

Fixed in `contacts-table.tsx` by the re-sync effect at the `committedSearch` /
`observedSearchParam` refs; pinned by
`apps/web/src/app/(dashboard)/[orgSlug]/contacts/components/__tests__/contacts-table-search-sync.test.tsx`.

Two sibling tables are known to carry the same latent defect and will trip this
rule the next time they are touched — that is intended, not noise:
`events/components/events-table.tsx:84` and
`(ee)/automations/components/workflows-table.tsx:111`.

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

const lineOf = (src, idx) => src.slice(0, idx).split("\n").length;

let bad = false;
for (const file of process.argv.slice(1)) {
  if (!/\.tsx$/.test(file)) continue;
  let raw;
  try { raw = fs.readFileSync(file, "utf8"); } catch { continue; }
  if (!raw.includes("useSearchParams")) continue;
  const src = blank(raw);
  const rawLines = raw.split("\n");

  // identifiers whose const declaration reads a URL search param
  const urlBound = new Set();
  const declRe = /\bconst\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=/g;
  let m;
  while ((m = declRe.exec(src))) {
    const stmt = src.slice(m.index, m.index + 400).split(";")[0];
    if (/searchParams\s*\.\s*get\s*\(/.test(stmt)) urlBound.add(m[1]);
  }

  const effects = [];
  const effRe = /\buseEffect\s*\(/g;
  while ((m = effRe.exec(src))) effects.push(paren(src, m.index + m[0].length - 1));

  const stateRe = /\bconst\s*\[\s*([A-Za-z_$][\w$]*)\s*,\s*(set[A-Za-z_$][\w$]*)\s*\]\s*=\s*useState\s*(?:<[^>]*>)?\s*\(/g;
  while ((m = stateRe.exec(src))) {
    const setter = m[2];
    const init = paren(src, m.index + m[0].length - 1).trim();
    const seeded = /searchParams\s*\.\s*get\s*\(/.test(init) ||
      init.split(/[^\w$]+/).some((t) => t && urlBound.has(t));
    if (!seeded) continue;
    const line = lineOf(src, m.index);
    // deliberate seed-once state opts out with a url-seed-once comment
    if (rawLines.slice(Math.max(0, line - 4), line).join("\n").includes("url-seed-once")) continue;
    if (effects.some((b) => new RegExp("\\b" + setter + "\\s*\\(").test(b))) continue;
    bad = true;
    console.log(file + ":" + line + ": " + m[1] + " is seeded from the URL but no useEffect calls " + setter + " - a link that changes that search param leaves this control stale");
  }
}
process.exit(bad ? 1 : 0);
' -- "$@"
```

## Fix

Add an effect that follows the param, guarded so it cannot fight someone typing:

```tsx
useEffect(() => { if (searchParam !== committedSearch.current) setSearchInput(searchParam); }, [searchParam]);
```

State that is genuinely meant to be seeded once (a deep-linked default the user
then owns) opts out with a `// url-seed-once: <reason>` comment on or just above
the `useState` line.
