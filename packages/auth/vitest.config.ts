import path from "node:path";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(() => {
  // Load .env.test file from apps/web (shared test environment)
  const env = loadEnv(
    "test",
    path.resolve(import.meta.dirname, "../../apps/web"),
    ""
  );

  return {
    test: {
      globals: true,
      environment: "node",
      // Load environment variables from apps/web/.env.test
      env,
    },
    resolve: {
      alias: {
        "@wraps/db": path.resolve(import.meta.dirname, "../db/src"),
        "@wraps/email": path.resolve(import.meta.dirname, "../email/src"),
      },
    },
  };
});
