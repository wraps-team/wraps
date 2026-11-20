import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/og/route";
import { ogCardPath, signOgCard } from "@/lib/og-card";

const SECRET = "test-secret-not-for-production-0123456789";
const GENERIC = readFileSync(join(process.cwd(), "public/og-image.png"));

function request(path: string): Request {
  return new Request(new URL(path, "https://wraps.dev"));
}

/** Width and height from a PNG's IHDR chunk. */
function pngSize(bytes: Buffer): { width: number; height: number } {
  expect(bytes.subarray(1, 4).toString()).toBe("PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function body(response: Response): Promise<Buffer> {
  return Buffer.from(await response.arrayBuffer());
}

describe("GET /og", () => {
  const before = process.env.OG_IMAGE_SECRET;

  beforeEach(() => {
    process.env.OG_IMAGE_SECRET = SECRET;
  });

  afterEach(() => {
    if (before === undefined) {
      delete process.env.OG_IMAGE_SECRET;
    } else {
      process.env.OG_IMAGE_SECRET = before;
    }
  });

  it("draws a 1200x630 png for a signed URL, cached as immutable", async () => {
    const path = ogCardPath(
      { title: "Configure DKIM for Amazon SES", path: "/docs/guides/dkim" },
      SECRET
    ) as string;
    const response = await GET(request(path));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable"
    );
    const png = await body(response);
    expect(pngSize(png)).toEqual({ width: 1200, height: 630 });
    expect(png.equals(GENERIC)).toBe(false);
  });

  it("draws different text differently", async () => {
    const a = ogCardPath({ title: "First title", path: "/blog/a" }, SECRET);
    const b = ogCardPath({ title: "Second title", path: "/blog/b" }, SECRET);
    const [pa, pb] = await Promise.all([
      GET(request(a as string)).then(body),
      GET(request(b as string)).then(body),
    ]);
    expect(pa.equals(pb)).toBe(false);
  });

  it("serves the generic card, not the text, for a bad or tampered sig", async () => {
    const sig = signOgCard({ title: "Real", section: "Docs" }, SECRET);
    for (const query of [
      "title=Real&section=Docs&sig=0000000000000000",
      `title=Buy+crypto&section=Docs&sig=${sig}`,
      "title=Real&section=Docs",
      "title=Real&section=Docs&sig=",
    ]) {
      const response = await GET(request(`/og?${query}`));
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/png");
      expect(response.headers.get("cache-control")).not.toContain("immutable");
      expect((await body(response)).equals(GENERIC)).toBe(true);
    }
  });

  it("serves the generic card when no title is given", async () => {
    const response = await GET(request("/og"));
    expect((await body(response)).equals(GENERIC)).toBe(true);
  });

  it("serves the generic card for every request when the secret is unset", async () => {
    const path = ogCardPath(
      { title: "Real", path: "/docs/x" },
      SECRET
    ) as string;
    delete process.env.OG_IMAGE_SECRET;
    const response = await GET(request(path));
    expect((await body(response)).equals(GENERIC)).toBe(true);
  });

  it("serves the generic card for a title over the cap, even when signed", async () => {
    const title = "t".repeat(201);
    const sig = signOgCard({ title, section: "" }, SECRET);
    const response = await GET(request(`/og?title=${title}&sig=${sig}`));
    expect((await body(response)).equals(GENERIC)).toBe(true);
  });
});
