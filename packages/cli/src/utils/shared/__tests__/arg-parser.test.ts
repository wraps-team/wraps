import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  KNOWN_FLAG_KEYS,
  parseCliArgs,
  resolveNegatableFlag,
} from "../arg-parser.js";

describe("parseCliArgs — --tracking-domain", () => {
  it("parses --tracking-domain as a string flag on domains config", () => {
    const { flags, sub } = parseCliArgs([
      "node",
      "wraps",
      "email",
      "domains",
      "config",
      "--tracking-domain",
      "track.a.com",
    ]);

    expect(flags.trackingDomain).toBe("track.a.com");
    expect(sub).toEqual(["email", "domains", "config"]);
  });
});

describe("parseCliArgs — email production-access", () => {
  it("parses the request flags", () => {
    const { flags, sub } = parseCliArgs([
      "node",
      "wraps",
      "email",
      "production-access",
      "--request",
      "--website",
      "https://x.dev",
      "--mail-type",
      "transactional",
      "--contact",
      "a@x.dev,b@x.dev",
    ]);
    expect(flags.request).toBe(true);
    expect(flags.website).toBe("https://x.dev");
    expect(flags.mailType).toBe("transactional");
    expect(flags.contact).toBe("a@x.dev,b@x.dev");
    expect(sub).toEqual(["email", "production-access"]);
  });
});

describe("parseCliArgs — email agent policy", () => {
  it("parses caps, repeatable allowlist flags and --clear-allowlist", () => {
    const { flags, sub } = parseCliArgs([
      "node",
      "wraps",
      "email",
      "agent",
      "policy",
      "support-bot",
      "--max-per-hour",
      "50",
      "--max-per-day",
      "500",
      "--allow-domain",
      "acme.com",
      "--allow-domain",
      "partner.io",
      "--allow-recipient",
      "ops@acme.com",
    ]);
    expect(sub).toEqual(["email", "agent", "policy", "support-bot"]);
    expect(flags.maxPerHour).toBe("50");
    expect(flags.maxPerDay).toBe("500");
    expect(flags.allowDomain).toEqual(["acme.com", "partner.io"]);
    expect(flags.allowRecipient).toEqual(["ops@acme.com"]);
  });

  it("parses --clear-allowlist without swallowing the next positional", () => {
    const { flags, sub } = parseCliArgs([
      "node",
      "wraps",
      "email",
      "agent",
      "policy",
      "--clear-allowlist",
      "support-bot",
    ]);
    expect(flags.clearAllowlist).toBe(true);
    expect(sub).toEqual(["email", "agent", "policy", "support-bot"]);
  });

  it("omits list flags that were not given", () => {
    const { flags } = parseCliArgs([
      "node",
      "wraps",
      "email",
      "agent",
      "policy",
      "x",
    ]);
    expect(flags.allowDomain).toBeUndefined();
    expect(flags.allowRecipient).toBeUndefined();
  });
});

describe("parseCliArgs — --name and --all", () => {
  it("parses --name as a string and --all as a boolean", () => {
    const { flags, sub } = parseCliArgs([
      "node",
      "wraps",
      "email",
      "reply",
      "init",
      "--all",
      "--name",
      "bot",
    ]);
    expect(flags.all).toBe(true);
    expect(flags.name).toBe("bot");
    expect(sub).toEqual(["email", "reply", "init"]);
  });
});

describe("cli.ts only reads flags the parser declares", () => {
  const src = readFileSync(
    fileURLToPath(new URL("../../../cli.ts", import.meta.url)),
    "utf8"
  );

  it("never reads a kebab-case key (the parser emits camelCase)", () => {
    expect(src.match(/flags\["[a-z-]+"\]/g) ?? []).toEqual([]);
  });

  it("every flags.<key> read is a declared flag", () => {
    const read = [...src.matchAll(/flags\.([a-zA-Z]+)/g)].map((m) => m[1]);
    const undeclared = [...new Set(read)].filter(
      (k) => !KNOWN_FLAG_KEYS.has(k)
    );
    expect(undeclared).toEqual([]);
  });
});

