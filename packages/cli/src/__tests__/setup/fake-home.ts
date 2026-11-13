/**
 * Unit tests must never read or write the developer's real ~/.wraps or ~/.pulumi.
 *
 * Setting process.env.HOME inside a test does not work under pool "threads":
 * os.homedir() reads the process environment, not the worker's copy. So every
 * test file gets a mocked `os.homedir()` that returns a per-worker temp dir.
 *
 * Two constraints on this file:
 * - `vi.mock` must be a top-level call with a literal path.
 * - It must not import `node:os` itself, or the hoisted mock would run before
 *   `fakeHome` exists. The temp dir is created lazily with plain `fs`/`path`.
 *
 * A test file that mocks `node:os` itself replaces this mock for that file.
 */
import { afterAll, vi } from "vitest";

const fakeHome = vi.hoisted(
  () =>
    `${process.env.TMPDIR ?? "/tmp"}/wraps-cli-home-${process.pid}-${Math.random()
      .toString(36)
      .slice(2)}`
);

// Pulumi automation reads PULUMI_HOME for its CLI install and plugins.
process.env.PULUMI_HOME = `${fakeHome}/.pulumi`;

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  const homedir = () => fakeHome;
  return { ...actual, default: { ...actual, homedir }, homedir };
});
vi.mock("os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  const homedir = () => fakeHome;
  return { ...actual, default: { ...actual, homedir }, homedir };
});

afterAll(async () => {
  const { rmSync } = await import("node:fs");
  rmSync(fakeHome, { recursive: true, force: true });
});
