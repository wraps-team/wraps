import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../arg-parser.js";

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
