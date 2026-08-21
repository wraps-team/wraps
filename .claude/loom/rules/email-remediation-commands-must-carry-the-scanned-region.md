---
name: email-remediation-commands-must-carry-the-scanned-region
severity: serious
origin: doctor-self-healing — Remediation commands omit --region, so the pasted fix targets us-east-1 instead of the deployment the doctor just scanned
applies-to: "packages/cli/src/**/*.ts"
---

## What

A `wraps email …` remediation command in the doctor registry must be built
through `withRegion()`, and every doctor source that calls a region-accepting
factory must pass the region it scanned.

## Why

`packages/cli/src/utils/shared/doctor-remediation.ts:66` (as of `de82c123`) read:

```ts
syncStack: (): Remediation => ({ id: "email.sync", command: "wraps email sync", … })
```

Both doctors go out of their way *not* to guess a region — `wraps doctor`
resolves the region of the email connection actually deployed
(`commands/doctor.ts`), and `checkEventPipeline` probes SES, SQS and
EventBridge in that region. The remedy then threw that away: every repair
command re-resolves its own region, and the last fallback in that resolution is
a hardcoded `us-east-1` (`getAWSRegion()`). So a user whose stack lives in
`eu-west-1` was shown a report about `eu-west-1` and handed a command that runs
against `us-east-1` — where `wraps email sync` finds no stack, and where
`wraps email domains add` would start building a second one.

Fixed in `827ee94c` by routing every command through `withRegion(command,
region)` (a suffix, so the telemetry-safe `id` stays constant) and threading the
scanned region into each factory call site.

`doctor-remediation.test.ts:25` covers the four factories with a region
argument. This rule covers the other half — the call sites — and the case that
test cannot see: a factory added tomorrow that builds its command string
directly.

Only `wraps email …` commands are checked. `wraps permissions` and
`wraps aws setup` take no `--region`, and `ssoLogin` carries an `aws` command
built by `getSSOLoginCommand()`, which is not ours to shape.

## Check

