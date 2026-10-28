/**
 * `wraps email logs list --limit <n>`: the space form and the `=` form must
 * reach the API identically. Before the fix, `--limit -1` lost its value to
 * the arg parser, so the request silently fell back to the API default.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseCliArgs } from "../../utils/shared/arg-parser.js";

vi.mock("@clack/prompts");
vi.mock("../../utils/shared/api-target.js", () => ({
  resolveApiTarget: vi.fn(),
  checkApiTarget: vi.fn(),
}));

import {
  checkApiTarget,
  resolveApiTarget,
} from "../../utils/shared/api-target.js";
import { emailLogsList } from "../email/logs.js";

const argv = (...args: string[]) => [
  "node",
  "wraps",
  "email",
  "logs",
  "list",
  ...args,
];

/** Mirrors the router in cli.ts: parsed flags are passed straight through. */
async function runLogsList(...args: string[]): Promise<URL> {
  const { flags } = parseCliArgs(argv(...args));
  await emailLogsList({ limit: flags.limit, status: flags.status });
  const [url] = vi.mocked(fetch).mock.calls[0] as [string, unknown];
  return new URL(url);
}

describe("email logs list — --limit with a negative value", () => {
  beforeEach(() => {
    vi.mocked(resolveApiTarget).mockResolvedValue({} as never);
    vi.mocked(checkApiTarget).mockReturnValue({
      ok: true,
      target: { apiBase: "https://api.example.test", token: "t" },
    } as never);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ logs: [], total: 0, nextCursor: null }),
      }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("sends the same limit for --limit -1 as for --limit=-1", async () => {
    const spaced = await runLogsList("--limit", "-1");
    const attached = await runLogsList("--limit=-1");
    expect(spaced.searchParams.get("limit")).toBe("-1");
    expect(attached.searchParams.get("limit")).toBe("-1");
  });
});
