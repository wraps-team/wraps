import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import os, { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TelemetryConfigManager } from "../../telemetry/config.js";
import { getPulumiWorkDir, getWrapsDir } from "../../utils/shared/fs.js";
import { isRemovableFakeHome } from "./fake-home-global.js";

const fakeHome = process.env.WRAPS_CLI_TEST_HOME as string;

describe("fake home guard", () => {
  it("is a real, created temp dir that the env points at", () => {
    expect(fakeHome).toContain("wraps-cli-home-");
    expect(existsSync(fakeHome)).toBe(true);
    expect(process.env.HOME).toBe(fakeHome);
    expect(process.env.USERPROFILE).toBe(fakeHome);
    expect(process.env.PULUMI_HOME?.startsWith(fakeHome)).toBe(true);
    for (const key of [
      "XDG_CONFIG_HOME",
      "XDG_DATA_HOME",
      "XDG_CACHE_HOME",
      "XDG_STATE_HOME",
    ]) {
      expect(process.env[key]?.startsWith(fakeHome), key).toBe(true);
    }
  });

  it("os.homedir() is the fake home through the named import", () => {
    expect(homedir()).toBe(fakeHome);
  });

  it("os.homedir() is the fake home through a default and a bare os import", async () => {
    expect(os.homedir()).toBe(fakeHome);
    const bare = await import("os");
    expect(bare.default.homedir()).toBe(fakeHome);
  });

  it("source modules resolve ~/.wraps under the fake home", () => {
    expect(getWrapsDir()).toBe(join(fakeHome, ".wraps"));
    expect(getPulumiWorkDir().startsWith(fakeHome)).toBe(true);
  });

  it("reaches node_modules: conf and env-paths resolve under the fake home", () => {
    const path = new TelemetryConfigManager().getConfigPath();
    expect(path.startsWith(fakeHome)).toBe(true);
  });

  it("reaches child processes", () => {
    const out = execFileSync(
      process.execPath,
      ["-e", "process.stdout.write(require('os').homedir())"],
      { env: process.env, encoding: "utf8" }
    );
    expect(out).toBe(fakeHome);
  });
});

describe("fake home teardown guard", () => {
  it("accepts only wraps-cli-home-* directly under tmp", () => {
    expect(isRemovableFakeHome("/tmp/wraps-cli-home-1-a", "/tmp")).toBe(true);
    expect(isRemovableFakeHome("/tmp/wraps-cli-home-1-a/", "/tmp/")).toBe(true);
    expect(isRemovableFakeHome("/tmp/other", "/tmp")).toBe(false);
    expect(isRemovableFakeHome("/tmp", "/tmp")).toBe(false);
    expect(isRemovableFakeHome("/home/me", "/tmp")).toBe(false);
    expect(isRemovableFakeHome("/tmp/x/wraps-cli-home-1-a", "/tmp")).toBe(
      false
    );
    expect(isRemovableFakeHome("/tmp/../home/wraps-cli-home-1-a", "/tmp")).toBe(
      false
    );
  });
});
