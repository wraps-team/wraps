#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

/**
 * Pre-bundle Lambda functions for production use
 *
 * This script bundles Lambda functions during the build process so they're
 * ready to deploy without requiring TypeScript sources in the published package.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = join(__dirname, "..");

async function bundleLambda(name: string, entryPoint: string) {
  const outdir = join(packageRoot, "dist", "lambda", name);

  if (!existsSync(outdir)) {
    mkdirSync(outdir, { recursive: true });
  }

  console.log(`Building Lambda: ${name}...`);

  await build({
    entryPoints: [entryPoint],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "esm",
    outfile: join(outdir, "index.mjs"),
    external: ["@aws-sdk/*"], // AWS SDK v3 is included in Lambda runtime
    minify: true,
    sourcemap: false,
  });

  // Create a marker file so we know this is a pre-bundled Lambda
  writeFileSync(
    join(outdir, ".bundled"),
    `Bundled at: ${new Date().toISOString()}\n`
  );

  console.log(`✓ Built ${name} -> dist/lambda/${name}/index.mjs`);
  return outdir;
}

async function main() {
  console.log("Building Lambda functions...\n");

  await bundleLambda(
    "event-processor",
    join(packageRoot, "lambda", "event-processor", "index.ts")
  );

  console.log("\n✓ All Lambda functions bundled successfully");
}

main().catch((error) => {
  console.error("Failed to bundle Lambda functions:", error);
  process.exit(1);
});
