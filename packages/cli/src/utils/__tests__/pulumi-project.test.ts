import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync, zstdCompressSync } from "node:zlib";
import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import { load } from "js-yaml";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Real file I/O against a temp HOME; S3 is an in-memory fake behind the SDK mock.
// os.homedir() ignores process.env.HOME inside vitest worker threads, so mock it.
let fakeHome = "";
vi.mock("node:os", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:os")>()),
  homedir: () => fakeHome,
}));

const warn = vi.fn();
vi.mock("@clack/prompts", () => ({
  log: { warn: (...a: unknown[]) => warn(...a) },
}));

const callOrder: string[] = [];
const migration = { needs: false };
vi.mock("../shared/s3-state.js", () => ({
  ensureStateBucket: vi.fn(async () => "bucket"),
  getS3BackendUrl: vi.fn().mockReturnValue("s3://bucket"),
  needsMigration: vi.fn(async () => migration.needs),
  migrateLocalPulumiState: vi.fn(async () => {
    callOrder.push("migrateLocalPulumiState");
  }),
}));
vi.mock("../shared/aws.js", () => ({
  resolveAWSCredentialsToEnv: vi.fn().mockResolvedValue(undefined),
}));

const ACCOUNT = "123456789012";
const REGION = "us-east-1";
const STACK = `wraps-${ACCOUNT}-${REGION}`;
const PREFIX = ".pulumi/stacks/";

const NON_EMPTY = {
  version: 3,
  checkpoint: {
    stack: "x",
    latest: {
      resources: [
        { type: "pulumi:pulumi:Stack" },
        { type: "pulumi:providers:aws" },
        { type: "aws:s3/bucket:Bucket" },
      ],
    },
  },
};
const EMPTY = {
  version: 3,
  checkpoint: {
    stack: "x",
    latest: {
      resources: [
        { type: "pulumi:pulumi:Stack" },
        { type: "pulumi:providers:aws" },
      ],
    },
  },
};
const NEVER_DEPLOYED = { version: 3, checkpoint: { stack: "x", latest: null } };
const PENDING = {
  version: 3,
  checkpoint: {
    stack: "x",
    latest: {
      resources: [{ type: "pulumi:pulumi:Stack" }],
      pending_operations: [{ type: "creating" }],
    },
  },
};

const s3 = mockClient(S3Client);
let objects = new Map<string, Buffer>();
let getFailures = new Map<string, Error>();
let listFailure: Error | undefined;
const listCalls: Array<{ prefix: string; token?: string }> = [];
const getCalls: string[] = [];

const modifiedAt = new Map<string, number>();

function put(key: string, body: unknown, modified = 0) {
  modifiedAt.set(`${PREFIX}${key}`, modified);
  objects.set(
    `${PREFIX}${key}`,
    Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body))
  );
}

function awsError(name: string, status = 500) {
  return Object.assign(new Error(name), {
    name,
    $metadata: { httpStatusCode: status },
  });
}

function installFakeS3(pageSize = 2) {
  s3.on(ListObjectsV2Command).callsFake(async (input) => {
    callOrder.push("list");
    listCalls.push({
      prefix: input.Prefix,
      token: input.ContinuationToken,
    });
    if (listFailure) {
      throw listFailure;
    }
    const prefix: string = input.Prefix;
    const items: Array<{ p?: string; c?: string }> = [];
    const seen = new Set<string>();
    for (const key of [...objects.keys()].sort()) {
      if (!key.startsWith(prefix)) {
        continue;
      }
      const rest = key.slice(prefix.length);
      const slash = rest.indexOf("/");
      if (slash === -1) {
        items.push({ c: key });
      } else {
        const p = `${prefix}${rest.slice(0, slash + 1)}`;
        if (!seen.has(p)) {
          seen.add(p);
          items.push({ p });
        }
      }
    }
    const start = Number(input.ContinuationToken ?? 0);
    const page = items.slice(start, start + pageSize);
    const more = start + pageSize < items.length;
    return {
      Contents: page
        .filter((i) => i.c)
        .map((i) => ({
          Key: i.c,
          LastModified: new Date(modifiedAt.get(i.c as string) ?? 0),
        })),
      CommonPrefixes: page.filter((i) => i.p).map((i) => ({ Prefix: i.p })),
      IsTruncated: more,
      NextContinuationToken: more ? String(start + pageSize) : undefined,
    };
  });
  s3.on(GetObjectCommand).callsFake(async (input) => {
    getCalls.push(input.Key);
    const failure = getFailures.get(input.Key);
    if (failure) {
      throw failure;
    }
    const body = objects.get(input.Key);
    if (!body) {
      throw awsError("NoSuchKey", 404);
    }
    return {
      Body: { transformToByteArray: async () => new Uint8Array(body) },
    };
  });
}

