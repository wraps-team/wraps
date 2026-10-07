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
