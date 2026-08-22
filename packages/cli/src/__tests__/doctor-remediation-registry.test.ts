import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TOP_LEVEL_COMMANDS } from "../utils/shared/did-you-mean.js";
import {
  type Remediation,
  remediations,
} from "../utils/shared/doctor-remediation.js";

/**
 * A user with one single-cause defect ran five commands, three of which were
 * the CLI misdirecting them: `wraps email doctor` recommended `--cleanup`
 * (structurally a no-op for every failure it could report), and every
 * pipeline finding named `wraps email upgrade` (an interactive menu, not a
 * reconcile) from a single `UPGRADE_HINT` const interpolated sixteen times.
 *
 * This guards the class: remediation text lives in ONE registry, and every
 * `wraps` command a remediation names is actually routed by cli.ts.
 *
 * It deliberately does NOT check that a command can *repair* the failure it
 * is attached to. That is a semantic property of a Pulumi `up` against live
 * AWS and is not checkable in a unit test. Command existence alone would
 * have passed on the buggy code — `wraps email upgrade` and
 * `wraps email doctor --cleanup` are both real, routed commands. So this
 * catches typos and unowned hint constants, and nothing more. Do not read it
 * as proof that a hint is correct.
 */

const SRC_DIR = join(import.meta.dirname, "..");

const cliSource = readFileSync(join(SRC_DIR, "cli.ts"), "utf-8");

/**
 * cli.ts dispatches in three layers: a global `switch (primaryCommand)`, a set
 * of `if (primaryCommand === "x")` service blocks each holding a
 * `switch (subCommand)`, and nested `switch (<x>SubCommand)` switches beneath
 * some of those cases.
 *
 * Regexing every `case "...":` label out of the whole file flattened all three
 * into one 62-entry bag, so `sync` — an `email` subcommand — read as a routed
 * top-level command. That is precisely the mistake these invariants exist to
 * catch: adding `sync` to TOP_LEVEL_COMMANDS made `wraps snyc` suggest
 * `wraps sync`, which reaches the `default:` branch and throws
 * `Unknown command: sync`. So the dispatch tree is walked by structure
 * instead, and the layers are kept apart: `routed` is what the suggester may
 * propose, `routedPaths` is the full command paths a remediation may name.
 */

type Region = { from: number; to: number };

