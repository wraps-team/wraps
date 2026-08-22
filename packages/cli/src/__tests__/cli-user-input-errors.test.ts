import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `wraps email verify` (no --domain) printed a correct, specific message and
 * then contradicted it: "An unexpected error occurred", the same message
 * again, and an invitation to file a GitHub issue about the user's own typo —
 * because the branch threw a bare `Error`, which falls through
 * handleCLIError's generic tail and is reported as UNHANDLED_ERROR. All 23
 * rejection sites in cli.ts did this. `wraps doctr` was worse: the
 * "Did you mean wraps doctor?" line was immediately buried under the crash
 * block.
 *
 * This guards the class: a rejection in cli.ts is expressed as an error from
 * the `errors` registry, and the site does not also print the message itself.
 * The second half is not tidiness — an unguarded clack.log.error writes to
 * stdout ahead of the JSON envelope, so `--json` consumers were parsing human
 * text and an envelope out of one stream.
 *
 * cli.ts parses real `process.argv` and calls `run()` at module load, so it
 * cannot be imported and driven as a function; it is also excluded from
 * coverage in vitest.config.ts. A source-text scan is the only cover the 23
 * conversions get.
 *
 * It deliberately does NOT prove the message a site throws is a good one, and
 * it is scoped to cli.ts: 106 non-test `throw new Error(` sites exist across
 * packages/cli/src and most of them are genuine system errors, not user
 * input. Extracting a branch into commands/<x>/index.ts would evade this
 * scan — that is a known limit, not an oversight.
 */

const SRC_DIR = join(import.meta.dirname, "..");
const CLI_PATH = join(SRC_DIR, "cli.ts");
const cliSource = readFileSync(CLI_PATH, "utf-8");

/**
 * The unknown-command branch's throw, located by structure rather than by a
 * verbatim line: the first two arguments are pinned, the third is a local
 * whose name carries no meaning.
 */
