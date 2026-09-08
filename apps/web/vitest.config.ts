import path from "node:path";
import { loadEnv, type UserConfig } from "vite";
import { defineConfig } from "vitest/config";
import { resolveTestDatabaseUrl } from "../../scripts/test-db/resolve-branch.mjs";

// The ten files that import the *fixed*-id fixtures from
// `src/app/api/__tests__/setup.ts` (`test-onboarding-org-1`, slug
// `onboarding-test-org`, …). Every other DB-touching suite namespaces its
// fixtures per file — `setupPermissionFixtures` appends a random suffix,
// `__tests__/fixtures/real-db.ts` prefixes every id — so only these ten can
// delete each other's rows mid-test. They get their own serial project; the
// rest of the suite runs in parallel. Migrating this setup to a per-file
// prefix would let the group fold into the parallel project.
const SHARED_FIXTURE_FILES = [
  "src/app/api/__tests__/activation-status.test.ts",
  "src/app/api/__tests__/ai-generate-code-vision.test.ts",
  "src/app/api/__tests__/aws-connect-rbac-db.test.ts",
  "src/app/api/__tests__/aws-validate.test.ts",
  "src/app/api/__tests__/brand-kits.test.ts",
  "src/app/api/__tests__/onboarding.test.ts",
  "src/app/api/__tests__/publish-route.test.ts",
  "src/app/api/__tests__/save-source.test.ts",
  "src/app/api/__tests__/send-test-unsubscribe.test.ts",
  "src/app/api/__tests__/templates.test.ts",
];

export default defineConfig(async () => {
  // Load .env.test file
  const env = loadEnv("test", process.cwd(), "");
  env.DATABASE_URL = await resolveTestDatabaseUrl(env.DATABASE_URL, env);

  // Settings both projects share. Spread rather than hoisted into the root
  // `test` block: with `projects`, root-level test options are not inherited.
  const shared = {
    globals: true,
    environment: "node",
    // Use jsdom for component tests
    environmentMatchGlobs: [["src/components/**/*.test.{ts,tsx}", "jsdom"]],
    setupFiles: ["./src/lib/permissions/__tests__/setup.ts"],
    // These suites run against the same shared remote Neon branch apps/api
    // uses, where a single round-trip costs ~42ms, so any test doing several
    // writes — creating an org, seeding rows, then asserting — lands just past
    // the 5s default. Matches apps/api and packages/auth.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Load environment variables from .env.test
    env,
    server: {
      deps: {
        // pathfinding is CJS but imported via ESM by @jalez/react-flow-smart-edge
        inline: ["pathfinding", "@jalez/react-flow-smart-edge"],
      },
    },
  };

  // The `as UserConfig` cast (not a function-return-type annotation) is
  // load-bearing: an untyped async config function makes TS's overload
  // resolution for `defineConfig` misfire ("no properties in common with
  // UserConfig") regardless of what's inside. Annotating the function's
  // return type instead fixes that but then excess-property-checks this
  // object against the installed vitest types, which are missing fields
  // (e.g. `environmentMatchGlobs`) this vitest version still supports at
  // runtime — the cast sidesteps both problems without touching the config.
  return {
    test: {
      // Two projects, not one serial suite. The whole app used to run with
      // `fileParallelism: false` on the theory that a shared database demands
      // it; in practice isolation comes from per-file fixture prefixes, and
      // the serialization only bought wall-clock — 588s for 238 files, of
      // which barely half was actual test execution. Split this way the same
      // 2856 tests pass in ~114s.
      projects: [
        {
          extends: true,
          test: {
            ...shared,
            name: "parallel",
            exclude: ["**/node_modules/**", ...SHARED_FIXTURE_FILES],
            fileParallelism: true,
          },
        },
        {
          extends: true,
          test: {
            ...shared,
            name: "shared-fixtures",
            include: SHARED_FIXTURE_FILES,
            fileParallelism: false,
          },
        },
      ],
      coverage: {
        provider: "v8",
        reporter: ["text", "json", "html"],
        include: [
          "src/lib/permissions/**/*.ts",
          "src/actions/**/*.ts",
          "src/lib/**/*.ts",
        ],
        exclude: ["**/__tests__/**", "**/*.test.ts", "**/types.ts"],
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "./src"),
        "@wraps/db": path.resolve(import.meta.dirname, "../../packages/db/src"),
        "@wraps/auth": path.resolve(
          import.meta.dirname,
          "../../packages/auth/src"
        ),
        // Library's main entry uses CJS but package.json has "type": "module" — resolve to ESM bundle
        "@jalez/react-flow-smart-edge": path.resolve(
          import.meta.dirname,
          "node_modules/@jalez/react-flow-smart-edge/dist/react-flow-smart-edge.esm.js"
        ),
      },
    },
  } as UserConfig;
});
