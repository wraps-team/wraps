import path from "node:path";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  // Load .env.test file
  const env = loadEnv("test", process.cwd(), "");

  return {
    test: {
      globals: true,
      environment: "node",
      setupFiles: ["./src/lib/permissions/__tests__/setup.ts"],
      // Sequential execution required when using shared database with afterEach cleanup
      fileParallelism: false,
      coverage: {
        provider: "v8",
        reporter: ["text", "json", "html"],
        include: ["src/lib/permissions/**/*.ts"],
        exclude: ["**/__tests__/**", "**/*.test.ts", "**/types.ts"],
      },
      // Load environment variables from .env.test
      env,
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@wraps/db": path.resolve(__dirname, "../../packages/db/src"),
        "@wraps/auth": path.resolve(__dirname, "../../packages/auth/src"),
      },
    },
  };
});
