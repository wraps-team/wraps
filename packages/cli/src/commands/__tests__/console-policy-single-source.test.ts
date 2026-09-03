import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * There is exactly one console-role policy builder. Two copies is how
 * `platform connect` shipped roles without ses:ListConfigurationSets for a month
 * after `update-role` was fixed (plan 240).
 */
describe("console policy builder is defined once", () => {
  const root = fileURLToPath(new URL("../platform", import.meta.url));
  it("connect.ts imports the builder from update-role.ts", () => {
    const src = readFileSync(resolve(root, "connect.ts"), "utf8");
    expect(src).not.toMatch(/function buildConsolePolicyDocument\(/);
    expect(src).toMatch(
      /import \{[^}]*buildConsolePolicyDocument[^}]*\} from "\.\/update-role\.js"/
    );
  });
  it("update-role.ts is the only definition under commands/", () => {
    const files = ["connect.ts", "update-role.ts"].map((f) =>
      readFileSync(resolve(root, f), "utf8")
    );
    const definitions = files.filter((s) =>
      /function buildConsolePolicyDocument\(/.test(s)
    );
    expect(definitions).toHaveLength(1);
  });
});
