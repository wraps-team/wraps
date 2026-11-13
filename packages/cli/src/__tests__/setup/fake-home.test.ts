import { homedir } from "node:os";
import { describe, expect, it } from "vitest";
import { getPulumiWorkDir, getWrapsDir } from "../../utils/shared/fs.js";

describe("fake home guard", () => {
  it("os.homedir() is not the real home", () => {
    expect(homedir()).toContain("wraps-cli-home-");
    expect(homedir()).not.toBe(process.env.HOME);
  });

  it("source modules resolve ~/.wraps under the fake home", () => {
    expect(getWrapsDir()).toBe(`${homedir()}/.wraps`);
    expect(getPulumiWorkDir().startsWith(homedir())).toBe(true);
  });

  it("PULUMI_HOME points inside the fake home", () => {
    expect(process.env.PULUMI_HOME?.startsWith(homedir())).toBe(true);
  });
});
