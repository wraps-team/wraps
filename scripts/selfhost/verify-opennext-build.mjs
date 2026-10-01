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
import { randomBytes } from "node:crypto";
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

/**
 * The newest Next minor each OpenNext release is known to handle for apps/web.
 *
 * OpenNext publishes no upper bound: 3.9.14 peers on `^16.1.5`, which admits
 * every future 16.x, and it shipped in January 2026 — before Next 16.2 (March)
 * or 16.3 (August) existed. A Next minor it has never seen installs cleanly and
 * may still build; what breaks is runtime behaviour OpenNext patches minor by
 * minor (cache revalidation, segment prefetches). So the ceiling is ours to
 * hold, and a bump past it fails here instead of in a customer's account.
 *
 * Raise an entry only after `pnpm selfhost:build` passes on the new minor —
 * it builds and then serves requests through the real handler — and ideally a
 * `pnpm selfhost:deploy` to a test stage. An sst bump
 * that changes SST's default OpenNext lands on a version missing from this
 * table and fails until someone adds it.
 */
export const VERIFIED_NEXT_CEILING = {
  // 16.3: built and served by selfhost:build on next 16.3.6 (PR #188). Not yet deployed.
  "3.9.14": "16.3",
};

/** Fails when `nextVersion` is a newer major.minor than `openNextVersion` is verified for. */
export function checkNextCeiling({
  openNextVersion,
  nextVersion,
  ceilings = VERIFIED_NEXT_CEILING,
}) {
  const ceiling = ceilings[openNextVersion];
  if (!ceiling) {
    return {
      error:
        `OpenNext ${openNextVersion} has no entry in VERIFIED_NEXT_CEILING (scripts/selfhost/verify-opennext-build.mjs). ` +
        "An sst bump or an openNextVersion pin changed the adapter the self-host deploy uses. Verify it against apps/web's Next version, then add an entry.",
    };
  }
  if (
    compare(
      nextVersion.split("-")[0],
      `${ceiling}.${Number.MAX_SAFE_INTEGER}`
    ) > 0
  ) {
    return {
      error:
        `next ${nextVersion} is newer than ${ceiling}.x, the highest Next minor verified with OpenNext ${openNextVersion} for the self-hosted dashboard. ` +
        "Hold next at the ceiling, or verify the new minor (pnpm selfhost:build) and raise VERIFIED_NEXT_CEILING.",
    };
  }
  return {};
}

