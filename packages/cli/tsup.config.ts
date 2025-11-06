import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  shims: true,
  splitting: false,
  bundle: true,
  minify: false, // Keep readable for debugging
  sourcemap: true,
  target: 'node20',
  outDir: 'dist',
  onSuccess: 'chmod +x dist/cli.js',
});