let ensurePulumiWorkDir: typeof import("../shared/fs.js").ensurePulumiWorkDir;
let getPulumiWorkDir: typeof import("../shared/fs.js").getPulumiWorkDir;
let setJsonMode: typeof import("../shared/json-output.js").setJsonMode;
let home = "";
let workDir = "";

const run = () => ensurePulumiWorkDir({ accountId: ACCOUNT, region: REGION });
const yamlPath = () => join(workDir, "Pulumi.yaml");
const readYaml = () =>
  load(readFileSync(yamlPath(), "utf-8")) as Record<string, unknown>;
const writeProject = (name: string, file = "Pulumi.yaml") =>
  writeFile(
    join(workDir, file),
    `name: ${name}\nruntime: nodejs\nmain: ${workDir}\n`
  );

async function expectCode(code: string) {
  const error = await run().then(
    () => undefined,
    (e) => e
  );
  expect(error, `expected ${code}`).toBeDefined();
  expect(error.code).toBe(code);
  return error as import("../shared/errors.js").WrapsError;
}

async function withLink(link: () => Promise<void>) {
  vi.doMock("node:fs/promises", async (importOriginal) => ({
    ...(await importOriginal<typeof import("node:fs/promises")>()),
    link,
  }));
  vi.resetModules();
  ({ ensurePulumiWorkDir } = await import("../shared/fs.js"));
}

beforeEach(async () => {
  vi.resetModules();
  ({ ensurePulumiWorkDir, getPulumiWorkDir } = await import("../shared/fs.js"));
  ({ setJsonMode } = await import("../shared/json-output.js"));
  home = await mkdtemp(join(tmpdir(), "wraps-pulumi-project-"));
  fakeHome = home;
  workDir = getPulumiWorkDir();
  expect(workDir.startsWith(home)).toBe(true); // never touch the real ~/.wraps
  await mkdir(workDir, { recursive: true });
  vi.stubEnv("WRAPS_LOCAL_ONLY", "");
  vi.stubEnv("PULUMI_BACKEND_URL", "");
  s3.reset();
  objects = new Map();
  modifiedAt.clear();
  getFailures = new Map();
  listFailure = undefined;
  listCalls.length = 0;
  getCalls.length = 0;
  callOrder.length = 0;
  migration.needs = false;
  warn.mockClear();
  installFakeS3();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await rm(home, { recursive: true, force: true });
});

