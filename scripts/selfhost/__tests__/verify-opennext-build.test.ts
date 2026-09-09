import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveOpenNextCommand } from "../verify-opennext-build.mjs";

// This helper picks which OpenNext the canary build runs. If it silently
// returns the wrong version the job still passes — it just stops testing the
// thing a customer's deploy actually does — so the failure mode is a green
// build against an OpenNext SST would never invoke.
const platformSource = readFileSync(
  new URL(
    "../../../infra/.sst/platform/src/components/aws/nextjs.ts",
    import.meta.url
  ),
  "utf-8"
);

const configSource = readFileSync(
  new URL("../../../infra/selfhost.config.ts", import.meta.url),
  "utf-8"
);

const stubPlatform = `
const DEFAULT_OPEN_NEXT_VERSION = "3.9.14";
const DEFAULT_OPEN_NEXT_VERSION_NEXT14 = "3.6.6";
`;

describe("resolveOpenNextCommand", () => {
  it("reads the real platform's default rather than a version pinned here", () => {
    const resolved = resolveOpenNextCommand({
      platformSource,
      nextSpecifier: "16.2.12",
      configSource,
    });

    expect(resolved.error).toBeUndefined();
    expect(resolved.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(platformSource).toContain(
      `const DEFAULT_OPEN_NEXT_VERSION = "${resolved.version}"`
    );
  });

  // The whole point of deriving instead of pinning: an sst bump has to move
  // the canary with it, with nobody remembering to edit this repo.
  it("follows the platform when SST changes its default", () => {
    expect(
      resolveOpenNextCommand({
        platformSource: stubPlatform.replace("3.9.14", "3.9.99"),
        nextSpecifier: "16.2.12",
        configSource,
      }).command
    ).toBe("@opennextjs/aws@3.9.99");
  });

  it("fails loudly when SST renames the constant, instead of guessing", () => {
    const resolved = resolveOpenNextCommand({
      platformSource: 'const OPEN_NEXT_PIN = "3.9.14";',
      nextSpecifier: "16.2.12",
      configSource,
    });

    expect(resolved.version).toBeUndefined();
    expect(resolved.error).toContain("DEFAULT_OPEN_NEXT_VERSION");
  });

  // Mirrors SST's own branches so the canary can never build with a different
  // adapter than the deploy: the Next 14 default, and the 3.1.4 rename from
  // open-next to @opennextjs/aws.
  it("uses the Next 14 default below Next 15, and the old package name below 3.1.4", () => {
    expect(
      resolveOpenNextCommand({
        platformSource: stubPlatform,
        nextSpecifier: "14.2.35",
        configSource,
      }).command
    ).toBe("@opennextjs/aws@3.6.6");

    expect(
      resolveOpenNextCommand({
        platformSource: stubPlatform.replace("3.9.14", "3.1.3"),
        nextSpecifier: "16.2.12",
        configSource,
      }).command
    ).toBe("open-next@3.1.3");
  });

  // The config does not pin one today. If someone ever does — the documented
  // escape hatch when SST's default lags Next — the canary must switch to it,
  // or CI would keep vouching for a version the deploy no longer uses.
  it("prefers an openNextVersion pinned in selfhost.config.ts", () => {
    const resolved = resolveOpenNextCommand({
      platformSource: stubPlatform,
      nextSpecifier: "16.2.12",
      configSource:
        'new sst.aws.Nextjs("SelfhostWeb", { openNextVersion: "3.10.4" })',
    });

    expect(resolved.command).toBe("@opennextjs/aws@3.10.4");
    expect(resolved.pinned).toBe(true);
  });
});

// The path filter on the build step is a list of directories maintained by
// hand. Add a workspace dependency to apps/web and forget this list and the
// build simply stops running for changes to it — silently, with the job still
// green, which is the same class of failure the build itself exists to catch.
describe("the OpenNext build's path filter", () => {
  const workflow = readFileSync(
    new URL("../../../.github/workflows/test.yml", import.meta.url),
    "utf-8"
  );

  const repoRoot = new URL("../../../", import.meta.url);
  const readPkg = (relative: string) =>
    JSON.parse(readFileSync(new URL(relative, repoRoot), "utf-8"));

  // name -> directory, because the two do not always agree (@wraps.dev/cli
  // lives in packages/cli).
  const packageDirs = new Map<string, string>(
    readdirSync(new URL("packages", repoRoot)).flatMap((dir) => {
      try {
        return [[readPkg(`packages/${dir}/package.json`).name, dir]] as [
          string,
          string,
        ][];
      } catch {
        return [];
      }
    })
  );

  const workspaceDeps = (pkg: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  }) =>
    Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })
      .filter(([, spec]) => spec.startsWith("workspace:"))
      .map(([name]) => name);

  // What `pnpm --filter "@wraps/web^..." list` resolves to, without shelling
  // out to pnpm in a unit test.
  const closure = (() => {
    const seen = new Set<string>();
    const queue = workspaceDeps(readPkg("apps/web/package.json"));
    while (queue.length) {
      const name = queue.shift() as string;
      const dir = packageDirs.get(name);
      if (!dir || seen.has(dir)) {
        continue;
      }
      seen.add(dir);
      queue.push(...workspaceDeps(readPkg(`packages/${dir}/package.json`)));
    }
    return [...seen].sort();
  })();

  const filtered = (
    workflow.match(/\^\(apps\/web\/\|packages\/\(([a-z|-]+)\)\//)?.[1] ?? ""
  )
    .split("|")
    .sort();

  it("covers every workspace package apps/web builds against", () => {
    expect(closure.length).toBeGreaterThan(0);
    expect(filtered).toEqual(closure);
  });

  // Everything outside packages/ that changes what the build produces or which
  // OpenNext produces it. next is pinned in pnpm-workspace.yaml's `overrides:`
  // and the sst version in the root package.json picks the OpenNext default,
  // so neither bump can be allowed to skip the build that checks it.
  it.each([
    "pnpm-workspace\\.yaml",
    "package\\.json",
    "pnpm-lock\\.yaml",
    "infra/selfhost\\.config\\.ts",
    "scripts/selfhost/verify-opennext-build\\.mjs",
  ])("watches %s", (path) => {
    expect(workflow).toContain(path);
  });
});
