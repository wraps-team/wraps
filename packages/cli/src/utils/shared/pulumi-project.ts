import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import * as zlib from "node:zlib";

/**
 * Detection of the Pulumi project name an account's state lives under.
 *
 * Pulumi stores stacks at `.pulumi/stacks/<project>/<stack>.json[.gz]`. The
 * project is the `name` in ~/.wraps/pulumi/Pulumi.yaml; a machine whose name
 * differs from the account's would silently miss every stack. This module only
 * reads: it lists the account's `wraps-*` projects and decides. It never
 * renames, moves or writes state.
 */

/** Default project name for a backend with no Wraps stacks yet. */
export const DEFAULT_PROJECT_NAME = "wraps-email";

const STACKS_PREFIX = ".pulumi/stacks/";
const WRAPS_PROJECT_PREFIX = "wraps-";

export type ProjectBackend =
  | { kind: "s3"; bucket: string; region: string }
  | {
      kind: "local";
      /** ~/.wraps/pulumi */
      dir: string;
      /** Keep only stack files for this account and region (needsMigration's match). */
      filter?: { accountId: string; region: string };
    };

export type ProjectStacks = {
  /** Stacks holding at least one real resource (or a pending operation). */
  nonEmpty: string[];
  /** Never deployed, or emptied: only the stack and provider resources. */
  empty: string[];
};

export type ProjectListing = {
  projects: Record<string, ProjectStacks>;
};

/** A list, read or parse failure while inspecting state. */
export class ProjectListError extends Error {
  constructor(
    public operation: "list" | "read" | "parse" | "unsupported",
    public errorName: string,
    public accessDenied: boolean,
    /** The object key (S3) or path (local) that failed; absent for a list. */
    public key?: string,
    /** "unsupported" only: the compression extension Wraps can't decode, e.g. ".zst". */
    public extension?: string
  ) {
    super(`${operation} ${key ?? "state"} failed: ${errorName}`);
    this.name = "ProjectListError";
  }
}

function errorInfo(error: unknown): { name: string; accessDenied: boolean } {
  const e = error as {
    name?: string;
    code?: string;
    $metadata?: { httpStatusCode?: number };
  };
  // Node fs and socket errors are named "Error"; their errno is in `code`.
  const name =
    (e?.name && e.name !== "Error" ? e.name : e?.code) ||
    e?.name ||
    "UnknownError";
  const accessDenied =
    name === "AccessDenied" ||
    name === "AccessDeniedException" ||
    name === "AllAccessDisabled" ||
    name === "EACCES" ||
    e?.$metadata?.httpStatusCode === 403;
  return { name, accessDenied };
}

function isEnoent(error: unknown): boolean {
  return (error as { code?: string })?.code === "ENOENT";
}

const STACK_FILE = /^(.+)\.json((?:\.[A-Za-z0-9]+)?)$/;

/**
 * `<stack>.json` or `<stack>.json.<ext>` (Pulumi reads `.gz` and `.zst`).
 * `.bak` forms and anything else are not stack files.
 */
function parseStackFile(
  file: string
): { stack: string; extension: string } | undefined {
  if (file.endsWith(".bak")) {
    return;
  }
  const m = STACK_FILE.exec(file);
  return m ? { stack: m[1], extension: m[2] } : undefined;
}

type StackFile = { file: string; extension: string; modified: number };

/** Newest copy wins (Pulumi keeps the most recently modified variant). */
function newest(variants: StackFile[]): StackFile {
  return [...variants].sort(
    (a, b) => b.modified - a.modified || a.file.localeCompare(b.file)
  )[0];
}

/** Decode a stack file's bytes, or null when this Node can't decode its extension. */
function decode(bytes: Buffer, extension: string): Buffer | null {
  if (extension === "") {
    return bytes;
  }
  if (extension === ".gz") {
    return zlib.gunzipSync(bytes);
  }
  const zstd = (zlib as { zstdDecompressSync?: (b: Buffer) => Buffer })
    .zstdDecompressSync;
  if (extension === ".zst" && typeof zstd === "function") {
    return zstd(bytes);
  }
  return null;
}

type Source = {
  listDirs(): Promise<string[]>;
  /** File names (not keys) in a project dir, with their last-modified time (ms). */
  listFiles(dir: string): Promise<Array<{ name: string; modified: number }>>;
  read(dir: string, file: string): Promise<Buffer>;
  keyOf(dir: string, file: string): string;
};

