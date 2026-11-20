import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Font reads fail; the generic card and the logo still read.
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    readFile: vi.fn((path: string, ...rest: unknown[]) =>
      String(path).endsWith(".ttf")
        ? Promise.reject(
            Object.assign(new Error("tracing dropped it"), { name: "ENOENT" })
          )
        : (actual.readFile as (...args: unknown[]) => Promise<Buffer>)(
            path,
            ...rest
          )
    ),
  };
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GET } from "@/app/og/route";
import { ogCardPath } from "@/lib/og-card";

const SECRET = "test-secret-not-for-production-0123456789";
const GENERIC = readFileSync(join(process.cwd(), "public/og-image.png"));

describe("GET /og when the card assets cannot be read", () => {
  const before = process.env.OG_IMAGE_SECRET;
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.OG_IMAGE_SECRET = SECRET;
    log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    log.mockRestore();
    if (before === undefined) {
      delete process.env.OG_IMAGE_SECRET;
    } else {
      process.env.OG_IMAGE_SECRET = before;
    }
  });

  it("still serves the generic card for a bad sig", async () => {
    const response = await GET(new Request("https://wraps.dev/og?d=x&sig=y"));
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer()).equals(GENERIC)).toBe(
      true
    );
    expect(log).not.toHaveBeenCalled();
  });

  it("serves the generic card for a signed card, briefly cached, and logs the error name only", async () => {
    const path = ogCardPath(
      { title: "Real", path: "/docs/x" },
      SECRET
    ) as string;
    const response = await GET(new Request(new URL(path, "https://wraps.dev")));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=60, s-maxage=60"
    );
    expect(Buffer.from(await response.arrayBuffer()).equals(GENERIC)).toBe(
      true
    );
    expect(log).toHaveBeenCalledTimes(1);
    const logged = log.mock.calls[0].join(" ");
    expect(logged).toContain("ENOENT");
    expect(logged).not.toContain("tracing dropped it");
  });
});
