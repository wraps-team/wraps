import type { KnipConfig } from "knip";

const config: KnipConfig = {
  workspaces: {
    ".": {
      entry: ["baseline/*.test.ts"],
      ignoreDependencies: [
        // React Email dev server
        "@react-email/preview-server",
        "react-email",
        // pnpm self-reference
        "pnpm",
      ],
    },
    "apps/api": {
      entry: ["src/lambda.ts"],
      project: ["src/**/*.ts"],
    },
    "apps/web": {
      entry: [
        "src/app/**/page.tsx",
        "src/app/**/layout.tsx",
        "src/app/**/loading.tsx",
        "src/app/**/error.tsx",
        "src/app/**/not-found.tsx",
        "src/app/**/route.ts",
        "src/app/globals.css",
      ],
      project: ["src/**/*.{ts,tsx}"],
    },
    "apps/website": {
      entry: [
        "src/app/**/page.tsx",
        "src/app/**/layout.tsx",
        "src/app/**/not-found.tsx",
        "src/app/**/route.ts",
        "src/app/globals.css",
      ],
      project: ["src/**/*.{ts,tsx}"],
    },
    "packages/ai": {
      project: ["src/**/*.ts"],
    },
    "packages/analytics": {
      project: ["src/**/*.ts"],
    },
    "packages/observability": {
      project: ["src/**/*.ts"],
    },
    "packages/cli": {
      project: ["src/**/*.ts"],
    },
    "packages/db": {
      entry: ["drizzle.config.ts"],
      project: ["src/**/*.ts"],
    },
    "packages/core": {
      entry: ["lambda/*/index.ts"],
      project: ["src/**/*.ts", "lambda/**/*.ts"],
    },
    "packages/ui": {
      entry: [
        "src/components/**/*.tsx",
        "src/hooks/**/*.ts",
        "src/lib/**/*.ts",
      ],
      project: ["src/**/*.{ts,tsx}"],
    },
    "packages/auth": {
      project: ["src/**/*.ts"],
    },
    "packages/email": {
      project: ["src/**/*.{ts,tsx}"],
    },
    "packages/console": {
      entry: ["src/App.tsx", "src/main.tsx"],
      project: ["src/**/*.{ts,tsx}"],
    },
    "packages/email-check": {
      project: ["src/**/*.ts"],
    },
    "packages/pulumi": {
      project: ["src/**/*.ts"],
    },
    "packages/cdk": {
      project: ["src/**/*.ts"],
    },
    wraps: {
      entry: ["wraps.config.ts", "brand.ts"],
      project: ["**/*.{ts,tsx}"],
    },
  },
  // Disable ESLint plugin — we use Biome
  eslint: false,
};

export default config;
