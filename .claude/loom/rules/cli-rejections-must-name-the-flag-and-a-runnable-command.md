---
name: cli-rejections-must-name-the-flag-and-a-runnable-command
severity: serious
origin: cli-honest-failures — The 23 cli.ts conversions are guarded only by counts and absences — a degenerate sweep passes the whole suite
applies-to: "packages/cli/src/**/*.ts"
---

## What

Every `errors.missingInput(what, usage)` and
`errors.unknownCommand(what, typed, suggestion)` in the CLI must pass arguments
that render into something a user can act on: `what` a non-empty string
literal, `usage` a string literal beginning `wraps `, `suggestion` either a
literal that lists the available commands or points at `--help`, or a
locally-built identifier.

## Why

`packages/cli/src/__tests__/cli-user-input-errors.test.ts:108` (as of
`131ea03f`) was the whole cover for the feature's 23 rejection conversions, and
every assertion in it was a count or an absence: 18-40 `throw errors.` sites,
no `throw new Error(`, no `clack.log.error(`. None of it read the arguments a
site passes. That hole was not theoretical — replacing

```ts
errors.missingInput("--domain", "wraps email verify --domain yourapp.com")
```

with `errors.unknownCommand("command", primaryCommand, "")`, and a second
site's arguments with `errors.missingInput("", "")`, left all 1865 tests in the
package green. `wraps email verify` with no `--domain` would have printed
"Unknown command: email" with an empty suggestion block and reported
`UNKNOWN_COMMAND` for a missing-flag condition, and `wraps email domains
verify` would have printed " is required" / "Usage: ". The per-site messages
are the entire deliverable of the feature; the suite was measuring their count.

`570dc1dc` fixed the test by reading the arguments. This rule exists alongside
it for two reasons. It survives the test file being rewritten or deleted, which
is the failure mode the finding is about. And it closes the limit that file
documents at :28 — "extracting a branch into `commands/<x>/index.ts` would
evade this scan" — by scanning every non-test source file in the package rather
than `cli.ts` alone.

The check ends with a vacuity guard: if `cli.ts` is among the candidates and
fewer than 18 registry rejections parse out of it, the check fails rather than
passing silently. A scan that stops matching must be loud, since a quiet one is
exactly what let the degenerate sweep through.

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

function stripComments(source) {
  let out = "", i = 0, state = "code", quote = "";
  while (i < source.length) {
    const c = source[i], n = source[i + 1];
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

function splitArgs(body) {
  const args = [];
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
    if (c === "," && depth === 0) { args.push(cur.trim().replace(/\s+/g, " ")); cur = ""; continue; }
    cur += c;
  }
  if (cur.trim()) args.push(cur.trim().replace(/\s+/g, " "));
  return args;
}

function registryCalls(code) {
  const pattern = /\berrors\.(missingInput|unknownCommand)\s*\(/g;
  const calls = [];
  let m;
  while ((m = pattern.exec(code))) {
    let i = pattern.lastIndex, depth = 1, quote = "", body = "";
    while (i < code.length) {
      const c = code[i];
      if (quote) {
        if (c === "\\") { body += code.slice(i, i + 2); i += 2; continue; }
        if (c === quote) quote = "";
      } else if (c === DQ || c === SQ || c === BQ) quote = c;
      else if (c === "(") depth += 1;
      else if (c === ")") { depth -= 1; if (depth === 0) break; }
      body += c; i += 1;
    }
    calls.push({
      factory: m[1],
      args: splitArgs(body),
      line: code.slice(0, m.index).split("\n").length,
    });
    pattern.lastIndex = i;
  }
  return calls;
}

/** The value of a plain double-quoted literal, or undefined for anything else. */
function literal(arg) {
  if (arg === undefined || !(arg.startsWith(DQ) && arg.endsWith(DQ))) return undefined;
  return arg.slice(1, -1).replaceAll("\\n", "\n").replaceAll("\\" + DQ, DQ);
}

const CLI = "packages/cli/src/cli.ts";
let bad = false;
let sawCli = false;
let cliCalls = 0;

for (const arg of process.argv.slice(1)) {
  const file = arg.replace(/^\.\//, "");
  if (!/\.tsx?$/.test(file) || /\.(test|spec)\.tsx?$/.test(file)) continue;
  let source;
  try { source = fs.readFileSync(file, "utf8"); } catch { continue; }
  if (file === CLI) sawCli = true;
  if (!/errors\.(missingInput|unknownCommand)/.test(source)) continue;

  const say = (line, msg) => { bad = true; console.log(file + ":" + line + ": " + msg); };

  for (const call of registryCalls(stripComments(source))) {
    if (file === CLI) cliCalls += 1;
    const at = "errors." + call.factory + "(" + call.args.join(", ") + ")";

    if (call.factory === "missingInput") {
      // `${what} is required` / `Usage: ${usage}` - both render verbatim.
      if (call.args.length !== 2) { say(call.line, "missingInput takes (what, usage); got " + call.args.length + " args - " + at); continue; }
      const what = literal(call.args[0]);
      const usage = literal(call.args[1]);
      if (what === undefined || what.trim() === "") say(call.line, "the first argument to missingInput must be a non-empty string literal naming the flag - blank prints \" is required\" - " + at);
      if (usage === undefined || !/^wraps \S/.test(usage)) say(call.line, "the second argument to missingInput must be a runnable command starting \"wraps \" - blank prints \"Usage: \" - " + at);
      continue;
    }

    // `Unknown ${what}: ${typed}` plus a suggestion block.
    if (call.args.length !== 3) { say(call.line, "unknownCommand takes (what, typed, suggestion); got " + call.args.length + " args - " + at); continue; }
    const what = literal(call.args[0]);
    if (what === undefined || what.trim() === "") say(call.line, "the first argument to unknownCommand must be a non-empty string literal naming the surface - blank prints \"Unknown : foo\" - " + at);
    const suggestion = call.args[2];
    if (suggestion.startsWith(DQ)) {
      const text = literal(suggestion);
      if (text === undefined || !/Available commands:|--help/.test(text)) say(call.line, "the suggestion argument to unknownCommand must list the available commands or point at --help - " + at);
    } else if (!/^[A-Za-z_$][\w$]*$/.test(suggestion)) {
      say(call.line, "the suggestion argument to unknownCommand must be a string literal or a locally built identifier - " + at);
    }
  }
}

// A rename or a refactor that stops the scan matching must fail loudly rather
// than pass vacuously - that is the whole failure mode this rule exists for.
if (sawCli && cliCalls < 18) {
  console.log(CLI + ":1: found only " + cliCalls + " errors.missingInput/unknownCommand calls (expected 18+) - the scan stopped matching, so this check is vacuous");
  bad = true;
}
process.exit(bad ? 1 : 0);
' -- "$@"
```

## Fix

Name the flag and give a command the user can paste:

```ts
throw errors.missingInput("--domain", "wraps email verify --domain yourapp.com");
```
