import path from "node:path";
import { config } from "dotenv";
import { defineConfig } from "vitest/config";
import { resolveTestDatabaseUrl } from "../../scripts/test-db/resolve-branch.mjs";

// Load .env.test from the web app — the shared test database every other
// DB-touching suite uses. Resolved against this file, not process.cwd(), so
// it works when vitest is invoked from the repo root.
config({ path: path.resolve(import.meta.dirname, "../../apps/web/.env.test") });

process.env.DATABASE_URL = await resolveTestDatabaseUrl(
  process.env.DATABASE_URL ?? "",
  process.env
);

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
    // Matches apps/api and apps/web: this suite now talks to a shared remote
    // Neon branch where a single round-trip costs seconds, and several files
    // seed then assert. The 5s default is far too tight.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