describe("resolveNegatableFlag", () => {
  it("returns an explicit true or false from the parsed options untouched", () => {
    expect(resolveNegatableFlag(true, "--no-tracking-https", [])).toBe(true);
    expect(resolveNegatableFlag(false, "--no-tracking-https", [])).toBe(false);
  });

  it("recovers the off intent that parseCliArgs drops", () => {
    // parseCliArgs only surfaces booleans that are true, so `--no-x` reaches a
    // command as undefined and its meaning survives only in argv.
    const argv = ["node", "wraps", "email", "domains", "add", "-d", "a.com"];
    expect(
      parseCliArgs([...argv, "--no-tracking-https"]).flags.trackingHttps
    ).toBeUndefined();
    expect(
      resolveNegatableFlag(undefined, "--no-tracking-https", [
        ...argv,
        "--no-tracking-https",
      ])
    ).toBe(false);
  });

  it("stays undefined when the flag was never mentioned", () => {
    // The distinction the callers need: "off" must not be confused with
    // "not mentioned", which is what lets a default (or a prompt) apply.
    expect(
      resolveNegatableFlag(undefined, "--no-tracking-https", [
        "node",
        "wraps",
        "email",
        "domains",
        "add",
      ])
    ).toBeUndefined();
  });
});

describe("parseCliArgs — values given to valueless boolean flags", () => {
  const argv = (...rest: string[]) => ["node", "wraps", ...rest];

  it("--root wraps.dev sets root and re-emits the value as a positional", () => {
    const { flags, sub, extraPositionals } = parseCliArgs(
      argv("email", "inbound", "add", "--root", "wraps.dev")
    );
    expect(flags.root).toBe(true);
    expect(sub).toEqual(["email", "inbound", "add", "wraps.dev"]);
    expect(extraPositionals).toEqual([]);
  });

  it("--root=wraps.dev parses identically to --root wraps.dev", () => {
    const spaced = parseCliArgs(
      argv("email", "inbound", "add", "--root", "wraps.dev")
    );
    const attached = parseCliArgs(
      argv("email", "inbound", "add", "--root=wraps.dev")
    );
    expect(attached).toEqual(spaced);
    expect(attached.flags.root).toBe(true);
    expect(attached.sub).toEqual(["email", "inbound", "add", "wraps.dev"]);
  });

  it("surfaces positionals at index 4 and beyond", () => {
    const { extraPositionals } = parseCliArgs(
      argv("email", "status", "--json", "a", "b", "c")
    );
    expect(extraPositionals).toEqual(["c"]);
  });

  it("a bare --root parses cleanly with no stray positionals", () => {
    const { flags, sub, extraPositionals } = parseCliArgs(
      argv("email", "inbound", "add", "--root")
    );
    expect(flags.root).toBe(true);
    expect(sub).toHaveLength(3);
    expect(extraPositionals).toEqual([]);
  });

  it("keeps root a boolean flag and does not swallow --subdomain's value", () => {
    const { flags, sub } = parseCliArgs(
      argv("email", "inbound", "add", "--subdomain", "support", "--root")
    );
    expect(flags.root).toBe(true);
    expect(flags.subdomain).toBe("support");
    expect(sub).toEqual(["email", "inbound", "add"]);
  });
});

describe("parseCliArgs — workflows push slug", () => {
  it("keeps the slug at sub[3] alongside boolean flags", () => {
    const { flags, sub, extraPositionals } = parseCliArgs([
      "node",
      "wraps",
      "email",
      "workflows",
      "push",
      "onboarding",
      "--dry-run",
    ]);
    expect(sub).toEqual(["email", "workflows", "push", "onboarding"]);
    expect(flags.dryRun).toBe(true);
    expect(extraPositionals).toEqual([]);
  });
});

