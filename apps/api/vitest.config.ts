import path from "node:path";
import { config } from "dotenv";
import { defineConfig } from "vitest/config";

// Load env from web app's .env.local
config({ path: path.resolve(__dirname, "../web/.env.local") });

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Sequential execution required when using shared database
    fileParallelism: false,
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/routes/**/*.ts", "src/middleware/**/*.ts"],
      exclude: ["**/__tests__/**", "**/*.test.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@wraps/db": path.resolve(__dirname, "../../packages/db/src"),
    },
  },
});
