import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { load } from "js-yaml";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Real file I/O against a temp HOME; only the clack warning is mocked.
// os.homedir() ignores process.env.HOME inside vitest worker threads, so mock it.
let fakeHome = "";
vi.mock("node:os", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:os")>()),
  homedir: () => fakeHome,
}));

const warn = vi.fn();
vi.mock("@clack/prompts", () => ({
  log: { warn: (...a: any[]) => warn(...a) },
}));

const migrationSeenMain: Array<unknown> = [];
const callOrder: string[] = [];
let pulumiYamlPath = "";
vi.mock("../shared/s3-state.js", () => ({
  ensureStateBucket: vi.fn().mockResolvedValue("bucket"),
  getS3BackendUrl: vi.fn().mockReturnValue("s3://bucket"),
  needsMigration: vi.fn(async () => {
    callOrder.push("needsMigration");
    migrationSeenMain.push(
      (load(readFileSync(pulumiYamlPath, "utf-8")) as any).main
    );
    return true;
  }),
  migrateLocalPulumiState: vi.fn(async () => {
    callOrder.push("migrateLocalPulumiState");
  }),
}));
vi.mock("../shared/aws.js", () => ({
  resolveAWSCredentialsToEnv: vi.fn().mockResolvedValue(undefined),
}));

import {
  ensurePulumiWorkDir,
  getPulumiWorkDir,
  repairPulumiProjectMain,
} from "../shared/fs.js";

describe("repairPulumiProjectMain", () => {
  let home: string;
  let workDir: string;
  let yamlPath: string;

  const readYaml = () =>
    load(readFileSync(yamlPath, "utf-8")) as Record<string, unknown>;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "wraps-pulumi-main-"));
    fakeHome = home;
    workDir = getPulumiWorkDir();
    expect(workDir.startsWith(home)).toBe(true); // never touch the real ~/.wraps
    yamlPath = pulumiYamlPath = join(workDir, "Pulumi.yaml");
    await mkdir(workDir, { recursive: true });
    warn.mockClear();
    migrationSeenMain.length = 0;
    callOrder.length = 0;
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it("rewrites a stale main to the work dir and keeps name and runtime", async () => {
    await writeFile(
      yamlPath,
      `name: wraps-email\nruntime: nodejs\nmain: ${join(home, "gone", "scratch")}\n`
    );
    await repairPulumiProjectMain();
    expect(readYaml()).toEqual({
      name: "wraps-email",
      runtime: "nodejs",
      main: workDir,
    });
  });

  it("rewrites a main that exists but differs", async () => {
    const other = await mkdtemp(join(tmpdir(), "wraps-other-"));
    try {
      await writeFile(
        yamlPath,
        `name: wraps-email\nruntime: nodejs\nmain: ${other}\n`
      );
      await repairPulumiProjectMain();
      expect(readYaml().main).toBe(workDir);
    } finally {
      await rm(other, { recursive: true, force: true });
    }
  });

  it("never changes name, whichever service's code path runs it", async () => {
    await writeFile(
      yamlPath,
      `name: wraps-email\nruntime: nodejs\nmain: /nope\n`
    );
    // The repair takes no service or project name, so SMS and CDN paths are the same call.
    expect(repairPulumiProjectMain.length).toBe(0);
    await repairPulumiProjectMain();
    await repairPulumiProjectMain();
    expect(readYaml().name).toBe("wraps-email");
  });

  it("does not write when main already equals the work dir", async () => {
    await writeFile(
      yamlPath,
      `name: wraps-sms\nruntime: nodejs\nmain: ${workDir}\n`
    );
    const old = new Date("2020-01-01T00:00:00Z");
    await utimes(yamlPath, old, old);
    const before = readFileSync(yamlPath, "utf-8");
    await repairPulumiProjectMain();
    expect(readFileSync(yamlPath, "utf-8")).toBe(before);
    expect(statSync(yamlPath).mtimeMs).toBe(old.getTime());
    expect(readdirSync(workDir)).toEqual(["Pulumi.yaml"]);
  });

  it("does not create Pulumi.yaml when it is missing", async () => {
    await repairPulumiProjectMain();
    expect(existsSync(yamlPath)).toBe(false);
    expect(readdirSync(workDir)).toEqual([]);
  });

  it("leaves a Pulumi.yml in place of Pulumi.yaml alone", async () => {
    const yml = join(workDir, "Pulumi.yml");
    await writeFile(yml, "name: x\nmain: /nope\n");
    await repairPulumiProjectMain();
    expect(readFileSync(yml, "utf-8")).toBe("name: x\nmain: /nope\n");
    expect(existsSync(yamlPath)).toBe(false);
  });

  it("parses and repairs a folded multi-line main", async () => {
    await writeFile(
      yamlPath,
      `name: wraps-email\nruntime: nodejs\nmain: >-\n  /tmp/claude-1000/-home-jarod-Projects-wraps/a4b60100-e670-4e15-abdd-e1bf18f0254e/scratchpad\n`
    );
    await repairPulumiProjectMain();
    expect(readYaml()).toEqual({
      name: "wraps-email",
      runtime: "nodejs",
      main: workDir,
    });
  });

  it("warns instead of throwing on unparseable YAML and leaves the file as is", async () => {
    const bad = "name: [unclosed\nmain: : :\n\t- bad\n";
    await writeFile(yamlPath, bad);
    await expect(repairPulumiProjectMain()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(readFileSync(yamlPath, "utf-8")).toBe(bad);
    expect(readdirSync(workDir)).toEqual(["Pulumi.yaml"]);
  });

  it("keeps unknown keys through the rewrite", async () => {
    await writeFile(
      yamlPath,
      `name: wraps-email\nruntime:\n  name: nodejs\n  options:\n    typescript: false\nmain: /nope\ndescription: keep me\n`
    );
    await repairPulumiProjectMain();
    expect(readYaml()).toEqual({
      name: "wraps-email",
      runtime: { name: "nodejs", options: { typescript: false } },
      main: workDir,
      description: "keep me",
    });
  });

  it("handles two concurrent repairs and leaves no temp file", async () => {
    await writeFile(
      yamlPath,
      `name: wraps-email\nruntime: nodejs\nmain: /nope\n`
    );
    await expect(
      Promise.all([repairPulumiProjectMain(), repairPulumiProjectMain()])
    ).resolves.toBeDefined();
    expect(readYaml()).toEqual({
      name: "wraps-email",
      runtime: "nodejs",
      main: workDir,
    });
    expect(readdirSync(workDir)).toEqual(["Pulumi.yaml"]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("ensurePulumiWorkDir repairs before needsMigration / migrateLocalPulumiState", async () => {
    await writeFile(
      yamlPath,
      `name: wraps-email\nruntime: nodejs\nmain: /nope\n`
    );
    delete process.env.WRAPS_LOCAL_ONLY;
    await ensurePulumiWorkDir({
      accountId: "123456789012",
      region: "us-east-1",
    });
    expect(callOrder).toEqual(["needsMigration", "migrateLocalPulumiState"]);
    expect(migrationSeenMain).toEqual([workDir]);
  });
});
