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
// The project check lists the (empty) state bucket after the migration.
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send = vi.fn().mockResolvedValue({});
  },
  ListObjectsV2Command: class {},
  GetObjectCommand: class {},
}));
vi.mock("../shared/aws.js", () => ({
  resolveAWSCredentialsToEnv: vi.fn().mockResolvedValue(undefined),
}));

// The warning is once-per-process module state, so load fresh modules per test.
let ensurePulumiWorkDir: typeof import("../shared/fs.js").ensurePulumiWorkDir;
let getPulumiWorkDir: typeof import("../shared/fs.js").getPulumiWorkDir;
let repairPulumiProjectMain: typeof import("../shared/fs.js").repairPulumiProjectMain;
let setJsonMode: typeof import("../shared/json-output.js").setJsonMode;

describe("repairPulumiProjectMain", () => {
  let home: string;
  let workDir: string;
  let yamlPath: string;

  const readYaml = () =>
    load(readFileSync(yamlPath, "utf-8")) as Record<string, unknown>;

  beforeEach(async () => {
    vi.resetModules();
    ({ ensurePulumiWorkDir, getPulumiWorkDir, repairPulumiProjectMain } =
      await import("../shared/fs.js"));
    ({ setJsonMode } = await import("../shared/json-output.js"));
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
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
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
      `name: wraps-email\nruntime: nodejs\nmain: >-\n  /tmp/wraps-gone/a-long-directory-name-that-makes-the-yaml-writer-fold-this-path-onto-its-own-line\n`
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
    vi.stubEnv("WRAPS_LOCAL_ONLY", "");
    vi.stubEnv("PULUMI_BACKEND_URL", "");
    vi.stubEnv("PULUMI_CONFIG_PASSPHRASE", "");
    await ensurePulumiWorkDir({
      accountId: "123456789012",
      region: "us-east-1",
    });
    expect(callOrder).toEqual(["needsMigration", "migrateLocalPulumiState"]);
    expect(migrationSeenMain).toEqual([workDir]);
    // Service-agnostic entry point: SMS / CDN commands reach the repair here.
    expect(readYaml().name).toBe("wraps-email");
  });

  it("does not write when there is no main (nothing stale, or a torn file)", async () => {
    const content = "name: wraps-email\nruntime: nodejs\n";
    await writeFile(yamlPath, content);
    await repairPulumiProjectMain();
    expect(readFileSync(yamlPath, "utf-8")).toBe(content);
    expect(readdirSync(workDir)).toEqual(["Pulumi.yaml"]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("does not write a torn file that was cut off mid-name", async () => {
    await writeFile(yamlPath, "name: wraps-em");
    await repairPulumiProjectMain();
    expect(readFileSync(yamlPath, "utf-8")).toBe("name: wraps-em");
    expect(readdirSync(workDir)).toEqual(["Pulumi.yaml"]);
  });

  it("keeps a date-like extra key's value unchanged", async () => {
    await writeFile(
      yamlPath,
      "name: wraps-email\nruntime: nodejs\nmain: /nope\ndescription: 2026-11-12\n"
    );
    await repairPulumiProjectMain();
    expect(readFileSync(yamlPath, "utf-8")).toContain(
      "description: 2026-11-12\n"
    );
    expect(readFileSync(yamlPath, "utf-8")).not.toContain("T00:00:00");
  });

  it("warns at most once per process", async () => {
    await writeFile(yamlPath, "name: [unclosed\n");
    await repairPulumiProjectMain();
    await repairPulumiProjectMain();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("in JSON mode warns on stderr only, never through clack or stdout", async () => {
    setJsonMode(true);
    try {
      await writeFile(yamlPath, "name: [unclosed\n");
      const stdout = vi.spyOn(process.stdout, "write");
      const stderr = vi.spyOn(console, "error").mockImplementation(() => {});
      await repairPulumiProjectMain();
      expect(warn).not.toHaveBeenCalled();
      expect(stdout).not.toHaveBeenCalled();
      expect(stderr).toHaveBeenCalledTimes(1);
      expect(String(stderr.mock.calls[0][0])).toContain("Could not repair");
    } finally {
      setJsonMode(false);
    }
  });

  it("in JSON mode the S3-fallback warning also avoids clack and stdout", async () => {
    setJsonMode(true);
    try {
      const { ensureStateBucket } = await import("../shared/s3-state.js");
      vi.mocked(ensureStateBucket).mockRejectedValueOnce(
        new Error("no bucket")
      );
      vi.stubEnv("WRAPS_LOCAL_ONLY", "");
      const stdout = vi.spyOn(process.stdout, "write");
      const stderr = vi.spyOn(console, "error").mockImplementation(() => {});
      await ensurePulumiWorkDir({
        accountId: "123456789012",
        region: "us-east-1",
      });
      expect(warn).not.toHaveBeenCalled();
      expect(stdout).not.toHaveBeenCalled();
      expect(String(stderr.mock.calls[0][0])).toContain(
        "S3 state backend unavailable"
      );
    } finally {
      setJsonMode(false);
    }
  });
});
