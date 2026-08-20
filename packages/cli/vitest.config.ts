import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Fails any test that opens a real socket. See the file for why this is a
    // runtime guard rather than a lint rule.
    setupFiles: ["src/__tests__/setup/no-real-network.ts"],
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
        // Interactive CLI commands - tested through integration tests
        "src/commands/email/upgrade.ts",
        "src/commands/email/destroy.ts",
        "src/commands/shared/destroy.ts",
        // Archive utility used primarily by console
        "src/utils/archive.ts",
        // CLI entry point
        "src/cli.ts",
        // Complex utilities - tested through integration tests
        "src/utils/shared/pulumi.ts",
        "src/utils/shared/output.ts",
        "src/utils/shared/prompts.ts",
        "src/utils/route53.ts",
        // DNS credentials - complex interactive prompts
        "src/utils/dns/credentials.ts",
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
