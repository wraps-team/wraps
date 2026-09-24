import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installRelease } from "../update.js";

// Mirrors the release tarball's `wraps/` directory (see get.wraps.dev):
// a root package.json beside bin/, runtime/ and lib/.
function writeRelease(dir: string, version: string) {
  mkdirSync(join(dir, "bin"), { recursive: true });
  mkdirSync(join(dir, "runtime"), { recursive: true });
  mkdirSync(join(dir, "lib", "node_modules", ".pnpm", "dep"), {
    recursive: true,
  });
  writeFileSync(join(dir, "bin", "wraps"), "#!/bin/sh\n");
  writeFileSync(join(dir, "runtime", "node"), "");
  writeFileSync(join(dir, "lib", "cli.js"), `// ${version}\n`);
  writeFileSync(join(dir, "package.json"), JSON.stringify({ version }));
  writeFileSync(join(dir, "lib", "package.json"), JSON.stringify({ version }));
  symlinkSync(".pnpm/dep", join(dir, "lib", "node_modules", "dep"));
}

const version = (file: string) =>
  JSON.parse(readFileSync(file, "utf-8")).version;

describe("installRelease", () => {
  let root: string;
  let installDir: string;
  let source: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "wraps-update-test-"));
    installDir = join(root, ".wraps");
    source = join(root, "extract", "wraps");
    writeRelease(installDir, "3.9.0");
    writeRelease(source, "3.11.2");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("[2026-09-23 regression] updates the root package.json the CLI reads its version from", () => {
    // lib/cli.js reads `../package.json`. The old updater copied only bin,
    // runtime and lib, so the new code ran under the old version: --version
    // printed 3.9.0 after "Updated to v3.11.2" and update re-offered 3.11.2.
    installRelease(source, installDir);

    expect(version(join(installDir, "package.json"))).toBe("3.11.2");
    expect(readFileSync(join(installDir, "lib", "cli.js"), "utf-8")).toBe(
      "// 3.11.2\n"
    );
  });

  it("leaves entries the release does not ship untouched", () => {
    mkdirSync(join(installDir, "connections"));
    writeFileSync(join(installDir, "connections", "123-us-east-1.json"), "{}");
    writeFileSync(join(installDir, "config.json"), '{"keep":true}');

    installRelease(source, installDir);

    expect(
      existsSync(join(installDir, "connections", "123-us-east-1.json"))
    ).toBe(true);
    expect(readFileSync(join(installDir, "config.json"), "utf-8")).toBe(
      '{"keep":true}'
    );
  });

  it("keeps pnpm's relative symlinks relative", () => {
    installRelease(source, installDir);

    expect(readlinkSync(join(installDir, "lib", "node_modules", "dep"))).toBe(
      ".pnpm/dep"
    );
  });

  it("drops files the new release no longer ships inside a replaced directory", () => {
    writeFileSync(join(installDir, "lib", "stale.js"), "");

    installRelease(source, installDir);

    expect(existsSync(join(installDir, "lib", "stale.js"))).toBe(false);
  });
});
