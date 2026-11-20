import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/og/route";
import {
  encodeOgCard,
  ogCardPath,
  ogCardQuery,
  signOgPayload,
} from "@/lib/og-card";

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
    // s-maxage is what makes Vercel's CDN cache a function response.
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=31536000, s-maxage=31536000, immutable"
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
    const d = encodeOgCard({
      title: "Real",
      section: "Docs",
      route: "/docs/x",
    });
    const sig = signOgPayload(d, SECRET);
    const other = encodeOgCard({
      title: "Buy crypto now",
      section: "Docs",
      route: "/docs/x",
    });
    for (const query of [
      `d=${d}&sig=0000000000000000`,
      `d=${other}&sig=${sig}`,
      `d=${d}`,
      `d=${d}&sig=`,
    ]) {
      const response = await GET(request(`/og?${query}`));
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/png");
      expect(response.headers.get("cache-control")).toBe(
        "public, max-age=3600, s-maxage=3600"
      );
      expect((await body(response)).equals(GENERIC)).toBe(true);
    }
  });

  it("draws only the canonical URL: a replayed signature under any variant gets the generic card", async () => {
    const d = encodeOgCard({
      title: "Real card",
      section: "Docs",
      route: "/docs/x",
    });
    const sig = signOgPayload(d, SECRET);
    const canonical = `/og?${ogCardQuery(d, sig)}`;

    const drawn = await GET(request(canonical));
    expect(drawn.status).toBe(200);
    expect((await body(drawn)).equals(GENERIC)).toBe(false);

    const escapedFirst = `%${d.charCodeAt(0).toString(16)}${d.slice(1)}`;
    for (const variant of [
      `${canonical}&x=1`,
      `${canonical}&x=2`,
      `/og?sig=${sig}&d=${d}`,
      `/og?d=${escapedFirst}&sig=${sig}`,
      `/og?d=${d}&sig=${sig}&d=${d}`,
    ]) {
      const response = await GET(request(variant));
      expect(response.status, variant).toBe(200);
      expect(response.headers.get("cache-control")).toBe(
        "public, max-age=3600, s-maxage=3600"
      );
      expect((await body(response)).equals(GENERIC), variant).toBe(true);
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
    const d = encodeOgCard({
      title: "t".repeat(201),
      section: "",
      route: "/docs/x",
    });
    const response = await GET(
      request(`/og?${ogCardQuery(d, signOgPayload(d, SECRET))}`)
    );
    expect((await body(response)).equals(GENERIC)).toBe(true);
  });
});