```bash
# Receives candidate file paths as "$@". Exit 0 = clean, non-zero = violated.
node -e '
const fs = require("node:fs");

// Blank out comments and string bodies, preserving length and newlines so
// reported line numbers stay accurate and quoted text cannot be read as code.
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

const REGISTRY = "packages/cli/src/utils/shared/doctor-remediation.ts";
const CALL_SITES = [
  "packages/cli/src/utils/email/event-pipeline-check.ts",
  "packages/cli/src/commands/email/doctor.ts",
  "packages/cli/src/commands/aws/doctor.ts",
  "packages/cli/src/commands/doctor.ts",
];
const ANNOTATION = "remediation:no-region-available";

const norm = (p) => p.replace(/^\.\//, "");
const candidates = process.argv.slice(1).map(norm);
const touched = candidates.filter(
  (f) => f === REGISTRY || CALL_SITES.includes(f)
);
if (touched.length === 0) process.exit(0);

let registryRaw;
try { registryRaw = fs.readFileSync(REGISTRY, "utf8"); } catch { process.exit(0); }
const registry = blank(registryRaw);
const lineOf = (src, idx) => src.slice(0, idx).split("\n").length;

const openMatch = /export const remediations = \{/.exec(registry);
if (!openMatch) {
  console.log(REGISTRY + ":1: cannot locate the remediations registry - this check cannot run");
  process.exit(1);
}
const bodyStart = openMatch.index + openMatch[0].length;
let depth = 1, bodyEnd = registry.length;
for (let i = bodyStart; i < registry.length; i++) {
  const c = registry[i];
  if (c === "{") depth++;
  else if (c === "}") { depth--; if (depth === 0) { bodyEnd = i; break; } }
}
const body = registry.slice(bodyStart, bodyEnd);

// Balanced slice starting at `open`, the index of an opening bracket.
function balanced(src, open) {
  const pairs = { "(": ")", "{": "}", "[": "]" };
  const close = pairs[src[open]];
  let d = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === src[open]) d++;
    else if (src[i] === close) { d--; if (d === 0) return { text: src.slice(open + 1, i), end: i }; }
  }
  return { text: src.slice(open + 1), end: src.length };
}

function splitTopLevel(text) {
  const parts = [];
  let d = 0, cur = "";
  for (const c of text) {
    if ("([{".includes(c)) d++;
    else if (")]}".includes(c)) d--;
    if (c === "," && d === 0) { parts.push(cur); cur = ""; continue; }
    cur += c;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

const factories = new Map();
const FACTORY = /(^|[\s,{])([A-Za-z_$][\w$]*)\s*:\s*\(/g;
let m;
while ((m = FACTORY.exec(body))) {
  const parenAt = bodyStart + m.index + m[0].length - 1;
  const params = balanced(registry, parenAt);
  const after = registry.slice(params.end + 1, params.end + 60);
  if (!/^\s*(:\s*Remediation\s*)?=>/.test(after)) continue;
  const objAt = registry.indexOf("{", params.end + 1);
  if (objAt === -1) continue;
  const obj = balanced(registry, objAt);
  const cmd = /(^|[\s,{])command\s*:/.exec(obj.text);
  let commandExpr = null, commandIdx = null;
  if (cmd) {
    const start = cmd.index + cmd[0].length;
    commandExpr = splitTopLevel(obj.text.slice(start))[0] ?? "";
    commandIdx = objAt + 1 + start;
  }
  factories.set(m[2], {
    params: splitTopLevel(params.text),
    commandExpr,
    commandLine: commandIdx === null ? lineOf(registry, parenAt) : lineOf(registry, commandIdx),
  });
}

if (factories.size === 0) {
  console.log(REGISTRY + ":1: parsed no remediation factories - this check cannot run");
  process.exit(1);
}

let bad = false;

// (a) The registry: a `wraps email` command literal must be region-suffixed.
if (touched.includes(REGISTRY)) {
  for (const [name, f] of factories) {
    if (!f.commandExpr) continue;
    const literal = registryRaw
      .split("\n")
      .slice(f.commandLine - 1, f.commandLine + 4)
      .join("\n");
    if (!/[\x22\x27\x60]wraps email /.test(literal)) continue;
    const near = registryRaw
      .split("\n")
      .slice(Math.max(0, f.commandLine - 3), f.commandLine)
      .join("\n");
    if (near.includes(ANNOTATION)) continue;
    if (!/withRegion\s*\(/.test(f.commandExpr)) {
      bad = true;
      console.log(
        REGISTRY + ":" + f.commandLine + ": remediations." + name +
        " builds a `wraps email` command without withRegion() - the pasted fix falls back to us-east-1 instead of the region the doctor scanned"
      );
    }
  }
}

// (b) Call sites: a region-accepting factory must be handed the region.
const regionAware = new Map(
  [...factories].filter(([, f]) => f.params.some((p) => /^region\b/.test(p)))
);
for (const file of touched) {
  if (file === REGISTRY) continue;
  let raw;
  try { raw = fs.readFileSync(file, "utf8"); } catch { continue; }
  const src = blank(raw);
  for (const [name, f] of regionAware) {
    const re = new RegExp("remediations\\s*\\.\\s*" + name + "\\s*\\(", "g");
    let call;
    while ((call = re.exec(src))) {
      const parenAt = call.index + call[0].length - 1;
      const args = balanced(src, parenAt);
      if (splitTopLevel(args.text).length >= f.params.length) continue;
      // `.id` and `.level` do not vary with the region.
      if (/^\s*\.\s*(id|level)\b/.test(src.slice(args.end + 1, args.end + 12))) continue;
      const line = lineOf(src, call.index);
      const window = raw.split("\n").slice(Math.max(0, line - 3), line).join("\n");
      if (window.includes(ANNOTATION)) continue;
      bad = true;
      console.log(
        file + ":" + line + ": remediations." + name + "() drops the region argument - the printed command targets us-east-1, not the region this doctor scanned"
      );
    }
  }
}
process.exit(bad ? 1 : 0);
' -- "$@"
```

## Fix

Suffix the region in the registry and pass it at the call site:

```ts
syncStack: (region?: string) => ({ id: "email.sync", command: withRegion("wraps email sync", region), … })
```

When a call site genuinely has no region to give (the finding predates region
resolution, or only `.id` is read), say so with a
`// remediation:no-region-available: <reason>` comment on or just above the line.