async function s3Source(
  backend: Extract<ProjectBackend, { kind: "s3" }>
): Promise<Source> {
  const { S3Client, ListObjectsV2Command, GetObjectCommand } = await import(
    "@aws-sdk/client-s3"
  );
  const client = new S3Client({ region: backend.region });

  return {
    keyOf: (dir, file) => `${STACKS_PREFIX}${dir}/${file}`,
    async listDirs() {
      const dirs: string[] = [];
      let token: string | undefined;
      do {
        const res = await client.send(
          new ListObjectsV2Command({
            Bucket: backend.bucket,
            Prefix: STACKS_PREFIX,
            Delimiter: "/",
            ContinuationToken: token,
          })
        );
        for (const p of res.CommonPrefixes ?? []) {
          if (p.Prefix) {
            dirs.push(p.Prefix.slice(STACKS_PREFIX.length).replace(/\/$/, ""));
          }
        }
        token = res.IsTruncated ? res.NextContinuationToken : undefined;
      } while (token);
      return dirs;
    },
    async listFiles(dir) {
      const prefix = `${STACKS_PREFIX}${dir}/`;
      const files: Array<{ name: string; modified: number }> = [];
      let token: string | undefined;
      do {
        const res = await client.send(
          new ListObjectsV2Command({
            Bucket: backend.bucket,
            Prefix: prefix,
            Delimiter: "/",
            ContinuationToken: token,
          })
        );
        for (const o of res.Contents ?? []) {
          if (o.Key) {
            files.push({
              name: o.Key.slice(prefix.length),
              modified: o.LastModified ? new Date(o.LastModified).getTime() : 0,
            });
          }
        }
        token = res.IsTruncated ? res.NextContinuationToken : undefined;
      } while (token);
      return files;
    },
    async read(dir, file) {
      const res = await client.send(
        new GetObjectCommand({
          Bucket: backend.bucket,
          Key: `${STACKS_PREFIX}${dir}/${file}`,
        })
      );
      const bytes = await res.Body?.transformToByteArray();
      if (!bytes) {
        throw Object.assign(new Error("empty body"), { name: "EmptyBody" });
      }
      return Buffer.from(bytes);
    },
  };
}

function localSource(
  backend: Extract<ProjectBackend, { kind: "local" }>
): Source {
  const root = join(backend.dir, ".pulumi", "stacks");
  const { filter } = backend;
  return {
    keyOf: (dir, file) => join(root, dir, file),
    async listDirs() {
      try {
        const entries = await readdir(root, { withFileTypes: true });
        return entries.filter((e) => e.isDirectory()).map((e) => e.name);
      } catch (error) {
        if (isEnoent(error)) {
          return [];
        }
        throw error;
      }
    },
    async listFiles(dir) {
      const names = await readdir(join(root, dir));
      const wanted = filter
        ? names.filter(
            (f) => f.includes(filter.accountId) && f.includes(filter.region)
          )
        : names;
      return Promise.all(
        wanted.map(async (name) => ({
          name,
          modified: (await stat(join(root, dir, name))).mtimeMs,
        }))
      );
    },
    read: (dir, file) => readFile(join(root, dir, file)),
  };
}

/**
 * True when the checkpoint holds anything beyond the stack and its providers,
 * or has a pending operation. Throws on a shape it doesn't recognise (never
 * guess "empty").
 */
function checkpointIsNonEmpty(parsed: unknown): boolean {
  const root = parsed as {
    checkpoint?: { latest?: unknown };
    deployment?: unknown;
  } | null;
  if (root === null || typeof root !== "object") {
    throw new Error("checkpoint is not an object");
  }
  let latest: unknown;
  if (root.checkpoint && typeof root.checkpoint === "object") {
    latest = root.checkpoint.latest;
  } else if (root.deployment && typeof root.deployment === "object") {
    latest = root.deployment;
  } else {
    throw new Error("unrecognised checkpoint shape");
  }
  if (latest === null || latest === undefined) {
    return false;
  }
  const deployment = latest as {
    resources?: Array<{ type?: string }>;
    pending_operations?: unknown[];
  };
  if (
    Array.isArray(deployment.pending_operations) &&
    deployment.pending_operations.length > 0
  ) {
    return true;
  }
  return (deployment.resources ?? []).some(
    (r) =>
      r.type !== "pulumi:pulumi:Stack" &&
      !(typeof r.type === "string" && r.type.startsWith("pulumi:providers:"))
  );
}

/**
 * List the account's `wraps-*` Pulumi projects and, per project, which stacks
 * are non-empty. Checkpoints are read only for stacks that matter:
 *
 * - `localName` undefined (no project file): every `wraps-*` stack.
 * - `localName` set: nothing is read unless some other project has stack
 *   files; then those stacks and the stacks under `localName` are read.
 *
 * Throws {@link ProjectListError} on any list, read or parse failure; callers
 * decide whether that is a warning or a refusal.
 */
