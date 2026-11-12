import { existsSync } from "node:fs";
import {
  link,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { CORE_SCHEMA, dump, load } from "js-yaml";
import { errors } from "./errors.js";
import { isJsonMode } from "./json-output.js";
import {
  DEFAULT_PROJECT_NAME,
  decideProject,
  listWrapsProjects,
  ProjectListError,
} from "./pulumi-project.js";

/**
 * Get the Wraps configuration directory
 */
export function getWrapsDir(): string {
  return join(homedir(), ".wraps");
}

/**
 * Get the Pulumi workspace directory
 */
export function getPulumiWorkDir(): string {
  return join(getWrapsDir(), "pulumi");
}

/**
 * Ensure the Wraps configuration directory exists
 */
export async function ensureWrapsDir(): Promise<void> {
  const wrapsDir = getWrapsDir();
  if (!existsSync(wrapsDir)) {
    await mkdir(wrapsDir, { recursive: true });
  }
}

/**
 * Clear Pulumi stack lock files from the local backend.
 * Recursively finds and deletes .json files under ~/.wraps/pulumi/.pulumi/locks/.
 * Returns the number of locks cleared.
 */
export async function clearLocalStackLocks(): Promise<number> {
  const locksDir = join(getPulumiWorkDir(), ".pulumi", "locks");
  if (!existsSync(locksDir)) {
    return 0;
  }

  let count = 0;

  async function walkAndDelete(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walkAndDelete(fullPath);
      } else if (entry.name.endsWith(".json")) {
        await rm(fullPath);
        count++;
      }
    }
  }

  await walkAndDelete(locksDir);
  return count;
}

/**
 * Warn without corrupting `--json` stdout: clack writes to stdout, so in JSON
 * mode the message goes to stderr instead.
 */
async function warnUser(message: string): Promise<void> {
  if (isJsonMode()) {
    console.error(message);
    return;
  }
  const clack = await import("@clack/prompts");
  clack.log.warn(message);
}

let repairWarned = false;

/**
 * Repair a stale `main` in ~/.wraps/pulumi/Pulumi.yaml.
 *
 * Pulumi's automation API writes this file once, with `main: process.cwd()` of
 * whichever directory the CLI first ran from, and never rewrites it. If that
 * directory is later deleted or moved, every Pulumi call fails with
 * "project 'main' could not be read". This points `main` at the work dir.
 *
 * Never writes or derives `name`: the file is shared by all services and its
 * `name` is the project directory the state backend stores stacks under.
 * Never creates the file: Pulumi does that on its first call. Never throws.
 */
