import { describe, expect, it } from "vitest";
import { parseCliArgs, resolveNegatableFlag } from "../arg-parser.js";

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