export async function listWrapsProjects(
  backend: ProjectBackend,
  options: { localName?: string } = {}
): Promise<ProjectListing> {
  const source =
    backend.kind === "s3" ? await s3Source(backend) : localSource(backend);
  const { localName } = options;

  let dirs: string[];
  try {
    dirs = (await source.listDirs()).filter((d) =>
      d.startsWith(WRAPS_PROJECT_PREFIX)
    );
  } catch (error) {
    const info = errorInfo(error);
    throw new ProjectListError("list", info.name, info.accessDenied);
  }

  const stackFiles = new Map<string, Map<string, StackFile[]>>(); // dir -> stack -> variants
  const listDir = async (dir: string) => {
    let files: Array<{ name: string; modified: number }>;
    try {
      files = await source.listFiles(dir);
    } catch (error) {
      const info = errorInfo(error);
      throw new ProjectListError("list", info.name, info.accessDenied);
    }
    const stacks = new Map<string, StackFile[]>();
    for (const { name, modified } of files) {
      const parsed = parseStackFile(name);
      if (!parsed) {
        continue;
      }
      // One stack however many copies exist (.json, .json.gz, .json.zst).
      const list = stacks.get(parsed.stack) ?? [];
      list.push({ file: name, extension: parsed.extension, modified });
      stacks.set(parsed.stack, list);
    }
    stackFiles.set(dir, stacks);
  };

  const others = dirs.filter((d) => d !== localName);
  if (localName !== undefined) {
    // Files-only look at the other projects first; skip all reads if none has a stack.
    for (const dir of others) {
      await listDir(dir);
    }
    const anyOther = others.some((d) => (stackFiles.get(d)?.size ?? 0) > 0);
    if (!anyOther) {
      return { projects: {} };
    }
    if (dirs.includes(localName)) {
      await listDir(localName);
    }
  } else {
    for (const dir of dirs) {
      await listDir(dir);
    }
  }

  const projects: Record<string, ProjectStacks> = {};
  for (const [dir, stacks] of stackFiles) {
    const entry: ProjectStacks = { nonEmpty: [], empty: [] };
    for (const [stack, variants] of [...stacks].sort(([a], [b]) =>
      a.localeCompare(b)
    )) {
      const { file, extension } = newest(variants);
      const key = source.keyOf(dir, file);
      let bytes: Buffer;
      try {
        bytes = await source.read(dir, file);
      } catch (error) {
        const info = errorInfo(error);
        throw new ProjectListError("read", info.name, info.accessDenied, key);
      }
      let nonEmpty: boolean;
      try {
        const raw = decode(bytes, extension);
        if (raw === null) {
          throw new ProjectListError(
            "unsupported",
            "UnsupportedCompression",
            false,
            key,
            extension
          );
        }
        nonEmpty = checkpointIsNonEmpty(JSON.parse(raw.toString("utf-8")));
      } catch (error) {
        if (error instanceof ProjectListError) {
          throw error;
        }
        throw new ProjectListError(
          "parse",
          (error as Error)?.name ?? "ParseError",
          false,
          key
        );
      }
      (nonEmpty ? entry.nonEmpty : entry.empty).push(stack);
    }
    if (entry.nonEmpty.length > 0 || entry.empty.length > 0) {
      projects[dir] = entry;
    }
  }
  return { projects };
}

export type ProjectDecision =
  | { kind: "ok" }
  | { kind: "adopt"; name: string }
  | {
      kind: "conflict";
      projects: Record<string, string[]>;
      deployedTwice: string[];
      emptyDuplicates: string[];
    }
  | {
      kind: "mismatch";
      accountProject: string;
      emptyDuplicates: string[];
    };

/** Empty copies ("project/stack") of a stack that is non-empty under another project. */
function emptyDuplicatesOf(projects: Record<string, ProjectStacks>): string[] {
  const out: string[] = [];
  for (const [project, { empty }] of Object.entries(projects)) {
    for (const stack of empty) {
      const elsewhere = Object.entries(projects).some(
        ([p, s]) => p !== project && s.nonEmpty.includes(stack)
      );
      if (elsewhere) {
        out.push(`${project}/${stack}`);
      }
    }
  }
  return out.sort();
}

/**
 * Compare the machine's project name (undefined = no project file) with the
 * account's non-empty stacks. Never picks a name when it can't tell.
 */
export function decideProject(
  localName: string | undefined,
  listing: ProjectListing
): ProjectDecision {
  const withStacks = Object.entries(listing.projects)
    .filter(([, s]) => s.nonEmpty.length > 0)
    .sort(([a], [b]) => a.localeCompare(b));

  if (withStacks.length >= 2) {
    const count = new Map<string, number>();
    for (const [, s] of withStacks) {
      for (const stack of s.nonEmpty) {
        count.set(stack, (count.get(stack) ?? 0) + 1);
      }
    }
    return {
      kind: "conflict",
      projects: Object.fromEntries(withStacks.map(([p, s]) => [p, s.nonEmpty])),
      deployedTwice: [...count]
        .filter(([, n]) => n > 1)
        .map(([s]) => s)
        .sort(),
      emptyDuplicates: emptyDuplicatesOf(listing.projects),
    };
  }

  if (localName === undefined) {
    return {
      kind: "adopt",
      name: withStacks[0]?.[0] ?? DEFAULT_PROJECT_NAME,
    };
  }

  if (withStacks.length === 1 && withStacks[0][0] !== localName) {
    return {
      kind: "mismatch",
      accountProject: withStacks[0][0],
      emptyDuplicates: emptyDuplicatesOf(listing.projects),
    };
  }
  return { kind: "ok" };
}