export async function repairPulumiProjectMain(): Promise<void> {
  const pulumiDir = getPulumiWorkDir();
  const projectFile = join(pulumiDir, "Pulumi.yaml");
  // No Pulumi.yaml (including a Pulumi.yml / Pulumi.json in its place, which
  // Pulumi never writes): nothing to repair, and we must not create one.
  if (!existsSync(projectFile)) {
    return;
  }

  let tempFile: string | undefined;
  try {
    const parsed = load(await readFile(projectFile, "utf-8"), {
      schema: CORE_SCHEMA,
    });
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      throw new Error("not a YAML mapping");
    }
    const settings = parsed as Record<string, unknown>;
    // Pulumi writes name, runtime, main in that order and not atomically, so a
    // torn read lacks `main` (or has a truncated `name`). Write back only a
    // complete file; a file with no `main` has nothing stale (Pulumi defaults
    // to the project dir).
    if (
      typeof settings.name !== "string" ||
      typeof settings.main !== "string" ||
      settings.main === pulumiDir
    ) {
      return;
    }
    settings.main = pulumiDir;

    // Write atomically: concurrent Pulumi processes share this file and must
    // never read it half-written.
    tempFile = join(
      pulumiDir,
      `.Pulumi.yaml.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
    );
    await writeFile(
      tempFile,
      dump(settings, { lineWidth: -1, schema: CORE_SCHEMA }),
      "utf-8"
    );
    await rename(tempFile, projectFile);
    tempFile = undefined;
  } catch (error) {
    if (tempFile) {
      await rm(tempFile, { force: true }).catch(() => {});
    }
    // Several commands call ensurePulumiWorkDir twice; warn once per process.
    if (!repairWarned) {
      repairWarned = true;
      await warnUser(
        `Could not repair ${projectFile} (${error instanceof Error ? error.message : error}). Pulumi may fail to read the project.`
      );
    }
  }
}

/** Default project name for a backend with no Wraps stacks. */
export const PULUMI_PROJECT_NAME = DEFAULT_PROJECT_NAME;

const PROJECT_FILE_NAMES = [
  "Pulumi.yaml",
  "Pulumi.yml",
  "Pulumi.json",
] as const;

/**
 * The project `name` from Pulumi.yaml, else Pulumi.yml, else Pulumi.json
 * (Pulumi's lookup order). `undefined` when none exists; `"unreadable"` when
 * one exists but can't be read or has no usable `name`.
 */
export async function readPulumiProjectName(): Promise<
  string | undefined | "unreadable"
> {
  const pulumiDir = getPulumiWorkDir();
  for (const file of PROJECT_FILE_NAMES) {
    let text: string;
    try {
      text = await readFile(join(pulumiDir, file), "utf-8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        continue;
      }
      return "unreadable";
    }
    try {
      const parsed = load(text, { schema: CORE_SCHEMA });
      const name =
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>).name
          : undefined;
      return typeof name === "string" && name !== "" ? name : "unreadable";
    } catch {
      return "unreadable";
    }
  }
  return;
}

/**
 * Create Pulumi.yaml with `name`, only when none of the three project files
 * exists. Returns "exists" when another process (or file) got there first, so
 * the caller can check that file's name instead. Any other failure throws:
 * Pulumi must never write the call-site name after a failed create.
 */
export async function createPulumiProjectFile(
  name: string
): Promise<"created" | "exists"> {
  const pulumiDir = getPulumiWorkDir();
  for (const file of PROJECT_FILE_NAMES) {
    if (existsSync(join(pulumiDir, file))) {
      return "exists";
    }
  }
  const finalPath = join(pulumiDir, "Pulumi.yaml");
  const tempFile = join(
    pulumiDir,
    `.Pulumi.yaml.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
  );
  try {
    await writeFile(
      tempFile,
      dump(
        { name, runtime: "nodejs", main: pulumiDir },
        { lineWidth: -1, schema: CORE_SCHEMA }
      ),
      "utf-8"
    );
    try {
      await link(tempFile, finalPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        return "exists";
      }
      throw error;
    }
    return "created";
  } finally {
    await unlink(tempFile).catch(() => {});
  }
}

type ProjectCheckBackend =
  | { kind: "s3"; bucket: string; region: string }
  | { kind: "local"; accountId: string; region: string };

const warnedProjectCheck = new Set<string>();

async function warnOnce(message: string): Promise<void> {
  if (warnedProjectCheck.has(message)) {
    return;
  }
  warnedProjectCheck.add(message);
  await warnUser(message);
}

/**
 * Compare this machine's Pulumi project with the account's state, adopt the
 * account's name when the machine has no project file, and refuse when they
 * disagree. Never renames a stack or rewrites an existing `name`.
 */
async function checkProject(
  backend: ProjectCheckBackend,
  retried = false
): Promise<void> {
  const pulumiDir = getPulumiWorkDir();
  const name = await readPulumiProjectName();
  if (name === "unreadable") {
    return; // today's behaviour: let Pulumi report it
  }
  const local = backend.kind === "local";
  const location = local
    ? "local state in ~/.wraps/pulumi"
    : `s3://${backend.bucket}/.pulumi/stacks/`;
  const bucket = backend.kind === "s3" ? backend.bucket : "~/.wraps/pulumi";

  let listing: Awaited<ReturnType<typeof listWrapsProjects>>;
  try {
    listing = await listWrapsProjects(
      local
        ? {
            kind: "local",
            dir: pulumiDir,
            filter: { accountId: backend.accountId, region: backend.region },
          }
        : { kind: "s3", bucket: backend.bucket, region: backend.region },
      { localName: name }
    );
  } catch (error) {
    if (!(error instanceof ProjectListError)) {
      throw error;
    }
    if (name !== undefined) {
      const iam =
        error.accessDenied && !local
          ? ". Grant s3:ListBucket and s3:GetObject on wraps-state-* with no s3:prefix condition"
          : "";
      await warnOnce(
        `Couldn't check this machine's Pulumi project against ${location} (${error.errorName}${error.key ? `, at ${error.key}` : ""})${iam}. Continuing.`
      );
      return;
    }
    if (local) {
      return; // Pulumi creates the file from the call site, as today
    }
    throw errors.stateBackendListFailed({
      bucket,
      key: error.key,
      operation: error.operation,
      errorName: error.errorName,
      accessDenied: error.accessDenied,
      extension: error.extension,
    });
  }

  const decision = decideProject(name, listing);
  switch (decision.kind) {
    case "conflict":
      throw errors.stackProjectConflict({
        location,
        localName: name,
        projects: decision.projects,
        deployedTwice: decision.deployedTwice,
        emptyDuplicates: decision.emptyDuplicates,
      });
    case "mismatch":
      throw errors.pulumiProjectMismatch({
        location,
        localName: name as string,
        accountProject: decision.accountProject,
        emptyDuplicates: decision.emptyDuplicates,
        projectFile:
          (await existingProjectFile()) ?? join(pulumiDir, "Pulumi.yaml"),
      });
    case "adopt": {
      const result = await createPulumiProjectFile(decision.name);
      if (result === "exists" && !retried) {
        // Another process created it first: check against its name.
        await checkProject(backend, true);
      }
      return;
    }
    default:
      return;
  }
}

