import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { parseOgCardRequest } from "@/lib/og-card";
import { OG_FONT_MONO, OG_FONT_SANS, OG_SIZE, OgCard } from "./card";

/**
 * GET /og?d=<payload>&sig=<hmac>
 *
 * One route draws the card for every page without an image of its own. URLs are
 * minted by `ogCardPath` (`src/lib/og-card.ts`) and signed with
 * `OG_IMAGE_SECRET`. The card is drawn only for exactly that query string; a
 * missing or bad `sig`, an unset secret, or any variant of the query (extra or
 * reordered parameters, another encoding) serves the generic card
 * (`public/og-image.png`) and never the requested text.
 *
 * Node runtime: fonts and logo are read from the repo, as in the Next.js
 * `opengraph-image` docs example. `next/og` reads ttf, not the site's woff2, so
 * the fonts are static ttf built by `fonts/build-fonts.py`.
 */

// One URL, one card. `s-maxage` is what lets Vercel's CDN keep the response (the
// CDN ignores `max-age` alone for a function), so a card is drawn once per
// deployment rather than on every unfurl.
const SIGNED_CACHE = "public, max-age=31536000, s-maxage=31536000, immutable";
// The generic card is cheap and the same for every bad request.
const GENERIC_CACHE = "public, max-age=3600, s-maxage=3600";
// A card that failed to draw: short, so a deterministic failure isn't retried on
// every hit but a fixed deploy recovers quickly.
const FAILURE_CACHE = "public, max-age=60, s-maxage=60";

const root = process.cwd();

/** Run `load` once; forget a failure so the next request tries again. */
function memoize<T>(load: () => Promise<T>): () => Promise<T> {
  let cached: Promise<T> | undefined;
  return () => {
    if (!cached) {
      cached = load().catch((error: unknown) => {
        cached = undefined;
        throw error;
      });
    }
    return cached;
  };
}

// Separate from the card assets: the generic card is what every failure falls
// back to, so it must not depend on the fonts and logo reading.
const loadGeneric = memoize(() => readFile(join(root, "public/og-image.png")));

const loadCardAssets = memoize(async () => {
  const [inter, mono, logo] = await Promise.all([
    readFile(join(root, "src/app/og/fonts/inter-600.ttf")),
    readFile(join(root, "src/app/og/fonts/jetbrains-mono-500.ttf")),
    readFile(join(root, "public/wraps-dark-logo.png")),
  ]);
  return {
    fonts: [
      { name: OG_FONT_SANS, data: inter, weight: 600, style: "normal" },
      { name: OG_FONT_MONO, data: mono, weight: 500, style: "normal" },
    ] as const,
    logoSrc: `data:image/png;base64,${logo.toString("base64")}`,
  };
});

function genericCard(png: Buffer, cacheControl = GENERIC_CACHE): Response {
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": cacheControl },
  });
}

export async function GET(request: Request): Promise<Response> {
  const generic = await loadGeneric();

  const card = parseOgCardRequest(
    new URL(request.url).search,
    process.env.OG_IMAGE_SECRET
  );
  if (!card) {
    return genericCard(generic);
  }

  try {
    const { fonts, logoSrc } = await loadCardAssets();
    // Drawing is lazy: read the PNG here so a failure lands in the catch below
    // rather than as a broken stream after the headers are sent.
    const png = await new ImageResponse(
      <OgCard
        logoSrc={logoSrc}
        route={card.route}
        section={card.section}
        title={card.title}
      />,
      { ...OG_SIZE, fonts: [...fonts] }
    ).arrayBuffer();
    return new Response(png, {
      headers: { "Content-Type": "image/png", "Cache-Control": SIGNED_CACHE },
    });
  } catch (error) {
    // A card that fails to draw must not break the page's share image. Say so
    // in the logs, or a broken font deploy would turn every card generic quietly.
    console.error(
      "og: card failed to draw, serving the generic card:",
      error instanceof Error
        ? [error.name, (error as NodeJS.ErrnoException).code]
            .filter(Boolean)
            .join(" ")
        : "unknown error"
    );
    return genericCard(generic, FAILURE_CACHE);
  }
}