describe("project file present (S3)", () => {
  it("carries on when every stack is under the machine's project, listing the project dirs once", async () => {
    await writeProject("wraps-email");
    put(`wraps-email/${STACK}.json`, NON_EMPTY);
    await run();
    expect(process.env.PULUMI_BACKEND_URL).toBe("s3://bucket");
    expect(listCalls.filter((c) => c.prefix === PREFIX)).toHaveLength(1);
    expect(getCalls).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("reads no checkpoints unless another project has stack files", async () => {
    await writeProject("wraps-email");
    put(`wraps-email/${STACK}.json`, NON_EMPTY);
    await run();
    expect(getCalls).toEqual([]);

    put(`wraps-sms/${STACK}.json`, NON_EMPTY);
    await expect(run()).rejects.toMatchObject({
      code: "STACK_PROJECT_CONFLICT",
    });
    expect(getCalls.sort()).toEqual(
      [
        `${PREFIX}wraps-email/${STACK}.json`,
        `${PREFIX}wraps-sms/${STACK}.json`,
      ].sort()
    );
  });

  it("splits across projects: throws with the foreign stack and docs anchor, keeping the S3 URL", async () => {
    await writeProject("wraps-email");
    put(`wraps-email/${STACK}.json`, NON_EMPTY);
    put("wraps-sms/wraps-sms-other.json", NON_EMPTY);
    const error = await expectCode("STACK_PROJECT_CONFLICT");
    expect(error.message).toContain("wraps-sms: wraps-sms-other");
    expect(error.message).toContain("#pulumi-project-mismatch-or-split");
    expect(process.env.PULUMI_BACKEND_URL).toBe("s3://bucket");
    expect(process.env.PULUMI_BACKEND_URL).not.toMatch(/^file:/);
  });

  it("reports a mismatch (not a split) when the account is entirely under another project", async () => {
    await writeProject("wraps-sms");
    put(`wraps-email/${STACK}.json`, NON_EMPTY);
    const error = await expectCode("PULUMI_PROJECT_MISMATCH");
    expect(error.message).toContain("wraps-sms");
    expect(error.message).toContain("wraps-email");
    expect(error.message).not.toContain("split across");
    expect(error.suggestion).toContain("name: wraps-email");
    expect(error.suggestion).toContain(yamlPath());
  });

  it("names an empty duplicate next to a non-empty stack as a mismatch", async () => {
    await writeProject("wraps-email");
    put(`wraps-email/${STACK}.json`, EMPTY);
    put(`wraps-sms/${STACK}.json`, NON_EMPTY);
    const error = await expectCode("PULUMI_PROJECT_MISMATCH");
    expect(error.message).toContain(`wraps-email/${STACK}`);
    expect(error.message).toContain("Empty duplicates");
  });

  it("lists a stack that is non-empty under both projects as deployed twice", async () => {
    await writeProject("wraps-email");
    put(`wraps-email/${STACK}.json`, NON_EMPTY);
    put(`wraps-sms/${STACK}.json`, NON_EMPTY);
    const error = await expectCode("STACK_PROJECT_CONFLICT");
    expect(error.message).toContain("Deployed twice");
    expect(error.message).toContain(STACK);
  });

  it("ignores foreign stacks that are empty or never deployed, with no warning", async () => {
    await writeProject("wraps-email");
    put(`wraps-email/${STACK}.json`, NON_EMPTY);
    put("wraps-sms/a.json", EMPTY);
    put("wraps-cdn/b.json", NEVER_DEPLOYED);
    await run();
    expect(warn).not.toHaveBeenCalled();
  });

  it("treats pending_operations as non-empty", async () => {
    await writeProject("wraps-email");
    put(`wraps-email/${STACK}.json`, NON_EMPTY);
    put("wraps-sms/a.json", PENDING);
    await expectCode("STACK_PROJECT_CONFLICT");
  });

  it("warns naming the key on an unreadable checkpoint and carries on", async () => {
    await writeProject("wraps-email");
    put(`wraps-email/a.json`, NON_EMPTY);
    put("wraps-sms/b.json", NON_EMPTY);
    getFailures.set(`${PREFIX}wraps-sms/b.json`, awsError("InternalError"));
    await run();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain(
      `${PREFIX}wraps-sms/b.json`
    );
    expect(process.env.PULUMI_BACKEND_URL).toBe("s3://bucket");
  });

  it("ignores .bak files, counts .json + .json.gz once, and skips non-wraps dirs", async () => {
    await writeProject("wraps-email");
    put(`wraps-email/${STACK}.json`, NON_EMPTY);
    put(`wraps-email/${STACK}.json.gz`, gzipSync(JSON.stringify(NON_EMPTY)));
    put("wraps-sms/a.json.bak", NON_EMPTY);
    put("wraps-sms/a.json.gz.bak", NON_EMPTY);
    put("other-project/a.json", NON_EMPTY);
    await run();
    expect(getCalls).toEqual([]);

    put("wraps-sms/a.json", NON_EMPTY);
    put("wraps-sms/a.json.gz", gzipSync(JSON.stringify(NON_EMPTY)));
    getCalls.length = 0;
    const error = await expectCode("STACK_PROJECT_CONFLICT");
    expect(error.message).toContain("wraps-sms: a");
    expect(getCalls.filter((k) => k.includes("wraps-sms/a"))).toHaveLength(1);
  });

  it("paginates both the project dirs and the stack files", async () => {
    await writeProject("wraps-email");
    for (const p of ["wraps-a", "wraps-b", "wraps-c", "wraps-d"]) {
      put(`${p}/s.json.bak`, NON_EMPTY);
    }
    put("wraps-sms/s1.json", EMPTY);
    put("wraps-sms/s2.json", EMPTY);
    put("wraps-sms/s3.json", EMPTY);
    put("wraps-sms/s4.json", NON_EMPTY);
    await expect(run()).rejects.toMatchObject({
      code: "PULUMI_PROJECT_MISMATCH",
    });
    expect(listCalls.some((c) => c.prefix === PREFIX && c.token)).toBe(true);
    expect(
      listCalls.some((c) => c.prefix === `${PREFIX}wraps-sms/` && c.token)
    ).toBe(true);
  });

  it("warns that the list was AccessDenied and carries on", async () => {
    await writeProject("wraps-email");
    listFailure = awsError("AccessDenied", 403);
    await run();
    expect(warn).toHaveBeenCalledTimes(1);
    const text = String(warn.mock.calls[0][0]);
    expect(text).toContain("AccessDenied");
    expect(text).toContain("s3:ListBucket");
    expect(text).not.toContain("AccessDenied: AccessDenied");
  });

  it("names a network error in the warning, distinct from AccessDenied", async () => {
    await writeProject("wraps-email");
    listFailure = awsError("TimeoutError");
    await run();
    const text = String(warn.mock.calls[0][0]);
    expect(text).toContain("TimeoutError");
    expect(text).not.toContain("AccessDenied");
  });

  it("warns once even when ensurePulumiWorkDir runs twice", async () => {
    await writeProject("wraps-email");
    listFailure = awsError("TimeoutError");
    await run();
    await run();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("uses Pulumi.yml's name and creates nothing when only Pulumi.yml exists", async () => {
    await writeProject("wraps-sms", "Pulumi.yml");
    put(`wraps-email/${STACK}.json`, NON_EMPTY);
    const error = await expectCode("PULUMI_PROJECT_MISMATCH");
    expect(error.suggestion).toContain(join(workDir, "Pulumi.yml"));
    expect(existsSync(yamlPath())).toBe(false);
  });

  it("makes no list call for an unparseable project file", async () => {
    await writeFile(yamlPath(), "name: [unclosed\n");
    await run();
    expect(listCalls).toEqual([]);
  });

  it("keeps a missing stacks prefix quiet", async () => {
    await writeProject("wraps-email");
    await run();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("no project file (S3)", () => {
  it("adopts the account's only project", async () => {
    put(`wraps-sms/${STACK}.json`, NON_EMPTY);
    await run();
    expect(readYaml().name).toBe("wraps-sms");
  });

  it("creates wraps-email when the bucket holds no stacks", async () => {
    await run();
    expect(readYaml().name).toBe("wraps-email");
  });

  it("creates wraps-email when only empty stacks exist (no adoption, no warning)", async () => {
    put(`wraps-sms/${STACK}.json`, EMPTY);
    await run();
    expect(readYaml().name).toBe("wraps-email");
    expect(warn).not.toHaveBeenCalled();
  });

  it("refuses two non-empty projects and creates no file", async () => {
    put(`wraps-email/${STACK}.json`, NON_EMPTY);
    put(`wraps-sms/${STACK}.json`, NON_EMPTY);
    const error = await expectCode("STACK_PROJECT_CONFLICT");
    expect(error.message).toContain("no Pulumi project yet");
    expect(existsSync(yamlPath())).toBe(false);
  });

  it("refuses with s3:ListBucket wording on AccessDenied and creates nothing", async () => {
    listFailure = awsError("AccessDenied", 403);
    const error = await expectCode("STATE_BACKEND_LIST_FAILED");
    expect(error.suggestion).toContain("s3:ListBucket");
    expect(error.suggestion).not.toContain("WRAPS_LOCAL_ONLY");
    expect(existsSync(yamlPath())).toBe(false);
  });

  it("refuses with run-again wording on a network error and creates nothing", async () => {
    listFailure = awsError("TimeoutError");
    const error = await expectCode("STATE_BACKEND_LIST_FAILED");
    expect(error.suggestion).toContain("TimeoutError");
    expect(error.suggestion).toContain("again");
    expect(error.suggestion).not.toContain("WRAPS_LOCAL_ONLY");
    expect(existsSync(yamlPath())).toBe(false);
    expect(process.env.PULUMI_BACKEND_URL).toBe("s3://bucket");
  });

  it("refuses with read wording when a checkpoint can't be read", async () => {
    put("wraps-sms/b.json", NON_EMPTY);
    getFailures.set(`${PREFIX}wraps-sms/b.json`, awsError("InternalError"));
    const error = await expectCode("STATE_BACKEND_LIST_FAILED");
    expect(error.message).toContain(`${PREFIX}wraps-sms/b.json`);
    expect(error.message).toContain("read");
    expect(existsSync(yamlPath())).toBe(false);
  });

  it("refuses with s3:GetObject wording when a read is AccessDenied", async () => {
    put("wraps-sms/b.json", NON_EMPTY);
    getFailures.set(`${PREFIX}wraps-sms/b.json`, awsError("AccessDenied", 403));
    const error = await expectCode("STATE_BACKEND_LIST_FAILED");
    expect(error.suggestion).toContain("s3:GetObject");
  });

  it("adopts the project of a stack that only has a valid .json.gz", async () => {
    // Fails if gunzip is removed: the bytes are only valid once decompressed.
    put(`wraps-sms/${STACK}.json.gz`, gzipSync(JSON.stringify(NON_EMPTY)));
    await run();
    expect(readYaml().name).toBe("wraps-sms");
  });

  it("adopts the project of a stack that only has a .json.zst", async () => {
    put(
      `wraps-sms/${STACK}.json.zst`,
      zstdCompressSync(Buffer.from(JSON.stringify(NON_EMPTY)))
    );
    await run();
    expect(readYaml().name).toBe("wraps-sms");
  });

  it("refuses with unsupported-compression wording when Node can't decode .zst, never adopting wraps-email", async () => {
    put(`wraps-sms/${STACK}.json.zst`, Buffer.from("zst bytes"));
    vi.doMock("node:zlib", async (importOriginal) => ({
      ...(await importOriginal<typeof import("node:zlib")>()),
      zstdDecompressSync: undefined,
    }));
    vi.resetModules();
    ({ ensurePulumiWorkDir } = await import("../shared/fs.js"));
    try {
      const error = await expectCode("STATE_BACKEND_LIST_FAILED");
      expect(error.message).toContain(".zst");
      expect(error.message).toContain(`wraps-sms/${STACK}.json.zst`);
      expect(error.suggestion).not.toContain("corrupt");
      expect(error.suggestion).not.toContain("again");
      expect(existsSync(yamlPath())).toBe(false);
    } finally {
      vi.doUnmock("node:zlib");
    }
  });

  it("ignores .json.lz4 and .json.attrs files (Pulumi never reads them)", async () => {
    put(`wraps-sms/${STACK}.json.lz4`, Buffer.from("lz4 bytes"));
    put(`wraps-sms/${STACK}.json.attrs`, Buffer.from("{}"));
    await run();
    expect(readYaml().name).toBe("wraps-email");
    expect(getCalls).toEqual([]);
  });

  it.skipIf(typeof zstdCompressSync !== "function")(
    "on equal times the later variant wins, as in Pulumi: .zst over .gz over .json",
    async () => {
      const gz = (v: unknown) => gzipSync(JSON.stringify(v));
      const zst = (v: unknown) =>
        zstdCompressSync(Buffer.from(JSON.stringify(v)));
      // .gz (non-empty) beats .json (empty)
      put(`wraps-sms/${STACK}.json`, EMPTY, 5);
      put(`wraps-sms/${STACK}.json.gz`, gz(NON_EMPTY), 5);
      await run();
      expect(readYaml().name).toBe("wraps-sms");
      await rm(yamlPath());
      // .zst (empty) beats .gz (non-empty)
      put(`wraps-sms/${STACK}.json.zst`, zst(EMPTY), 5);
      await run();
      expect(readYaml().name).toBe("wraps-email");
    }
  );

  it("reads the newest copy: a newer non-empty .json.gz beats an older empty .json", async () => {
    put(`wraps-sms/${STACK}.json`, EMPTY, 1000);
    put(
      `wraps-sms/${STACK}.json.gz`,
      gzipSync(JSON.stringify(NON_EMPTY)),
      2000
    );
    await run();
    expect(readYaml().name).toBe("wraps-sms");
  });

  it("reads the newest copy: a newer empty .json beats an older non-empty .json.gz", async () => {
    put(`wraps-sms/${STACK}.json`, EMPTY, 2000);
    put(
      `wraps-sms/${STACK}.json.gz`,
      gzipSync(JSON.stringify(NON_EMPTY)),
      1000
    );
    await run();
    expect(readYaml().name).toBe("wraps-email");
  });

  it("refuses with parse wording on a corrupt .gz", async () => {
    put("wraps-sms/b.json.gz", Buffer.from("not gzip"));
    const error = await expectCode("STATE_BACKEND_LIST_FAILED");
    expect(error.message).toContain("parse");
    expect(error.suggestion).toContain("corrupt");
    expect(existsSync(yamlPath())).toBe(false);
  });

  it("reads every stack's checkpoint on the no-file path", async () => {
    put(`wraps-email/a.json`, NON_EMPTY);
    put(`wraps-email/b.json`, EMPTY);
    await run();
    expect(getCalls).toHaveLength(2);
  });

  it("writes a file that reads back as name, runtime nodejs and main = work dir", async () => {
    put(`wraps-sms/${STACK}.json`, NON_EMPTY);
    await run();
    expect(readYaml()).toEqual({
      name: "wraps-sms",
      runtime: "nodejs",
      main: workDir,
    });
    expect(readdirSync(workDir)).toEqual(["Pulumi.yaml"]); // no temp file left
  });

  it("leaves a freshly created file byte-identical on the next run (main repair)", async () => {
    await run();
    const first = readFileSync(yamlPath(), "utf-8");
    await run();
    expect(readFileSync(yamlPath(), "utf-8")).toBe(first);
  });

  it("detects after the migration; the file is absent until then and name is read after it", async () => {
    migration.needs = true;
    const { migrateLocalPulumiState } = await import("../shared/s3-state.js");
    vi.mocked(migrateLocalPulumiState).mockImplementationOnce(async () => {
      callOrder.push("migrateLocalPulumiState");
      expect(existsSync(yamlPath())).toBe(false);
      // The migration is what brings the stacks to S3.
      put(`wraps-sms/${STACK}.json`, NON_EMPTY);
    });
    await run();
    expect(callOrder[0]).toBe("migrateLocalPulumiState");
    expect(callOrder.slice(1).every((c) => c === "list")).toBe(true);
    expect(readYaml().name).toBe("wraps-sms");
  });

  it("on EEXIST re-checks against the other process's name", async () => {
    put(`wraps-email/${STACK}.json`, NON_EMPTY);
    // Another process wins the race between our check and our create.
    await withLink(async () => {
      await writeProject("wraps-sms");
      throw Object.assign(new Error("exists"), { code: "EEXIST" });
    });
    try {
      await expectCode("PULUMI_PROJECT_MISMATCH");
      expect(readYaml().name).toBe("wraps-sms"); // never overwritten
      expect(readdirSync(workDir)).toEqual(["Pulumi.yaml"]);
    } finally {
      vi.doUnmock("node:fs/promises");
    }
  });

  it("throws on any other link error and leaves no temp file", async () => {
    await withLink(async () => {
      throw Object.assign(new Error("nope"), { code: "EPERM" });
    });
    try {
      await expect(run()).rejects.toThrow("nope");
      expect(readdirSync(workDir)).toEqual([]);
    } finally {
      vi.doUnmock("node:fs/promises");
    }
  });
});

describe("local-only and fallback paths", () => {
  const localStack = async (project: string, stack: string, body: unknown) => {
    const dir = join(workDir, ".pulumi", "stacks", project);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${stack}.json`), JSON.stringify(body));
  };

  it("adopts from this account's local stacks when WRAPS_LOCAL_ONLY=1", async () => {
    vi.stubEnv("WRAPS_LOCAL_ONLY", "1");
    await localStack("wraps-sms", STACK, NON_EMPTY);
    await run();
    expect(readYaml().name).toBe("wraps-sms");
    expect(process.env.PULUMI_BACKEND_URL).toBe(`file://${workDir}`);
    expect(listCalls).toEqual([]);
  });

  it("throws with local wording on this account's foreign local stack", async () => {
    vi.stubEnv("WRAPS_LOCAL_ONLY", "1");
    await writeProject("wraps-email");
    await localStack("wraps-email", STACK, NON_EMPTY);
    await localStack("wraps-sms", STACK, NON_EMPTY);
    const error = await expectCode("STACK_PROJECT_CONFLICT");
    expect(error.message).toContain("local state in ~/.wraps/pulumi");
  });

  it("ignores another account's local stacks", async () => {
    vi.stubEnv("WRAPS_LOCAL_ONLY", "1");
    await writeProject("wraps-email");
    await localStack("wraps-email", STACK, NON_EMPTY);
    await localStack("wraps-sms", "wraps-999999999999-eu-west-1", NON_EMPTY);
    await run();
  });

  it("creates nothing on a local read error other than ENOENT", async () => {
    vi.stubEnv("WRAPS_LOCAL_ONLY", "1");
    const dir = join(
      workDir,
      ".pulumi",
      "stacks",
      "wraps-sms",
      `${STACK}.json`
    );
    await mkdir(dir, { recursive: true }); // reading a directory gives EISDIR
    await run();
    expect(existsSync(yamlPath())).toBe(false);
  });

  it("ignores a local .json.attrs sidecar written after the stack file", async () => {
    vi.stubEnv("WRAPS_LOCAL_ONLY", "1");
    await localStack("wraps-sms", STACK, NON_EMPTY);
    const sidecar = join(
      workDir,
      ".pulumi",
      "stacks",
      "wraps-sms",
      `${STACK}.json.attrs`
    );
    await writeFile(sidecar, "{}");
    const later = new Date(Date.now() + 60_000);
    await utimes(sidecar, later, later);
    await run();
    expect(readYaml().name).toBe("wraps-sms");
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns with no S3 advice on a mocked local EACCES", async () => {
    vi.stubEnv("WRAPS_LOCAL_ONLY", "1");
    await writeProject("wraps-email");
    await localStack("wraps-sms", STACK, NON_EMPTY);
    vi.doMock("node:fs/promises", async (importOriginal) => {
      const real = await importOriginal<typeof import("node:fs/promises")>();
      return {
        ...real,
        readFile: (path: string, ...rest: unknown[]) =>
          String(path).includes("/.pulumi/stacks/")
            ? Promise.reject(
                Object.assign(new Error("denied"), { code: "EACCES" })
              )
            : (real.readFile as (...a: unknown[]) => Promise<unknown>)(
                path,
                ...rest
              ),
      };
    });
    vi.resetModules();
    ({ ensurePulumiWorkDir } = await import("../shared/fs.js"));
    try {
      await run();
      expect(warn).toHaveBeenCalledTimes(1);
      const text = String(warn.mock.calls[0][0]);
      expect(text).toContain("EACCES");
      expect(text).not.toContain("s3:");
      expect(text).not.toContain("wraps-state");
    } finally {
      vi.doUnmock("node:fs/promises");
    }
  });

  it("does not warn when .pulumi/stacks is missing", async () => {
    vi.stubEnv("WRAPS_LOCAL_ONLY", "1");
    await run();
    expect(warn).not.toHaveBeenCalled();
    expect(readYaml().name).toBe("wraps-email");
  });

  it("local path EEXIST re-checks against the other process's name", async () => {
    vi.stubEnv("WRAPS_LOCAL_ONLY", "1");
    await localStack("wraps-email", STACK, NON_EMPTY);
    await withLink(async () => {
      await writeProject("wraps-sms");
      throw Object.assign(new Error("exists"), { code: "EEXIST" });
    });
    try {
      const error = await expectCode("PULUMI_PROJECT_MISMATCH");
      expect(error.message).toContain("local state in ~/.wraps/pulumi");
      expect(readYaml().name).toBe("wraps-sms");
    } finally {
      vi.doUnmock("node:fs/promises");
    }
  });

  it("warns without S3 advice on a local read error with a project file", async () => {
    vi.stubEnv("WRAPS_LOCAL_ONLY", "1");
    await writeProject("wraps-email");
    const dir = join(
      workDir,
      ".pulumi",
      "stacks",
      "wraps-sms",
      `${STACK}.json`
    );
    await mkdir(dir, { recursive: true });
    await run();
    expect(warn).toHaveBeenCalledTimes(1);
    const text = String(warn.mock.calls[0][0]);
    expect(text).toContain("EISDIR");
    expect(text).not.toContain("s3:ListBucket");
  });

  it("does no detection, listing or creation on the S3-failure fallback", async () => {
    const { ensureStateBucket } = await import("../shared/s3-state.js");
    vi.mocked(ensureStateBucket).mockRejectedValueOnce(new Error("no bucket"));
    await writeProject("wraps-email");
    await localStack("wraps-sms", STACK, NON_EMPTY); // foreign, this account
    await run();
    expect(process.env.PULUMI_BACKEND_URL).toBe(`file://${workDir}`);
    expect(listCalls).toEqual([]);
    expect(readYaml().name).toBe("wraps-email");
  });

  it("creates no file on the fallback path with no project file", async () => {
    const { ensureStateBucket } = await import("../shared/s3-state.js");
    vi.mocked(ensureStateBucket).mockRejectedValueOnce(new Error("no bucket"));
    await run();
    expect(existsSync(yamlPath())).toBe(false);
    expect(listCalls).toEqual([]);
  });

  it("does nothing when no account is given", async () => {
    await ensurePulumiWorkDir();
    expect(existsSync(yamlPath())).toBe(false);
    expect(listCalls).toEqual([]);
  });
});

describe("--json", () => {
  it("writes the list-failure warning to stderr only", async () => {
    setJsonMode(true);
    try {
      await writeProject("wraps-email");
      listFailure = awsError("TimeoutError");
      const stdout = vi.spyOn(process.stdout, "write");
      const stderr = vi.spyOn(console, "error").mockImplementation(() => {});
      await run();
      expect(warn).not.toHaveBeenCalled();
      expect(stdout).not.toHaveBeenCalled();
      expect(String(stderr.mock.calls[0][0])).toContain("TimeoutError");
    } finally {
      setJsonMode(false);
    }
  });
});
