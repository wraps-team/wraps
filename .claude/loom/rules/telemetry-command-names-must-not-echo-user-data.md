---
name: telemetry-command-names-must-not-echo-user-data
severity: critical
origin: cli-honest-failures — `wraps push <slug>` still puts the user's template slug in the telemetry event name
applies-to: "packages/cli/src/{cli.ts,telemetry/command-name.ts}"
---

## What

Every top-level `case "<word>":` in `cli.ts`'s `switch (primaryCommand)` whose
body reads `sub[1]` must be named literally in
`packages/cli/src/telemetry/command-name.ts`. `sub[1]` is the raw second
positional; when a command spends it on user data rather than on a routed
subcommand, `telemetryCommandName()` has to be told, or it emits that data as
the event name.

## Why

`packages/cli/src/telemetry/command-name.ts:55` (as of `55d8c86a`) bounded the
second positional by *shape*, not by membership:

```ts
const COMMAND_WORD = /^[a-z][a-z0-9-]{0,31}$/;
return COMMAND_WORD.test(subCommand) ? `${primaryCommand}:${subCommand}` : `${primaryCommand}:${UNKNOWN}`;
```

That was written to stop domains, email addresses and ARNs (which carry `.`,
`@`, `:` or leading digits) reaching the wire. It works for those. It does
nothing for `wraps push welcome-drip`: `case "push"` in cli.ts is the alias for
`email templates push` and passes `sub[1]` to `templatesPush` as the *template
slug*, and slugs are lowercase-hyphen by convention — exactly COMMAND_WORD's
shape. So a customer's internal template name went out verbatim as
`command:push:welcome-drip`, on the success path as well as the error path,
against a first-run notice that promises the CLI never collects their data. The
event name is not scrubbed downstream: `trackCommand` sanitises only the
metadata object.

Fixed by `COMMANDS_WITH_DATA_SECOND_POSITIONAL = ["push"]`, which reports the
command under its bare name. The fix is a hand-maintained list, which is the
whole problem: nothing connected it to cli.ts, so the next `case` that reaches
past the router for a filename, a template name or a mailbox alias re-opens the
hole silently. This check is that connection — it reads the command table
itself and fails when a `sub[1]`-consuming command has no telemetry decision
recorded.

Naming the word in `command-name.ts` is all the check demands; it deliberately
does not care *which* decision was made. Adding the word to
`COMMANDS_WITH_DATA_SECOND_POSITIONAL` and adding it to an allowlist of
subcommands that really are routed words are both fine — what is not fine is
nobody having looked.

**Scope, and what it cannot see.** Only the top-level `switch (primaryCommand)`
is read, because that switch's case word *is* the `primaryCommand` argument to
`telemetryCommandName()`. Nested `switch (subCommand)` bodies (the `email`,
`sms`, `cdn`, ... legs) consume `sub[2]` and up, which never reach the event
name. And only the literal spelling `sub[1]` counts: a case could bind the same
value through `subCommand` instead, which the check cannot distinguish from the
legitimate routed-word uses in `case "telemetry"` (`switch (subCommand)`, and
`subCommand` passed to `errors.unknownCommand`). If a future command spells its
data positional `subCommand`, this check is blind to it.

## Check