async function existingProjectFile(): Promise<string | undefined> {
  for (const file of PROJECT_FILE_NAMES) {
    const path = join(getPulumiWorkDir(), file);
    if (existsSync(path)) {
      return path;
    }
  }
  return;
}

/**
 * Ensure the Pulumi workspace directory exists and configure backend.
 *
 * When accountId and region are provided (and WRAPS_LOCAL_ONLY is not set),
 * uses S3 as the state backend for multi-machine/team workflows.
 * Falls back to local file backend on S3 errors or when no params given.
 */
export async function ensurePulumiWorkDir(options?: {
  accountId?: string;
  region?: string;
}): Promise<void> {
  await ensureWrapsDir();
  const pulumiDir = getPulumiWorkDir();
  if (!existsSync(pulumiDir)) {
    await mkdir(pulumiDir, { recursive: true });
  }

  // Before any Pulumi call (including the S3 migration below).
  await repairPulumiProjectMain();

  // Always set passphrase
  process.env.PULUMI_CONFIG_PASSPHRASE = "";

  // Pre-resolve AWS credentials into env vars before spawning Pulumi.
  // Pulumi's S3 state backend (gocloud.dev) uses AWS Go SDK v1, which has
  // no SSO support. Without this, SSO users hit NoCredentialProviders even
  // though their JS SDK v3 calls work fine. See aws.ts for details.
  if (options?.accountId && options?.region) {
    const { resolveAWSCredentialsToEnv } = await import("./aws.js");
    await resolveAWSCredentialsToEnv();
  }

  const useS3 =
    options?.accountId &&
    options?.region &&
    process.env.WRAPS_LOCAL_ONLY !== "1";

  let stateBucket: string | undefined;
  if (useS3) {
    try {
      const {
        ensureStateBucket,
        getS3BackendUrl,
        needsMigration,
        migrateLocalPulumiState,
      } = await import("./s3-state.js");

      const bucketName = await ensureStateBucket(
        options.accountId!,
        options.region!
      );

      // Check if local state needs to be migrated
      const shouldMigrate = await needsMigration(
        pulumiDir,
        options.accountId!,
        options.region!
      );

      if (shouldMigrate) {
        // Temporarily set local backend for export
        process.env.PULUMI_BACKEND_URL = `file://${pulumiDir}`;

        await migrateLocalPulumiState(
          pulumiDir,
          bucketName,
          options.accountId!,
          options.region!
        );
      }

      // Set S3 backend
      process.env.PULUMI_BACKEND_URL = getS3BackendUrl(
        options.accountId!,
        options.region!
      );
      stateBucket = bucketName;
    } catch (error) {
      // Graceful fallback to local
      await warnUser(
        `S3 state backend unavailable (${error instanceof Error ? error.message : error}). Using local state.`
      );
    }
  }

  // Outside the try above, so a project refusal can't fall through to the
  // local fallback below. Runs after the migration, credentials and passphrase.
  if (stateBucket !== undefined) {
    await checkProject({
      kind: "s3",
      bucket: stateBucket,
      region: options!.region!,
    });
    return;
  }

  // Default: local backend
  process.env.PULUMI_BACKEND_URL = `file://${pulumiDir}`;

  // Explicit local-only mode with an account: same rules over local state.
  // The S3-failure fallback and calls with no account get no detection.
  if (
    process.env.WRAPS_LOCAL_ONLY === "1" &&
    options?.accountId &&
    options?.region
  ) {
    await checkProject({
      kind: "local",
      accountId: options.accountId,
      region: options.region,
    });
  }
}
