import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    exclude: ["**/node_modules/**", "**/dist/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "dist/",
        "**/*.test.ts",
        "**/__tests__/**",
        "lambda/",
        "templates/",
        // Infrastructure code (Pulumi) - tested through integration tests
        "src/infrastructure/**",
        // Express server code - will be tested later with integration tests
        "src/console/routes/**",
        "src/console/middleware/**",
        "src/console/services/**",
        "src/console/server.ts",
        // Archive utility used primarily by console
        "src/utils/archive.ts",
        // CLI entry point
        "src/cli.ts",
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
    // Suppress console output during tests for cleaner output
    silent: false,
    // Run tests in parallel for better performance
    pool: "threads",
    poolOptions: {
      threads: {
        singleThread: false,
      },
    },
  },
});
