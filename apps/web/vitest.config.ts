import path from "node:path";
import { loadEnv, type UserConfig } from "vite";
import { defineConfig } from "vitest/config";
import { resolveTestDatabaseUrl } from "../../scripts/test-db/resolve-branch.mjs";

export default defineConfig(async ({ mode }) => {
  // Load .env.test file
  const env = loadEnv("test", process.cwd(), "");
  env.DATABASE_URL = await resolveTestDatabaseUrl(env.DATABASE_URL, env);

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
      globals: true,
      environment: "node",
      // Use jsdom for component tests
      environmentMatchGlobs: [["src/components/**/*.test.{ts,tsx}", "jsdom"]],
      setupFiles: ["./src/lib/permissions/__tests__/setup.ts"],
      // Sequential execution required when using shared database with afterEach cleanup
      fileParallelism: false,
      // These suites run against the same shared remote Neon branch apps/api
      // uses, where a single round-trip costs seconds. `fileParallelism: false`
      // serializes them but does nothing about latency, so any test doing
      // several writes — creating an org, seeding rows, then asserting — lands
      // just past the 5s default. apps/api measured exactly that (5005-5562ms
      // failures that passed in full at 60s) and gave itself this headroom;
      // this app has the same database, the same serialization and ten
      // `*-db.test.ts` files, but was still on the default. Matches
      // apps/api/vitest.config.ts and packages/auth/vitest.config.ts.
      testTimeout: 30_000,
      hookTimeout: 30_000,
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
      // Load environment variables from .env.test
      env,
      server: {
        deps: {
          // pathfinding is CJS but imported via ESM by @jalez/react-flow-smart-edge
          inline: ["pathfinding", "@jalez/react-flow-smart-edge"],
        },
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
