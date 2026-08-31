import path from "node:path";
import { config } from "dotenv";
import { defineConfig } from "vitest/config";
import { resolveTestDatabaseUrl } from "../../scripts/test-db/resolve-branch.mjs";

// Load .env.test from web app (shared test database + config)
config({ path: path.resolve(import.meta.dirname, "../web/.env.test") });

process.env.DATABASE_URL = await resolveTestDatabaseUrl(
  process.env.DATABASE_URL ?? "",
  process.env
);

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Sequential execution required when using shared database
    fileParallelism: false,
    // These suites run against a shared remote Neon branch, where a single
    // round-trip costs seconds. `fileParallelism: false` serializes them but
    // does nothing about latency, so any test doing several writes — creating
    // an org, seeding rows, then asserting — lands just past the 5s default.
    // `message-send-cleanup.test.ts` and `batch-sender-orphan-adoption.test.ts`
    // failed that way at 5005-5562ms while passing in full at 60s. Matches the
    // headroom `packages/auth/vitest.config.ts` already gives itself.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ["src/**/*.test.ts", "src/\\(ee\\)/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: [
        "src/routes/**/*.ts",
        "src/middleware/**/*.ts",
        "src/\\(ee\\)/routes/**/*.ts",
        "src/\\(ee\\)/workers/**/*.ts",
      ],
      exclude: ["**/__tests__/**", "**/*.test.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "@wraps/db": path.resolve(import.meta.dirname, "../../packages/db/src"),
    },
  },
});
