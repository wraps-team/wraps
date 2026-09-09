// Runs the OpenNext build that `sst deploy` runs for the self-hosted dashboard,
// then asserts the artifacts SST reads back out of it.
//
// The self-host stack ships apps/web through sst.aws.Nextjs, which does not
// build Next itself — it shells out to OpenNext, a separate adapter that
// reimplements Next's server output for Lambda and therefore tracks Next's
// internals minor by minor. Nothing else in CI exercises that: selfhost-smoke
// stops at `sst install` plus config evaluation, and no job anywhere runs a
// Next production build of apps/web. So a Next bump OpenNext cannot adapt to
// merges green and first fails inside a customer's AWS account, mid-deploy,
// after the stack has already created resources.
//
// The OpenNext version is derived from the installed SST platform rather than
// pinned here, so bumping sst automatically re-points this canary at whatever
// version the deploy would really use.
//
// No AWS, no credentials, no env file — every step is local.
//
//   node scripts/selfhost/verify-opennext-build.mjs
//
// Requires `sst install` (for infra/.sst/platform) and a workspace dep build
// (`pnpm selfhost:build-deps`) first. The selfhost-smoke job does both.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WEB = join(REPO, "apps", "web");
const PLATFORM_NEXTJS = join(
  REPO,
  "infra/.sst/platform/src/components/aws/nextjs.ts"
);

const fail = (message) => {
  console.error(`::error::${message}`);
  process.exit(1);
};

/** Numeric-tuple compare, enough for the pinned versions SST compares. */
const compare = (a, b) => {
  const parse = (v) =>
    v
      .replace(/^[^\d]*/, "")
      .split(".")
      .map(Number);
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  }
  return 0;
};

/**
 * Mirrors Nextjs.normalizeBuildCommand in the installed SST platform: an
 * explicit openNextVersion wins, otherwise the platform's default for our
 * Next major, and the package was renamed open-next -> @opennextjs/aws at 3.1.4.
 */
export function resolveOpenNextCommand({
  platformSource,
  nextSpecifier,
  configSource,
}) {
  const read = (name) => {
    const match = platformSource.match(new RegExp(`const ${name} = "([^"]+)"`));
    return match?.[1];
  };
  const latest = read("DEFAULT_OPEN_NEXT_VERSION");
  const next14 = read("DEFAULT_OPEN_NEXT_VERSION_NEXT14");
  if (!(latest && next14)) {
    return {
      error:
        "Could not read DEFAULT_OPEN_NEXT_VERSION from the SST platform — SST renamed or moved it, so this check would silently test the wrong OpenNext version. Re-read infra/.sst/platform/src/components/aws/nextjs.ts and update resolveOpenNextCommand.",
    };
  }

  const pinned = configSource.match(/openNextVersion:\s*"([^"]+)"/)?.[1];
  const version =
    pinned ?? (compare(nextSpecifier, "15.0.0") < 0 ? next14 : latest);
  const pkg = compare(version, "3.1.3") <= 0 ? "open-next" : "@opennextjs/aws";
  return { version, pinned: Boolean(pinned), command: `${pkg}@${version}` };
}

function main() {
  if (!existsSync(PLATFORM_NEXTJS)) {
    fail(
      `${PLATFORM_NEXTJS} not found — run \`sst install --config selfhost.config.ts\` from infra/ first.`
    );
  }

  const webPkg = JSON.parse(readFileSync(join(WEB, "package.json"), "utf-8"));
  const nextSpecifier =
    webPkg.dependencies?.next ?? webPkg.devDependencies?.next;
  if (!nextSpecifier) fail("apps/web declares no next dependency.");

  const resolved = resolveOpenNextCommand({
    platformSource: readFileSync(PLATFORM_NEXTJS, "utf-8"),
    nextSpecifier,
    configSource: readFileSync(join(REPO, "infra/selfhost.config.ts"), "utf-8"),
  });
  if (resolved.error) fail(resolved.error);

  console.log(
    `Building apps/web (next ${nextSpecifier}) with ${resolved.command}` +
      `${resolved.pinned ? " (pinned in selfhost.config.ts)" : " (SST platform default)"}`
  );

  const build = spawnSync("npx", ["--yes", resolved.command, "build"], {
    cwd: WEB,
    stdio: "inherit",
  });
  if (build.status !== 0) {
    fail(
      `OpenNext ${resolved.version} could not build apps/web on next ${nextSpecifier}. ` +
        "The self-hosted dashboard would fail to deploy. Either hold apps/web at a Next version " +
        "this OpenNext supports, or set openNextVersion in infra/selfhost.config.ts to a release that does " +
        "(SST's Nextjs component still expects the 3.9.x output layout, so 4.x is not a drop-in)."
    );
  }

  // What SST's Nextjs.buildPlan -> loadBuildOutput reads back. A build can exit 0
  // and still leave a layout SST cannot consume; those failures surface only at
  // deploy, which is exactly the moment this job exists to move earlier.
  const output = join(WEB, ".open-next/open-next.output.json");
  if (!existsSync(output)) {
    fail(
      "OpenNext build exited 0 but wrote no .open-next/open-next.output.json — SST's loadBuildOutput throws on this."
    );
  }
  const manifest = JSON.parse(readFileSync(output, "utf-8"));

  if (Object.keys(manifest.edgeFunctions ?? {}).length) {
    fail(
      "OpenNext emitted edgeFunctions (Lambda@Edge). SST's Nextjs component rejects that outright: 'Lambda@Edge runtime is deprecated.'"
    );
  }

  for (const origin of ["default", "imageOptimizer", "s3"]) {
    if (!manifest.origins?.[origin]) {
      fail(
        `OpenNext output has no "${origin}" origin — SST reads origins.${origin} when building the CloudFront plan.`
      );
    }
  }

  const bundles = [
    manifest.origins.default.bundle,
    manifest.origins.imageOptimizer.bundle,
    manifest.additionalProps?.revalidationFunction?.bundle,
    ".open-next/assets",
    ".open-next/cache",
    ".next/BUILD_ID",
    ".next/routes-manifest.json",
  ].filter(Boolean);

  for (const path of bundles) {
    if (!existsSync(join(WEB, path))) {
      fail(
        `OpenNext build is missing ${path}, which SST uploads or reads at deploy.`
      );
    }
  }

  console.log(
    `OpenNext ${resolved.version} builds apps/web on next ${nextSpecifier}, and the output is shaped the way SST reads it.`
  );
}

// Importable for its unit test; the build only runs on direct invocation.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