```bash
# Receives candidate file paths as "$@". Exit 0 = clean, non-zero = violated.
node -e '
const fs = require("node:fs");
const path = require("node:path");

const DQ = String.fromCharCode(34);
const SQ = String.fromCharCode(39);
const BQ = String.fromCharCode(96);
const QUOTES = DQ + SQ + BQ;

function stripComments(source) {
  let out = "";
  let i = 0;
  let state = "code";
  let quote = "";
  while (i < source.length) {
    const c = source[i];
    const n = source[i + 1];
    if (state === "code") {
      if (c === "/" && n === "/") { state = "line"; out += "  "; i += 2; continue; }
      if (c === "/" && n === "*") { state = "block"; out += "  "; i += 2; continue; }
      if (QUOTES.includes(c)) { state = "string"; quote = c; }
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

// Body of `switch (<name>) { ... }`, plus its offset in `code`.
function switchBody(code, name) {
  const m = new RegExp("\\bswitch\\s*\\(\\s*" + name + "\\s*\\)\\s*\\{").exec(code);
  if (!m) return null;
  const start = m.index + m[0].length;
  let depth = 1;
  let quote = "";
  let i = start;
  while (i < code.length && depth > 0) {
    const c = code[i];
    if (quote) {
      if (c === "\\") { i += 2; continue; }
      if (c === quote) quote = "";
      i += 1; continue;
    }
    if (QUOTES.includes(c)) { quote = c; i += 1; continue; }
    if (c === "{" || c === "(" || c === "[") depth += 1;
    else if (c === "}" || c === ")" || c === "]") depth -= 1;
    i += 1;
  }
  return { body: code.slice(start, i - 1), offset: start };
}

// Top-level `case "word":` / `default:` labels of a switch body.
function labels(body) {
  const CASE = new RegExp("^case\\s+[" + QUOTES + "]([A-Za-z0-9_-]+)[" + QUOTES + "]\\s*:");
  const DEFAULT = /^default\s*:/;
  const found = [];
  let depth = 0;
  let quote = "";
  for (let i = 0; i < body.length; i += 1) {
    const c = body[i];
    if (quote) {
      if (c === "\\") { i += 1; continue; }
      if (c === quote) quote = "";
      continue;
    }
    if (QUOTES.includes(c)) { quote = c; continue; }
    if (c === "{" || c === "(" || c === "[") { depth += 1; continue; }
    if (c === "}" || c === ")" || c === "]") { depth -= 1; continue; }
    if (depth !== 0) continue;
    if (i > 0 && /[\w$.]/.test(body[i - 1])) continue;
    const rest = body.slice(i, i + 80);
    const hit = CASE.exec(rest);
    if (hit) { found.push({ word: hit[1], start: i, end: i + hit[0].length }); i += hit[0].length - 1; continue; }
    const dflt = DEFAULT.exec(rest);
    if (dflt) { found.push({ word: null, start: i, end: i + dflt[0].length }); i += dflt[0].length - 1; }
  }
  return found;
}

const RAW_POSITIONAL = /\bsub\s*\[\s*1\s*\]/;

let bad = false;
const seen = new Set();
const cliFiles = [];
for (const arg of process.argv.slice(1)) {
  const file = arg.replace(/^\.\//, "");
  let target = null;
  if (/(^|\/)cli\.ts$/.test(file)) target = file;
  else if (/(^|\/)telemetry\/command-name\.ts$/.test(file)) target = path.join(path.dirname(file), "..", "cli.ts");
  if (!target) continue;
  const norm = path.normalize(target);
  if (seen.has(norm)) continue;
  seen.add(norm);
  cliFiles.push(norm);
}

for (const cli of cliFiles) {
  let source;
  try { source = fs.readFileSync(cli, "utf8"); } catch { continue; }
  const decisionsPath = path.join(path.dirname(cli), "telemetry", "command-name.ts");
  let decisions;
  try { decisions = fs.readFileSync(decisionsPath, "utf8"); } catch { continue; }

  const code = stripComments(source);
  const sw = switchBody(code, "primaryCommand");
  if (!sw) {
    console.log(cli + ":1: no `switch (primaryCommand)` found - this rule can no longer see the top-level command table, so the telemetry decision is unguarded");
    bad = true;
    continue;
  }
  const found = labels(sw.body);
  // Fall-through groups share one body: attribute it to every label in the group.
  const groups = [];
  let pending = [];
  for (let k = 0; k < found.length; k += 1) {
    const segment = sw.body.slice(found[k].end, k + 1 < found.length ? found[k + 1].start : sw.body.length);
    pending.push(found[k]);
    if (segment.trim() === "") continue;
    groups.push({ members: pending, segment });
    pending = [];
  }
  if (pending.length) groups.push({ members: pending, segment: "" });

  for (const group of groups) {
    if (!RAW_POSITIONAL.test(group.segment)) continue;
    for (const label of group.members) {
      if (label.word === null) continue;
      const named = new RegExp("[" + QUOTES + "]" + label.word + "[" + QUOTES + "]").test(stripComments(decisions));
      if (named) continue;
      const line = code.slice(0, sw.offset + label.start).split("\n").length;
      bad = true;
      console.log(
        cli + ":" + line + ": `case " + DQ + label.word + DQ + "` reads sub[1] as user data but " +
        decisionsPath + " never names " + DQ + label.word + DQ +
        " - telemetryCommandName() will emit `" + label.word + ":<whatever the user typed>` as the event name"
      );
    }
  }
}
process.exit(bad ? 1 : 0);

' -- "$@"
```

## Fix

Record the decision in `command-name.ts` next to the others — for a data
positional, add the word so the command reports under its bare name:

```ts
const COMMANDS_WITH_DATA_SECOND_POSITIONAL: readonly string[] = ["push", "<your-new-command>"];
```
