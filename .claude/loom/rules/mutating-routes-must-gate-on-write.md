---
name: mutating-routes-must-gate-on-write
severity: critical
origin: cli-first-deploy-step — Read-only org members can attach an attacker-controlled AWS account to the org (write gated on awsAccounts:"read")
applies-to: "apps/web/src/app/api/**/route.ts"
---

## What

A `POST` / `PUT` / `PATCH` / `DELETE` route handler that writes to the database
(`db.insert(`, `db.update(`, `db.delete(`, or the same on a transaction handle)
may not authorize itself with `requireRoutePermission(role, resource, ["read"])`.
The actions array on a mutating handler has to name the mutating action —
`["write"]`, `["delete"]`, `["create"]`.

Read-gated `POST`s that write nothing are untouched: `onboarding/verify-cli`
is a `POST` that only echoes success, and `awsAccounts:["read"]` is the correct
gate for it.

## Why

`apps/web/src/app/api/[orgSlug]/aws/validate-infrastructure/route.ts:56` (as of
`6ecbfa20^`) authorized its `POST` like this:

```ts
const denied = requireRoutePermission(
  orgWithMembership.userRole,
  "awsAccounts",
  ["read"]          // <- the handler goes on to db.insert() an awsAccount row
);
```

`awsAccounts:read` is held by `member`, `marketing`, `read-only` and `billing`.
So any of those roles could `POST` a `roleArn` and `externalId` pointing at an
AWS account **they** control and have it inserted into the victim org with
`isVerified: true`. That row is not inert configuration — it is a live sending
identity: the API resolves it to a `roleArn`/`externalId` pair and assume-roles
into it to send mail, so the org would be assume-roling into the attacker's
account. Two sibling routes (`aws/validate`, `onboarding/aws/validate`) carried
the identical mistake.

What made it survivable for so long is that the *action* layer was already
right: `connectAwsAccount` gates the same operation on `awsAccounts:["write"]`
and `permissions.test.ts` already asserts `member` is denied it. The routes were
the outlier, and nothing compared the two. Fixed in `6ecbfa20` by tightening all
three to `["write"]`, with a real-DB regression test asserting 403 and zero rows
written for each read-only role.

The rule is deliberately anchored on "this handler writes" rather than "this
handler is a POST" — that is the only signal that separates the three real
vulnerabilities from `onboarding/verify-cli`, a read-gated `POST` that is
correct as written.

## Check

```bash
# Receives candidate file paths as "$@". Exit 0 = clean, non-zero = violated.
node -e '
const fs = require("node:fs");

const DQ = String.fromCharCode(34);
const SQ = String.fromCharCode(39);
const BQ = String.fromCharCode(96);
const QUOTES = DQ + SQ + BQ;

// Blank comments (length- and newline-preserving) so a commented-out
// permission call is not read as one. String *bodies* are kept: the actions
// array literal is string content.
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

const HANDLER = /^export\s+(?:async\s+)?(?:function\s+|const\s+)(GET|HEAD|OPTIONS|POST|PUT|PATCH|DELETE)\b/;
const WRITES = /\b(?:db|tx|trx|database)\s*\.\s*(?:insert|update|delete)\s*\(/;
const PERM = /\brequireRoutePermission\s*\(/g;

// The argument list of a call whose "(" is at `from`.
function argsOf(src, from) {
  let depth = 0;
  for (let i = from; i < src.length; i += 1) {
    const c = src[i];
    if (c === "(") depth += 1;
    else if (c === ")") { depth -= 1; if (depth === 0) return src.slice(from + 1, i); }
  }
  return "";
}

let bad = false;
for (const arg of process.argv.slice(1)) {
  const file = arg.replace(/^\.\//, "");
  if (!/(?:^|\/)apps\/web\/src\/app\/api\/.*\/route\.ts$/.test(file)) continue;
  let raw;
  try { raw = fs.readFileSync(file, "utf8"); } catch { continue; }
  if (!raw.includes("requireRoutePermission")) continue;
  const src = blank(raw);
  const lines = src.split("\n");

  // Slice the file into top-level HTTP-method export blocks, so a correct
  // GET(["read"]) next to a POST(["write"]) is never confused for a violation.
  const blocks = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = HANDLER.exec(lines[i]);
    if (m) blocks.push({ method: m[1], startLine: i });
  }
  for (let b = 0; b < blocks.length; b += 1) {
    blocks[b].endLine = b + 1 < blocks.length ? blocks[b + 1].startLine : lines.length;
  }

  for (const block of blocks) {
    if (!/^(?:POST|PUT|PATCH|DELETE)$/.test(block.method)) continue;
    const body = lines.slice(block.startLine, block.endLine).join("\n");
    if (!WRITES.test(body)) continue;
    if (/permission-gate-ok/.test(body)) continue;
    PERM.lastIndex = 0;
    let m;
    while ((m = PERM.exec(body))) {
      const args = argsOf(body, m.index + m[0].length - 1);
      const arr = /\[([^\]]*)\]\s*$/.exec(args.trim());
      if (!arr) continue;
      const actions = arr[1]
        .split(",")
        .map((s) => s.trim().replace(/^[\x22\x27\x60]|[\x22\x27\x60]$/g, ""))
        .filter(Boolean);
      if (actions.length === 0 || !actions.every((a) => a === "read")) continue;
      const line = block.startLine + body.slice(0, m.index).split("\n").length;
      bad = true;
      console.log(
        file + ":" + line + ": " + block.method +
        " writes to the database but requireRoutePermission gates it on [" +
        DQ + "read" + DQ +
        "] - member, marketing, read-only and billing all hold read, so every one of them can perform this write"
      );
    }
  }
}
process.exit(bad ? 1 : 0);

' -- "$@"
```

## Fix

Name the action the handler actually performs, and match whatever the
equivalent server action already uses:

```ts
const denied = requireRoutePermission(orgWithMembership.userRole, "awsAccounts", ["write"]);
```

If a mutating handler genuinely must stay read-gated — the write is bookkeeping
the reader is entitled to, not a change to org state — say so with a
`// permission-gate-ok: <reason>` comment inside the handler.