/** Index of the `}` closing a body whose first character is at `start`. */
function closingBrace(source: string, start: number): number {
  let depth = 1;
  for (let index = start; index < source.length; index++) {
    const char = source[index];
    if (char === "{") {
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

/** Body of the first switch whose header matches, searched inside `within`. */
function switchBody(
  source: string,
  header: RegExp,
  within: Region
): Region | null {
  const match = header.exec(source.slice(within.from, within.to));
  if (!match) {
    return null;
  }
  const from = within.from + match.index + match[0].length;
  const to = closingBrace(source, from);
  return to === -1 || to > within.to ? null : { from, to };
}

const CASE_LABEL = /^case "([a-z-]+)":/;

/**
 * `case "x":` labels at the top level of a switch body, each with the region
 * it dispatches. Brace depth is what keeps a nested switch's labels out.
 */
function caseLabels(
  source: string,
  body: Region
): { label: string; region: Region }[] {
  const labels: { label: string; region: Region }[] = [];
  let depth = 0;
  for (let index = body.from; index < body.to; index++) {
    const char = source[index];
    if (char === "{") {
      depth++;
    } else if (char === "}") {
      depth--;
    } else if (depth === 0 && source.startsWith('case "', index)) {
      const match = CASE_LABEL.exec(source.slice(index, index + 32));
      if (match) {
        const previous = labels.at(-1);
        if (previous) {
          previous.region.to = index;
        }
        labels.push({
          label: match[1],
          region: { from: index + match[0].length, to: body.to },
        });
        index += match[0].length - 1;
      }
    }
  }
  return labels;
}

const GLOBAL_SWITCH = /switch \(primaryCommand\) \{/;
const SERVICE_BLOCK = /if \(primaryCommand === "([a-z-]+)"[^{]*\{/g;
const SUB_SWITCH = /switch \(subCommand\) \{/;
const NESTED_SWITCH = /switch \(\w+SubCommand\) \{/;

function parseDispatch(source: string): {
  topLevel: Set<string>;
  paths: Set<string>;
} {
  /** Every region a top-level command dispatches from; `email` has two. */
  const regions = new Map<string, Region[]>();
  const record = (command: string, region: Region) => {
    const existing = regions.get(command);
    if (existing) {
      existing.push(region);
    } else {
      regions.set(command, [region]);
    }
  };

  const globalSwitch = switchBody(source, GLOBAL_SWITCH, {
    from: 0,
    to: source.length,
  });
  if (globalSwitch) {
    for (const { label, region } of caseLabels(source, globalSwitch)) {
      record(label, region);
    }
  }
  for (const match of source.matchAll(SERVICE_BLOCK)) {
    const from = (match.index ?? 0) + match[0].length;
    const to = closingBrace(source, from);
    if (to !== -1) {
      record(match[1], { from, to });
    }
  }

  const topLevel = new Set(regions.keys());
  const paths = new Set(topLevel);
  for (const [command, commandRegions] of regions) {
    for (const commandRegion of commandRegions) {
      const sub = switchBody(source, SUB_SWITCH, commandRegion);
      if (!sub) {
        continue;
      }
      for (const { label, region } of caseLabels(source, sub)) {
        paths.add(`${command} ${label}`);
        const nested = switchBody(source, NESTED_SWITCH, region);
        if (!nested) {
          continue;
        }
        for (const leaf of caseLabels(source, nested)) {
          paths.add(`${command} ${label} ${leaf.label}`);
        }
      }
    }
  }
  return { topLevel, paths };
}

const { topLevel: routed, paths: routedPaths } = parseDispatch(cliSource);

/**
 * Every factory takes zero or one argument, and the single-argument ones take
 * either a string (a domain, an SSO login command) or a string[] (profile
 * names). Trying the string and falling back to the array keeps the registry
 * enumerable instead of hand-listed, so a factory added tomorrow is covered
 * by these invariants today.
 */
function invokeFactory(factory: (arg: unknown) => Remediation): Remediation {
  try {
    return factory("placeholder");
  } catch {
    return factory(["placeholder-a", "placeholder-b"]);
  }
}

const entries = Object.entries(remediations).map(([name, factory]) => ({
  name,
  remediation: invokeFactory(factory as (arg: unknown) => Remediation),
}));

/**
 * The doctor sources that are only allowed to name a repair command by way of
 * the registry. Paths are relative to `src/`.
 */
const SCANNED = [
  "utils/email/event-pipeline-check.ts",
  "commands/email/doctor.ts",
  "commands/aws/doctor.ts",
  "commands/doctor.ts",
];

/** Hint text that used to be hand-written into findings, one file at a time. */
const BANNED = [
  "wraps email upgrade",
  "wraps email sync",
  "wraps email domains add",
  "wraps email doctor --cleanup",
  "wraps aws setup",
];

/** Line comments explain the hazard; only emitted strings can mislead a user. */
function isComment(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("//") || trimmed.startsWith("*");
}

const ANNOTATION = "remediation:allow-literal";

/**
 * Exceptions are annotated at the call site rather than widened into an
 * allow-list, matching how baseline/architecture.test.ts handles
 * `baseline:allow-no-region`. The one known legitimate case is the
 * `--cleanup`-with-a-Pulumi-stack guard in commands/email/doctor.ts: that
 * message is the flag's own precondition, not a finding's remedy, and the
 * advice it gives is correct.
 */
function annotated(lines: string[], index: number): boolean {
  // The one required exception is a multi-line template argument, so the
  // annotation cannot always sit on the offending line itself.
  return (
    lines[index]?.includes(ANNOTATION) === true ||
    lines[index - 1]?.includes(ANNOTATION) === true
  );
}

/**
 * Commands that are not ours are skipped by design: `ssoLogin` carries an
 * `aws sso login ...` line produced by getSSOLoginCommand(), and cli.ts has no
 * opinion about the AWS CLI's own verbs.
 */
function unroutedCommands(candidates: readonly Remediation[]): string[] {
  return candidates.flatMap((remediation) => {
    const command = remediation.command;
    if (!command?.startsWith("wraps ")) {
      return [];
    }
    const path = command.split(" --")[0].trim().split(/\s+/).slice(1).join(" ");
    return routedPaths.has(path) ? [] : [`${remediation.id} — "${command}"`];
  });
}

describe("doctor remediation registry", () => {
  it("finds routed command names in cli.ts (guards the extraction itself)", () => {
    // A band, not a floor: the flat version sat at 62 with 41 slots of slack,
    // so a partial restructure could have halved it without tripping anything.
    // Too few means the walk lost the dispatch; too many means it started
    // scooping subcommands back up.
    expect(routed.size).toBeGreaterThanOrEqual(20);
    expect(routed.size).toBeLessThanOrEqual(25);
    expect(routedPaths.size).toBeGreaterThan(60);
  });

  it("counts registry entries (guards the extraction itself)", () => {
    // Derived from the registry, never a literal count, so adding a
    // remediation does not require editing this number.
    expect(entries.length).toBeGreaterThan(10);
  });

  it("every wraps command a remediation names is routed by cli.ts", () => {
    const violations = unroutedCommands(entries.map((e) => e.remediation));

    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("rejects a remediation naming a command path cli.ts does not dispatch", () => {
    // `wraps sms doctor` is word-soup-plausible — `sms` and `doctor` are both
    // routed words — but cli.ts's sms block has no `doctor` case, so running it
    // prints `Unknown sms command`. Checking words independently cannot see that.
    const violations = unroutedCommands([
      {
        id: "fixture.unrouted-path",
        level: "auto",
        command: "wraps sms doctor",
        summary: "fixture",
      },
    ]);

    expect(violations).toHaveLength(1);
  });

  it("informational remediations carry no command", () => {
    // "informational" means there is nothing to run; a command on one of these
    // rows would be rendered as advice the user cannot act on.
    const offenders = entries
      .filter(
        ({ remediation }) =>
          remediation.level === "informational" && remediation.command
      )
      .map(({ name }) => name);

    expect(offenders, offenders.join(", ")).toEqual([]);
  });

  it("rejects a TOP_LEVEL_COMMANDS entry that is only a service subcommand", () => {
    // The mutation this invariant has to catch: `sync` is an `email`
    // subcommand, so it looks routed to any check that reads `case` labels out
    // of the whole file. cli.ts's global switch has no `case "sync"`, so
    // `wraps snyc` would suggest `wraps sync`, which then throws
    // `Unknown command: sync` — the incident the suggester exists to prevent.
    const unrouted = [...TOP_LEVEL_COMMANDS, "sync"].filter(
      (command) => !routed.has(command)
    );

    expect(unrouted).toEqual(["sync"]);
  });

  it("every TOP_LEVEL_COMMANDS entry is routed by cli.ts", () => {
    // The suggester's docstring claims this list is the CLI's routed commands.
    // Suggesting a command cli.ts does not dispatch would repeat the incident
    // in a new place.
    const unrouted = TOP_LEVEL_COMMANDS.filter(
      (command) => !routed.has(command)
    );

    expect(unrouted, unrouted.join(", ")).toEqual([]);
  });

  it("every command cli.ts routes is in TOP_LEVEL_COMMANDS", () => {
    // The list has a second consumer: telemetryCommandName (telemetry/
    // command-name.ts) gates the reported event name on membership, so the
    // list is now load-bearing for telemetry identity, not just for
    // did-you-mean. A `case "migrate":` added to cli.ts's global switch and
    // not to the list reports `command:unknown` on every run, success and
    // failure alike, and `error:occurred` carries `command: "unknown"` — the
    // command reads as unused in the dashboard and nothing here goes red.
    const unlisted = [...routed].filter(
      (command) => !(TOP_LEVEL_COMMANDS as readonly string[]).includes(command)
    );

    expect(unlisted, unlisted.join(", ")).toEqual([]);
  });

  it("rejects a routed command missing from TOP_LEVEL_COMMANDS", () => {
    // The assertion above is vacuously green while the two sets match, so this
    // pins its catching power: the mutation it has to see is a new routed
    // command that never reached did-you-mean.ts.
    const unlisted = [...routed, "migrate"].filter(
      (command) => !(TOP_LEVEL_COMMANDS as readonly string[]).includes(command)
    );

    expect(unlisted).toEqual(["migrate"]);
  });
});

describe("doctor sources carry no hint text of their own", () => {
  it.each(SCANNED)("scans %s (a rename must not silence the scan)", (rel) => {
    expect(existsSync(join(SRC_DIR, rel))).toBe(true);
  });

  it("no doctor source file carries its own hint text", () => {
    // One UPGRADE_HINT const interpolated sixteen times is what made a single
    // wrong sentence reach nine resource classes. Remedies come from the
    // registry now; a literal here is that const growing back.
    const offenders = SCANNED.flatMap((rel) => {
      const lines = readFileSync(join(SRC_DIR, rel), "utf-8").split("\n");
      return lines.flatMap((line, index) => {
        if (isComment(line) || annotated(lines, index)) {
          return [];
        }
        return BANNED.some((hint) => line.includes(hint))
          ? [`${rel}:${index + 1}`]
          : [];
      });
    });

    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

/**
 * The unknown-command `default:` branch is the suggester's only call site, and
 * `did-you-mean.test.ts` proves nothing about it — deleting the call leaves all
 * 1801 CLI tests green, so `wraps docter` could silently go back to printing a
 * bare `Unknown command: docter`, which is step 1 of the incident this feature
 * exists to prevent.
 *
 * cli.ts parses real `process.argv` and calls `run()` at module load, so it
 * cannot be imported and driven as a function. That is the same situation the
 * telemetry guard in `json-contract.test.ts` was written for, so this follows
 * that pattern: read cli.ts's text, isolate the unknown-command branch, and
 * assert the suggestion is still wired into it.
 */
// Structure, not a verbatim line: the first two arguments are load-bearing —
// they are what makes this the unknown-*command* rejection for the command the
// user typed — while the third is a local whose name carries no meaning.
// Renaming `hint` must not fail a suggester guard.
const BRANCH_END =
  /throw errors\.unknownCommand\(\s*"command"\s*,\s*primaryCommand\s*,/;

function findBranchEnd(source: string, from: number): number {
  if (from === -1) {
    return -1;
  }
  const offset = source.slice(from).search(BRANCH_END);
  return offset === -1 ? -1 : from + offset;
}

describe("unknown-command branch asks the suggester (source guard)", () => {
  // Collapse whitespace so a reformat — different wrapping or indentation —
  // cannot fail this.
  const collapsed = cliSource.replace(/\s+/g, " ");

  // The branch no longer prints its own error or throws a bare Error — it
  // builds a suggestion and hands the whole rejection to the errors registry.
  // BRANCH_START is anchored on the tail of the preceding `case`, which
  // survives the change and sits ABOVE the suggester call — so the assertions
  // below are not matching their own marker.
  const BRANCH_START = "showHelp(); break; default: {";
  const startIndex = collapsed.indexOf(BRANCH_START);
  // Search from startIndex: `throw errors.unknownCommand(` appears at
  // seventeen earlier sites, and a search from 0 would find one of those and
  // collapse the branch to an empty string.
  const endIndex = findBranchEnd(collapsed, startIndex);
  const branch =
    startIndex === -1 || endIndex <= startIndex
      ? ""
      : collapsed.slice(startIndex, endIndex);

  it("locates the unknown-command branch in cli.ts (guards the extraction itself)", () => {
    // If either marker stops matching, `branch` is empty and every assertion
    // below passes vacuously.
    expect(startIndex).toBeGreaterThan(-1);
    expect(endIndex).toBeGreaterThan(startIndex);
    expect(branch).not.toBe("");
  });

  it("imports the suggester", () => {
    expect(collapsed).toContain(
      'import { suggestCommand } from "./utils/shared/did-you-mean.js";'
    );
  });

  it("asks the suggester about the command the user typed", () => {
    expect(branch).toContain("suggestCommand(primaryCommand)");
  });

  it("prints the suggestion it gets back", () => {
    // Calling the suggester and dropping the answer would leave the user with
    // the same bare error the feature was built to replace.
    expect(branch).toContain("Did you mean");
  });

  // Regression guard for the guard: BRANCH_END used to pin the third
  // argument's name, so renaming a local variable failed this file for a
  // refactor that changed no behaviour. Driven off fixtures the test owns, not
  // off a mutation of the real cli.ts — a mutation stops mutating anything the
  // moment somebody actually performs the rename, and then asserts against
  // unmutated source.
  it.each(["hint", "suggestionHint", "didYouMeanHint"])(
    "finds the branch end whatever the third argument's local is named (%s)",
    (name) => {
      const fixture = `${BRANCH_START} const didYouMean = suggestCommand(primaryCommand); const ${name} = "Did you mean"; throw errors.unknownCommand("command", primaryCommand, ${name}); } }`;
      expect(
        findBranchEnd(fixture, fixture.indexOf(BRANCH_START))
      ).toBeGreaterThan(-1);
    }
  );

  it("rejects an unknown-command throw for a different surface (negative control)", () => {
    // The first two arguments stay load-bearing: a sibling site rejecting an
    // `email` sub-command must not be mistaken for the top-level branch end.
    const fixture = `${BRANCH_START} throw errors.unknownCommand("email command", subCommand, hint); } }`;
    expect(findBranchEnd(fixture, fixture.indexOf(BRANCH_START))).toBe(-1);
  });
});