async function main() {
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

  // What OpenNext will really compile against. It is not always the manifest
  // specifier: next is pinned in pnpm-workspace.yaml's `overrides:`, so the two
  // can drift apart, and then a log line quoting the specifier would name a
  // version this job never tested.
  let installedNext = "unknown";
  try {
    installedNext = JSON.parse(
      readFileSync(join(WEB, "node_modules/next/package.json"), "utf-8")
    ).version;
  } catch {
    // Resolution layout is pnpm's business; the build below is the real check.
  }

  const ceiling = checkNextCeiling({
    openNextVersion: resolved.version,
    nextVersion: installedNext === "unknown" ? nextSpecifier : installedNext,
  });
  if (ceiling.error) {
    fail(ceiling.error);
  }

  console.log(
    `Building apps/web (next ${installedNext} installed, "${nextSpecifier}" declared) ` +
      `with ${resolved.command}` +
      `${resolved.pinned ? " (pinned in selfhost.config.ts)" : " (SST platform default)"}`
  );

  const build = spawnSync("npx", ["--yes", resolved.command, "build"], {
    cwd: WEB,
    stdio: "inherit",
  });
  if (build.status !== 0) {
    fail(
      `OpenNext ${resolved.version} could not build apps/web on next ${installedNext}. ` +
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
    `OpenNext ${resolved.version} builds apps/web on next ${installedNext}, and the output is shaped the way SST reads it.`
  );

  await smokeServer(join(WEB, manifest.origins.default.bundle));

  console.log(
    `OpenNext ${resolved.version} serves apps/web on next ${installedNext}: route handlers, SSR, RSC, redirects and the proxy all answer.`
  );
  // The handler's module graph holds sockets and timers open (pg pool, SDK
  // clients); the checks are done, so do not wait for them to drain.
  process.exit(0);
}

/** An API Gateway v2 event, which is what the CloudFront -> Lambda URL hop delivers. */
const apiGatewayEvent = (url, headers = {}) => {
  const [path, query = ""] = url.split("?");
  return {
    version: "2.0",
    routeKey: "$default",
    rawPath: path,
    rawQueryString: query,
    cookies: [],
    headers: {
      host: "dash.example.com",
      "x-forwarded-proto": "https",
      "user-agent": "wraps-selfhost-smoke",
      ...headers,
    },
    requestContext: {
      http: {
        method: "GET",
        path,
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "wraps-selfhost-smoke",
      },
      domainName: "dash.example.com",
      requestId: "selfhost-smoke",
      stage: "$default",
      timeEpoch: Date.now(),
    },
    isBase64Encoded: false,
  };
};

/**
 * Invokes the built server function in-process, the way Lambda would, and
 * checks a handful of requests that need no database and no AWS.
 *
 * A clean build only proves OpenNext could reshape Next's output; what breaks
 * when OpenNext lags a Next minor is the request path it reimplements — the
 * proxy (middleware) bundle, RSC requests, redirects, header and cookie
 * conversion. Every AWS and Postgres endpoint points at a closed local port,
 * so a route that unexpectedly reaches for one fails fast instead of hanging.
 */
async function smokeServer(bundleDir) {
  process.chdir(bundleDir);
  Object.assign(process.env, {
    AWS_REGION: "us-east-1",
    AWS_ACCESS_KEY_ID: "selfhost-smoke",
    AWS_SECRET_ACCESS_KEY: "selfhost-smoke",
    AWS_ENDPOINT_URL: "http://127.0.0.1:9",
    CACHE_BUCKET_NAME: "selfhost-smoke",
    CACHE_BUCKET_KEY_PREFIX: "_cache",
    CACHE_BUCKET_REGION: "us-east-1",
    CACHE_DYNAMO_TABLE: "selfhost-smoke",
    REVALIDATION_QUEUE_URL: "http://127.0.0.1:9/queue",
    REVALIDATION_QUEUE_REGION: "us-east-1",
    DATABASE_URL: "postgres://smoke:smoke@127.0.0.1:9/smoke",
    BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
    BETTER_AUTH_URL: "https://dash.example.com",
    NEXT_PUBLIC_APP_URL: "https://dash.example.com",
    WRAPS_DEPLOYMENT_MODE: "self-hosted",
  });

  const { handler } = await import(
    pathToFileURL(join(bundleDir, "index.mjs")).href
  );

  const request = async (path, headers) => {
    const response = await Promise.race([
      handler(apiGatewayEvent(path, headers), {
        getRemainingTimeInMillis: () => 60_000,
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timed out after 30s")), 30_000)
      ),
    ]).catch((error) =>
      fail(`The OpenNext server function threw on GET ${path}: ${error}`)
    );
    const body = response.isBase64Encoded
      ? Buffer.from(response.body ?? "", "base64").toString()
      : (response.body ?? "");
    return { ...response, body, headers: response.headers ?? {} };
  };

  const expectThat = (path, passed, what, response) => {
    if (!passed) {
      fail(
        `GET ${path} through the OpenNext server function: expected ${what}, got ${response.statusCode} ` +
          `${response.headers["content-type"] ?? ""} ${JSON.stringify(response.body.slice(0, 200))}`
      );
    }
  };

  // A route handler (better-auth's catch-all), no database.
  const ok = await request("/api/auth/ok");
  expectThat(
    "/api/auth/ok",
    ok.statusCode === 200 && ok.body.includes('"ok":true'),
    '200 {"ok":true}',
    ok
  );

  // A server-rendered page, with the proxy in front of it: src/proxy.ts echoes
  // x-request-id and sets device-type, so both prove the middleware bundle ran.
  const page = await request("/auth", { "x-request-id": "selfhost-smoke" });
  expectThat(
    "/auth",
    page.statusCode === 200 && page.body.startsWith("<!DOCTYPE html>"),
    "200 HTML",
    page
  );
  expectThat(
    "/auth",
    page.headers["x-request-id"] === "selfhost-smoke" &&
      (page.cookies ?? []).some((c) => c.startsWith("device-type=")),
    "the proxy's x-request-id header and device-type cookie",
    page
  );

  // The client-side navigation path: same page as an RSC payload. Next 16.3+
  // 307s an RSC request whose `_rsc` cache-busting param does not match its
  // router headers, to the URL carrying the right one. A browser's router
  // computes it up front; follow the one redirect rather than reimplement it.
  let rsc = await request("/auth", { rsc: "1" });
  if (rsc.statusCode === 307 && rsc.headers.location?.includes("_rsc")) {
    rsc = await request(rsc.headers.location, { rsc: "1" });
  }
  expectThat(
    "/auth (RSC)",
    rsc.statusCode === 200 &&
      rsc.headers["content-type"]?.startsWith("text/x-component"),
    "200 text/x-component",
    rsc
  );

  // A signed-out visit to a dashboard route redirects to sign-in.
  const redirect = await request("/smoke-org");
  expectThat(
    "/smoke-org",
    redirect.statusCode === 307 && redirect.headers.location === "/auth",
    "307 to /auth",
    redirect
  );
}

// Importable for its unit test; the build only runs on direct invocation.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