describe("parseCliArgs — negative numeric values", () => {
  const argv = (...args: string[]) => ["node", "wraps", ...args];
  const base = ["email", "logs", "list"];
  const parse = (...rest: string[]) => parseCliArgs(argv(...base, ...rest));

  it.each([
    ["--limit -1", ["--limit", "-1"], "-1"],
    ["--limit -5", ["--limit", "-5"], "-5"],
    ["--limit -0.5", ["--limit", "-0.5"], "-0.5"],
  ])("consumes %s as the value of the string flag", (_label, tokens, value) => {
    const { flags, sub, extraPositionals } = parse(...tokens);
    expect(flags.limit).toBe(value);
    expect(sub).toEqual(base);
    expect(extraPositionals).toEqual([]);
  });

  it("parses --limit=-1 exactly as --limit -1 does", () => {
    expect(parse("--limit=-1")).toEqual(parse("--limit", "-1"));
    expect(parse("--limit=-1").flags.limit).toBe("-1");
  });

  it("consumes a negative value for an undeclared flag without leaking it", () => {
    // --offset is not a declared flag, so nothing reads it; the observable
    // contract is that -2 is neither a positional nor a phantom flag.
    const spaced = parse("--offset", "-2");
    expect(spaced.sub).toEqual(base);
    expect(spaced.extraPositionals).toEqual([]);
    expect(spaced).toEqual(parse("--offset=-2"));
  });

  it("keeps a non-numeric dash token as the existing (non-value) behaviour", () => {
    // `-x` is not a negative number: --limit still receives no value.
    const { flags, sub } = parse("--limit", "-x");
    expect(flags.limit).toBeUndefined();
    expect(sub).toEqual(base);
  });

  it.each([
    ["--limit -h", "help"],
    ["--limit -y", "yes"],
    ["--limit -v", "version"],
  ])("keeps %s reading the short flag, not a value", (tokens, flag) => {
    const { flags, sub } = parse(...tokens.split(" "));
    expect(flags[flag as keyof typeof flags]).toBe(true);
    expect(flags.limit).toBeUndefined();
    expect(sub).toEqual(base);
  });

  it("keeps a bare -1 positional instead of a phantom flag", () => {
    const { flags, sub } = parse("-1");
    expect(sub).toEqual([...base, "-1"]);
    expect(flags).toEqual({});
  });

  it("never gives a boolean flag a negative value", () => {
    const { flags, sub } = parse("--json", "-1");
    expect(flags.json).toBe(true);
    expect(sub).toEqual([...base, "-1"]);
  });

  it("does not rewrite tokens after the -- terminator", () => {
    const { sub } = parse("--", "--limit", "-1");
    expect(sub).toEqual([...base, "--limit", "-1"]);
  });

  it.each([
    ["-r -1", "region", "-1"],
    ["-d -1", "domain", "-1"],
    ["-p -1", "provider", "-1"],
  ])("gives the value to the short string alias: %s", (tokens, key, value) => {
    // Short aliases of string flags must match the long form: the number is
    // the value, never a placeholder leaking out of the parser.
    const short = parse(...tokens.split(" "));
    expect(short.flags[key as keyof typeof short.flags]).toBe(value);
    expect(short).toEqual(parse(`--${key}`, value));
  });

  it("keeps -y -1 as the boolean -y with -1 as a positional", () => {
    const { flags, sub } = parse("-y", "-1");
    expect(flags.yes).toBe(true);
    expect(sub).toEqual([...base, "-1"]);
  });

  it.each([
    [["-r", "-1"]],
    [["-d", "-1"]],
    [["-z", "-1"]],
    [["-yv", "-1"]],
    [["-1", "-2"]],
    [["--limit", "-1", "-2"]],
    [["--json", "-1", "--limit", "-5"]],
  ])(
    "never leaks the placeholder into any flag or positional: %j",
    (tokens) => {
      const result = parse(...tokens);
      expect(JSON.stringify(result)).not.toContain("\uE000");
    }
  );
});
