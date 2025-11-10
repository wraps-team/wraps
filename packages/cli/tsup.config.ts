import { cp } from "node:fs/promises";
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  dts: true,
  clean: false, // Don't clean - console UI files are already built here
  shims: true,
  splitting: false,
  bundle: true,
  minify: false, // Keep readable for debugging
  sourcemap: true,
  target: "node20",
  outDir: "dist",
  onSuccess: async () => {
    // Make CLI executable
    await import("node:fs/promises").then((fs) =>
      fs.chmod("dist/cli.js", 0o755)
    );
    // Copy Lambda source files to dist
    await cp("lambda", "dist/lambda", { recursive: true });
    console.log("✓ Copied Lambda sources to dist/");
  },
});
