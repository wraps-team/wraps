import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { parseOgCardRequest } from "@/lib/og-card";
import { OG_FONT_MONO, OG_FONT_SANS, OG_SIZE, OgCard } from "./card";

/**
 * GET /og?title=…&section=…&sig=…
 *
 * One route draws the card for every page without an image of its own. URLs are
 * signed by `ogCardPath` (`src/lib/og-card.ts`) with `OG_IMAGE_SECRET`; a
 * missing or bad `sig`, or an unset secret, serves the generic card
 * (`public/og-image.png`) and never the requested text.
 *
 * Node runtime: fonts and logo are read from the repo, as in the Next.js
 * `opengraph-image` docs example. `next/og` reads ttf, not the site's woff2, so
 * the fonts are static ttf built by `fonts/build-fonts.py`.
 */

// The signed URL carries the title, so a response never changes for a URL.
const SIGNED_CACHE = "public, max-age=31536000, immutable";
// Anything unsigned is cheap to serve and not worth pinning in a CDN for a year.
const GENERIC_CACHE = "public, max-age=3600, s-maxage=3600";

const root = process.cwd();

type Assets = {
  fonts: { name: string; data: Buffer; weight: 500 | 600; style: "normal" }[];
  generic: Buffer;
  logoSrc: string;
};

let assets: Promise<Assets> | undefined;

async function readAssets(): Promise<Assets> {
  const [inter, mono, generic, logo] = await Promise.all([
    readFile(join(root, "src/app/og/fonts/inter-600.ttf")),
    readFile(join(root, "src/app/og/fonts/jetbrains-mono-500.ttf")),
    readFile(join(root, "public/og-image.png")),
    readFile(join(root, "public/wraps-dark-logo.png")),
  ]);
  return {
    fonts: [
      { name: OG_FONT_SANS, data: inter, weight: 600, style: "normal" },
      { name: OG_FONT_MONO, data: mono, weight: 500, style: "normal" },
    ],
    generic,
    logoSrc: `data:image/png;base64,${logo.toString("base64")}`,
  };
}

function loadAssets(): Promise<Assets> {
  if (!assets) {
    assets = readAssets().catch((error: unknown) => {
      // Don't cache a failed read; the next request tries again.
      assets = undefined;
      throw error;
    });
  }
  return assets;
}

function genericCard(png: Buffer, cacheControl = GENERIC_CACHE): Response {
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": cacheControl },
  });
}

export async function GET(request: Request): Promise<Response> {
  const { fonts, generic, logoSrc } = await loadAssets();

  const card = parseOgCardRequest(
    new URL(request.url).searchParams,
    process.env.OG_IMAGE_SECRET
  );
  if (!card) {
    return genericCard(generic);
  }

  try {
    // Drawing is lazy: read the PNG here so a failure lands in the catch below
    // rather than as a broken stream after the headers are sent.
    const png = await new ImageResponse(
      <OgCard logoSrc={logoSrc} section={card.section} title={card.title} />,
      { ...OG_SIZE, fonts }
    ).arrayBuffer();
    return new Response(png, {
      headers: { "Content-Type": "image/png", "Cache-Control": SIGNED_CACHE },
    });
  } catch {
    // A card that fails to draw must not break the page's share image.
    return genericCard(generic, "no-store");
  }
}