const UNKNOWN_COMMAND_THROW =
  /throw errors\.unknownCommand\(\s*"command"\s*,\s*primaryCommand\s*,/;

function findUnknownCommandThrow(source: string, from: number): number {
  if (from === -1) {
    return -1;
  }
  const offset = source.slice(from).search(UNKNOWN_COMMAND_THROW);
  return offset === -1 ? -1 : from + offset;
}

const ANNOTATION = "cli-honest:allow-direct-error";

/** Line comments explain hazards; only emitted code can mislead a user. */
function isComment(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("//") || trimmed.startsWith("*");
}

/**
 * Exceptions are annotated at the call site rather than widened into an
 * allow-list, matching `baseline:allow-no-region` in
 * baseline/architecture.test.ts. The annotation is accepted on the offending
 * line or the line above it, because these calls wrap across lines.
 */
function annotated(lines: string[], index: number): boolean {
  return (
    lines[index]?.includes(ANNOTATION) === true ||
    lines[index - 1]?.includes(ANNOTATION) === true
  );
}

function offenders(source: string, needle: string): string[] {
  const lines = source.split("\n");
  return lines.flatMap((line, index) => {
    if (isComment(line) || annotated(lines, index)) {
      return [];
    }
    return line.includes(needle) ? [`cli.ts:${index + 1}`] : [];
  });
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("cli.ts rejects bad input through the errors registry", () => {
  it("scans cli.ts (a rename must not silence the scan)", () => {
    expect(existsSync(CLI_PATH)).toBe(true);
  });

  it("finds registry rejections to guard (guards the extraction itself)", () => {
    // A band, not a floor: 23 sites today. If this drops to 0 the search
    // string stopped matching and every assertion here is vacuous; if it
    // climbs past 40, cli.ts grew a dispatch layer this guard has not been
    // read against.
    const registryThrows = countOccurrences(cliSource, "throw errors.");
    expect(registryThrows).toBeGreaterThanOrEqual(18);
    expect(registryThrows).toBeLessThanOrEqual(40);
  });

  it("imports the registry alongside the handler", () => {
    expect(cliSource).toContain(
      'import { errors, handleCLIError } from "./utils/shared/errors.js";'
    );
  });

  // TRACER (TDD unit 9). The two file-wide totals below only go green once all
  // 23 sites are converted; this one goes green on the FIRST converted site, so
  // the chunk has a signal before the sweep instead of after it. Do not drop it.
  it("converts the unknown-command branch and stops it printing its own error", () => {
    const collapsed = cliSource.replace(/\s+/g, " ");
    const start = collapsed.indexOf("showHelp(); break; default: {");
    const end = findUnknownCommandThrow(collapsed, start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(collapsed.slice(start, end)).not.toContain("clack.log.error(");
  });

  // Regression guard for the guard: the anchor used to pin the third
  // argument's name, so renaming a local failed this file for a refactor that
  // changed no behaviour. The first two arguments stay pinned — they are what
  // identifies this as the unknown-command rejection. Driven off fixtures the
  // test owns rather than a mutation of the real cli.ts: a `replace` of the
  // real text stops mutating anything once the rename is actually performed,
  // and the assertion then runs against unmutated source.
  it.each(["hint", "suggestionHint", "didYouMeanHint"])(
    "finds that branch's throw whatever the third argument's local is named (%s)",
    (name) => {
      const fixture = `showHelp(); break; default: { const ${name} = "Did you mean"; throw errors.unknownCommand("command", primaryCommand, ${name}); } }`;
      const start = fixture.indexOf("showHelp(); break; default: {");
      expect(findUnknownCommandThrow(fixture, start)).toBeGreaterThan(start);
    }
  );

  it("rejects an unknown-command throw for a different surface (negative control)", () => {
    const fixture =
      'showHelp(); break; default: { throw errors.unknownCommand("email command", subCommand, hint); } }';
    const start = fixture.indexOf("showHelp(); break; default: {");
    expect(findUnknownCommandThrow(fixture, start)).toBe(-1);
  });

  it("throws no bare Error, which would be reported as a crash", () => {
    const found = offenders(cliSource, "throw new Error(");
    expect(found, found.join("\n")).toEqual([]);
  });

  it("prints the rejection once, from the renderer, not also from the call site", () => {
    const found = offenders(cliSource, "clack.log.error(");
    expect(found, found.join("\n")).toEqual([]);
  });

  it("catches a bare throw fed through the same scan (negative control)", () => {
    const found = offenders(
      'const x = 1;\nthrow new Error("boom");\n',
      "throw new Error("
    );
    expect(found).toHaveLength(1);
  });

  it("lets an annotated call site through (negative control)", () => {
    const found = offenders(
      `// ${ANNOTATION} — fixture\nthrow new Error("boom");\n`,
      "throw new Error("
    );
    expect(found).toEqual([]);
  });
});

/**
 * Everything above counts rejections and proves absences. None of it reads the
 * ARGUMENTS a site passes, and that hole is not theoretical: replacing
 * `errors.missingInput("--domain", "wraps email verify --domain yourapp.com")`
 * with `errors.unknownCommand("command", primaryCommand, "")`, and a second
 * site's arguments with `errors.missingInput("", "")`, left all 1865 tests in
 * this package green. `wraps email verify` with no --domain would have printed
 * "Unknown command: email" with an empty suggestion block and reported
 * UNKNOWN_COMMAND for a missing-flag condition, and `wraps email domains
 * verify` would have printed " is required" / "Usage: ".
 *
 * The per-site messages ARE the deliverable of this feature, so they are read
 * here two ways: a shape check that no site can pass a blank or non-runnable
 * argument, and a full inventory that pins which factory each command reaches
 * for. Adding a command means adding a row below — deliberately, because a new
 * rejection message is a user-visible string someone should have read.
 */

type RegistryCall = {
  factory: string;
  args: string[];
  line: number;
  rendered: string;
};

/**
 * Blanks comments while preserving offsets, so line numbers survive and a
 * commented-out call cannot be mistaken for a live one. cli.ts contains no
 * regex literals (checked); a `/`-delimited regex holding a quote would need
 * this to grow a regex state.
 */
function stripComments(source: string): string {
  let out = "";
  let index = 0;
  let state: "code" | "line" | "block" | "string" = "code";
  let quote = "";

  while (index < source.length) {
    const char = source[index] as string;
    const next = source[index + 1];

    if (state === "code") {
      if (char === "/" && next === "/") {
        state = "line";
        out += "  ";
        index += 2;
      } else if (char === "/" && next === "*") {
        state = "block";
        out += "  ";
        index += 2;
      } else {
        if (char === '"' || char === "'" || char === "`") {
          state = "string";
          quote = char;
        }
        out += char;
        index += 1;
      }
      continue;
    }

    if (state === "string") {
      if (char === "\\") {
        out += source.slice(index, index + 2);
        index += 2;
        continue;
      }
      if (char === quote) {
        state = "code";
      }
      out += char;
      index += 1;
      continue;
    }

    if (state === "line") {
      if (char === "\n") {
        state = "code";
        out += char;
        index += 1;
        continue;
      }
      out += " ";
      index += 1;
      continue;
    }

    if (char === "*" && next === "/") {
      state = "code";
      out += "  ";
      index += 2;
      continue;
    }
    out += char === "\n" ? char : " ";
    index += 1;
  }

  return out;
}

/** Splits an argument list on commas that are not inside a string or nested call. */
function splitArgs(body: string): string[] {
  const args: string[] = [];
  let current = "";
  let depth = 0;
  let quote = "";

  for (let index = 0; index < body.length; index += 1) {
    const char = body[index] as string;

    if (quote) {
      if (char === "\\") {
        current += body.slice(index, index + 2);
        index += 1;
        continue;
      }
      if (char === quote) {
        quote = "";
      }
      current += char;
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      current += char;
      continue;
    }
    if (char === "(" || char === "[" || char === "{") {
      depth += 1;
    }
    if (char === ")" || char === "]" || char === "}") {
      depth -= 1;
    }
    if (char === "," && depth === 0) {
      args.push(current.trim().replace(/\s+/g, " "));
      current = "";
      continue;
    }
    current += char;
  }

  if (current.trim()) {
    args.push(current.trim().replace(/\s+/g, " "));
  }
  return args;
}

function registryCalls(source: string): RegistryCall[] {
  const code = stripComments(source);
  const pattern = /throw errors\.([A-Za-z0-9_]+)\(/g;
  const calls: RegistryCall[] = [];
  let match = pattern.exec(code);

  while (match) {
    let index = pattern.lastIndex;
    let depth = 1;
    let quote = "";
    let body = "";

    while (index < code.length) {
      const char = code[index] as string;
      if (quote) {
        if (char === "\\") {
          body += code.slice(index, index + 2);
          index += 2;
          continue;
        }
        if (char === quote) {
          quote = "";
        }
      } else if (char === '"' || char === "'" || char === "`") {
        quote = char;
      } else if (char === "(") {
        depth += 1;
      } else if (char === ")") {
        depth -= 1;
        if (depth === 0) {
          break;
        }
      }
      body += char;
      index += 1;
    }

    const args = splitArgs(body);
    const factory = match[1] as string;
    calls.push({
      factory,
      args,
      line: code.slice(0, match.index).split("\n").length,
      rendered: `${factory}(${args.join(", ")})`,
    });
    match = pattern.exec(code);
  }

  return calls;
}

/** The value of a plain double-quoted literal, or undefined for anything else. */
function literal(arg: string | undefined): string | undefined {
  if (arg === undefined || !(arg.startsWith('"') && arg.endsWith('"'))) {
    return undefined;
  }
  return arg.slice(1, -1).replaceAll("\\n", "\n").replaceAll('\\"', '"');
}

const CALLS = registryCalls(cliSource);

const BARE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * The inventory row for one call. Literal arguments are pinned exactly — they
 * are the user-visible strings this inventory exists to make somebody read.
 * A third argument that is a bare identifier is rendered `<local>` instead: per
 * the branch rule, the suggestion is either a string literal listing commands
 * or a suggestion built into a local just above the throw, and which of those
 * it is IS load-bearing while the local's spelling is not. Pinning the spelling
 * failed this file for a pure rename of `hint`. `call.rendered` keeps the real
 * text, so assertion labels still name the variable.
 */
function inventoryLine(call: RegistryCall): string {
  const args = call.args.map((arg, index) =>
    index === 2 && BARE_IDENTIFIER.test(arg) ? "<local>" : arg
  );
  return `${call.factory}(${args.join(", ")})`;
}

/**
 * Every rejection cli.ts can raise, as written. Renders as
 * `factory(arg, arg, ...)` with the source text of each argument, so a diff
 * names the command whose message moved.
 */
const EXPECTED_REJECTIONS = [
  'missingInput("--domain", "wraps email verify --domain yourapp.com")',
  'unknownCommand("inbound command", inboundSubCommand, "Available commands: init, destroy, status, verify, test, add, remove")',
  'unknownCommand("agent command", agentSubCommand, "Available commands: create, list, kill")',
  'unknownCommand("reply command", replySubCommand, "Available commands: init, rotate, status, destroy, decode")',
  'missingInput("--domain", "wraps email domains verify --domain yourapp.com")',
  'missingInput("--domain", "wraps email domains get-dkim --domain yourapp.com")',
  'missingInput("--domain", "wraps email domains remove --domain yourapp.com --force")',
  'unknownCommand("domains command", domainsSubCommand, "Available commands: add, list, verify, get-dkim, remove, config")',
  'unknownCommand("templates command", templatesSubCommand, "Available commands: init, push, preview")',
  'unknownCommand("workflows command", workflowsSubCommand, "Available commands: init, validate, push")',
  'missingInput("<message-id>", "wraps email logs get <message-id>")',
  'unknownCommand("logs command", logsSubCommand, "Available commands: list, get <message-id>")',
  'unknownCommand("email command", subCommand, "Run wraps --help for available commands.")',
  'unknownCommand("license command", subCommand, "Run wraps --help for available commands.")',
  'unknownCommand("selfhost command", subCommand, "Run wraps --help for available commands.")',
  'unknownCommand("sms command", subCommand, "Run wraps --help for available commands.")',
  'unknownCommand("cdn command", subCommand, "Run wraps --help for available commands.")',
  'unknownCommand("workflow command", subCommand, "Available commands: init\\n\\nRun wraps --help for more information.")',
  'unknownCommand("platform command", subCommand, "Available commands: connect, update-role\\n\\nRun wraps platform for more information.")',
  'unknownCommand("auth command", subCommand, "Available commands: login, status, logout")',
  'unknownCommand("aws command", subCommand, "Available commands: setup, doctor\\n\\nRun wraps --help for more information.")',
  'unknownCommand("telemetry command", subCommand, "Available commands: enable, disable, status")',
  'unknownCommand("command", primaryCommand, <local>)',
];

describe("cli.ts rejections say something usable", () => {
  it("reads arguments out of cli.ts at all (negative control)", () => {
    const fixture = [
      '// throw errors.missingInput("--commented", "wraps ignored");',
      'throw errors.missingInput("--domain", "wraps email verify --domain x");',
    ].join("\n");
    const calls = registryCalls(fixture);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.factory).toBe("missingInput");
    expect(calls[0]?.args).toEqual([
      '"--domain"',
      '"wraps email verify --domain x"',
    ]);
  });

  it("finds every registry throw the counting guard counts", () => {
    expect(CALLS.length).toBe(
      countOccurrences(cliSource, "throw errors.") -
        countOccurrences(
          cliSource.split("\n").filter(isComment).join("\n"),
          "throw errors."
        )
    );
  });

  it("names the flag and a runnable command at every missing-input site", () => {
    const sites = CALLS.filter((call) => call.factory === "missingInput");
    expect(sites.length).toBeGreaterThanOrEqual(5);

    for (const site of sites) {
      const what = literal(site.args[0]);
      const usage = literal(site.args[1]);

      // `${what} is required` — blank here prints " is required".
      expect(what, `cli.ts:${site.line} ${site.rendered}`).toBeTruthy();
      // `Usage: ${usage}` — must be a command the user can actually run.
      expect(usage, `cli.ts:${site.line} ${site.rendered}`).toMatch(
        /^wraps \S/
      );
      expect(site.args, `cli.ts:${site.line}`).toHaveLength(2);
    }
  });

  it("names the surface and offers a way forward at every unknown-command site", () => {
    const sites = CALLS.filter((call) => call.factory === "unknownCommand");
    expect(sites.length).toBeGreaterThanOrEqual(15);

    for (const site of sites) {
      const where = `cli.ts:${site.line} ${site.rendered}`;
      expect(site.args, where).toHaveLength(3);
      // `Unknown ${what}: ${typed}` — blank here prints "Unknown : foo".
      expect(literal(site.args[0]), where).toBeTruthy();

      const suggestion = site.args[2] as string;
      if (suggestion.startsWith('"')) {
        expect(literal(suggestion), where).toMatch(
          /Available commands:|--help/
        );
      } else {
        // The only non-literal form allowed is a variable built just above the
        // throw (the top-level `hint`); the tracer test covers that branch.
        expect(suggestion, where).toMatch(/^[A-Za-z_][A-Za-z0-9_]*$/);
      }
    }
  });

  it("routes each command to the factory and message it was specified with", () => {
    expect(CALLS.map(inventoryLine)).toEqual(EXPECTED_REJECTIONS);
  });

  it("pins a literal suggestion but not a local's name (negative control)", () => {
    const [built, literalSuggestion] = registryCalls(
      [
        'throw errors.unknownCommand("command", primaryCommand, renamedHint);',
        'throw errors.unknownCommand("email command", subCommand, "Available commands: add");',
      ].join("\n")
    );

    expect(inventoryLine(built as RegistryCall)).toBe(
      'unknownCommand("command", primaryCommand, <local>)'
    );
    expect(inventoryLine(literalSuggestion as RegistryCall)).toBe(
      'unknownCommand("email command", subCommand, "Available commands: add")'
    );
  });
});
