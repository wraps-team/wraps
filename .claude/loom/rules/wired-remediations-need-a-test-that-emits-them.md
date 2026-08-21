---
name: wired-remediations-need-a-test-that-emits-them
severity: serious
origin: doctor-self-healing — Two Chunk 2 remediation-table rows are wired in production but asserted by no test
applies-to: "packages/cli/src/**/*.ts"
---

## What

Every factory in the `remediations` registry that a doctor source actually
calls must be named by at least one test outside the registry's own two test
files.

## Why

`packages/cli/src/utils/email/event-pipeline-check.ts:232` attaches
`remediations.duplicateRuleTargets()` to the duplicate-EventBridge-target warn.
Deleting that `remediation:` property left the entire 1817-test CLI suite green
(`0c5f8a91`), so a refactor could silently strip the only hint a user gets for
a rule that delivers every event twice — the exact condition of the original
incident (3× the same SQS ARN on one rule). `remediations.dlqBacklog()` was in
the same state, held only by a summary-text match on rendered doctor output.
`f5153ec9` found two more: `awsEnvVarsIncomplete()` and `setAwsRegion()` were
referenced by `commands/aws/doctor.ts` and by nothing else, and deleting all
three `remediation:` properties from that file left 48 doctor tests passing.

The registry's own guards cannot see this. `doctor-remediation-registry.test.ts`
asserts generic properties of the registry (every `wraps` command is routed, no
informational row carries a command), and `doctor-remediation.test.ts` builds
findings by hand — both pass with a factory that no check ever emits. So the
question "is this row asserted anywhere?" has to be asked of the wiring, which
is what this check does: it enumerates the registry, greps the four doctor
sources for which factories are wired, then greps the CLI test tree for each
wired one. A factory added tomorrow is covered the day it is added, with no
list to maintain.

Evidence is deliberately coarse — a test naming the factory, its `id`, or the
literal command it builds all count, because the useful assertion shape varies
(`toEqual(remediations.installAwsCli())`, `remediation?.id).toBe("aws.profile")`,
`remediation?.command).toBe("wraps email sync --region us-east-1")`). It is a
mention, not a proof: a mention inside a comment satisfies it too. One row
rests on exactly that today — `ssoLogin`'s command is supplied by
`getSSOLoginCommand()`, so its only textual link to
`packages/cli/src/commands/__tests__/aws-doctor.test.ts` (which does assert the
row, at :308) is the comment at :227. Re-wording that comment will trip this
check; the fix is to assert `remediation?.id` there, not to widen the check.

## Check

```bash
# Receives candidate file paths as "$@". Exit 0 = clean, non-zero = violated.
node -e '
const fs = require("node:fs");
const path = require("node:path");

const CLI_SRC = "packages/cli/src";
const REGISTRY = CLI_SRC + "/utils/shared/doctor-remediation.ts";
const SCANNED = [
  CLI_SRC + "/utils/email/event-pipeline-check.ts",
  CLI_SRC + "/commands/email/doctor.ts",
  CLI_SRC + "/commands/aws/doctor.ts",
  CLI_SRC + "/commands/doctor.ts",
];
// The registry own tests build findings by hand; referencing a factory there
// proves the factory works, never that any check emits it.
const NOT_EVIDENCE = [
  CLI_SRC + "/utils/shared/__tests__/doctor-remediation.test.ts",
  CLI_SRC + "/__tests__/doctor-remediation-registry.test.ts",
];

const norm = (p) => p.replace(/^\.\//, "");
const candidates = process.argv.slice(1).map(norm);
const relevant = candidates.some(
  (f) =>
    f === REGISTRY ||
    SCANNED.includes(f) ||
    (f.startsWith(CLI_SRC) && /\.test\.tsx?$/.test(f))
);
if (!relevant) process.exit(0);

let registry;
try { registry = fs.readFileSync(REGISTRY, "utf8"); } catch { process.exit(0); }

const openMatch = /export const remediations = \{/.exec(registry);
if (!openMatch) {
  console.log(REGISTRY + ":1: cannot locate the remediations registry - this check cannot run");
  process.exit(1);
}
let depth = 1, start = openMatch.index + openMatch[0].length, end = registry.length;
for (let i = start; i < registry.length; i++) {
  const c = registry[i];
  if (c === "{") depth++;
  else if (c === "}") { depth--; if (depth === 0) { end = i; break; } }
}
const body = registry.slice(start, end);

const factories = [];
const FACTORY = /(^|\n)  ([A-Za-z_$][\w$]*)\s*:\s*\(/g;
let m;
while ((m = FACTORY.exec(body))) {
  const from = m.index + m[0].length;
  const next = body.slice(from).search(/\n  [A-Za-z_$][\w$]*\s*:\s*\(/);
  const chunk = body.slice(from, next === -1 ? body.length : from + next);
  const id = /\bid:\s*[\x22\x27\x60]([^\x22\x27\x60]+)[\x22\x27\x60]/.exec(chunk);
  const command = /\bcommand:\s*(?:withRegion\(\s*)?[\x22\x27\x60]([^\x22\x27\x60$]*)/.exec(chunk);
  factories.push({
    name: m[2],
    id: id ? id[1] : null,
    command: command && command[1].trim().length > 0 ? command[1] : null,
  });
}
if (factories.length === 0) {
  console.log(REGISTRY + ":1: parsed no remediation factories - this check cannot run");
  process.exit(1);
}

const read = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { return ""; } };
const wiredSources = SCANNED.map((p) => ({ path: p, text: read(p) }));

function walk(dir, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== "node_modules") walk(full, out); }
    else if (/\.test\.tsx?$/.test(entry.name) && !NOT_EVIDENCE.includes(full)) out.push(full);
  }
  return out;
}
const tests = walk(CLI_SRC, []).map((p) => read(p));
if (tests.length === 0) {
  console.log(CLI_SRC + ": found no test files - this check cannot run");
  process.exit(1);
}

let bad = false;
for (const factory of factories) {
  const call = "remediations." + factory.name + "(";
  const wiredIn = wiredSources.filter((s) => s.text.includes(call)).map((s) => s.path);
  if (wiredIn.length === 0) continue;
  const covered = tests.some(
    (text) =>
      text.includes(call) ||
      (factory.id !== null && text.includes(factory.id)) ||
      (factory.command !== null && text.includes(factory.command))
  );
  if (covered) continue;
  bad = true;
  console.log(
    REGISTRY + ": remediations." + factory.name + " (id " + (factory.id ?? "?") +
    ") is wired in " + wiredIn.join(", ") + " but no test under " + CLI_SRC +
    " names it - the row ships unasserted"
  );
}
process.exit(bad ? 1 : 0);
' -- "$@"
```

## Fix

Assert the remediation from the check that produces it, by id, in the test for
that check:

```ts
expect(dupCheck?.remediation?.id).toBe("email.duplicate-rule-targets");
```
