import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signing for the `/og` card route (`src/app/og/route.tsx`).
 *
 * Every card URL is minted by `pageMetadata` at build time and signed with
 * `OG_IMAGE_SECRET`, so nobody can make wraps.dev render arbitrary text on an
 * image that carries its logo. The URL carries one base64url payload and the
 * signature over it:
 *
 *   /og?d=<base64url(JSON {v, t: title, s: section, r: route})>&sig=<16 hex>
 *
 * A signature is public (it sits in the page HTML), so the route draws only
 * for exactly that query string. An extra parameter, a different order or a
 * re-encoded `d` is a different cache key for the same card, and each would
 * cost a render; those get the generic card instead.
 */

/**
 * Bump with any visual change to the card (`app/og/card.tsx`, the fonts, the
 * logo): the version is inside the signed payload, so every card URL changes
 * and the one-year `immutable` copies in browsers and scrapers are not reused.
 */
export const OG_CARD_VERSION = 1;

/** Longest title the route will draw. The helper clamps to this before signing. */
export const OG_TITLE_MAX = 200;
/** Longest section label the route will draw. */
export const OG_SECTION_MAX = 24;
/** Hex characters kept from the HMAC-SHA256 digest. */
export const OG_SIG_LENGTH = 16;
/** Longest route (page path) the route will draw in the card's panel. */
export const OG_ROUTE_MAX = 120;
/**
 * Longest `d` the route will decode. 200 four-byte characters, a 24 character
 * section and a 120 character route are about 1,100 bytes of JSON, so 1,600
 * base64url characters leaves room; anything longer cannot be a card we signed.
 */
export const OG_PAYLOAD_MAX = 1600;
/** A page path: a leading slash, then only what our routes use. */
const ROUTE_PATTERN = /^\/[A-Za-z0-9._/-]*$/;
const TRAILING_SLASHES = /\/+$/;

/**
 * Code point ranges the bundled `inter-600.ttf` has glyphs for (its cmap, from
 * the site's latin core subset). A title outside them would make `next/og`
 * fetch a fallback font from Google Fonts at render time, so `ogCardPath` gives
 * such a page the shared card instead. `og-card.test.ts` compares this list to
 * the font's real cmap, so rebuilding the fonts can't leave it stale.
 */
export const OG_GLYPH_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x20, 0x7e],
  [0xa0, 0xac],
  [0xae, 0xff],
  [0x1_31, 0x1_31],
  [0x1_52, 0x1_53],
  [0x2_bb, 0x2_bc],
  [0x2_c6, 0x2_c6],
  [0x2_da, 0x2_da],
  [0x2_dc, 0x2_dc],
  [0x3_04, 0x3_04],
  [0x3_08, 0x3_08],
  [0x20_02, 0x20_02],
  [0x20_09, 0x20_09],
  [0x20_0b, 0x20_0b],
  [0x20_13, 0x20_14],
  [0x20_18, 0x20_1a],
  [0x20_1c, 0x20_1e],
  [0x20_22, 0x20_22],
  [0x20_26, 0x20_26],
  [0x20_32, 0x20_33],
  [0x20_39, 0x20_3a],
  [0x20_44, 0x20_44],
  [0x20_ac, 0x20_ac],
  [0x21_22, 0x21_22],
  [0x21_91, 0x21_91],
  [0x21_93, 0x21_93],
  [0x22_12, 0x22_12],
  [0xfe_ff, 0xfe_ff],
];

/**
 * The same for `jetbrains-mono-500.ttf`, the font of the section label and of
 * the route in the bottom panel (also compared with the real cmap in a test).
 */
export const OG_MONO_GLYPH_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x20, 0x7e],
  [0xa0, 0xff],
  [0x1_31, 0x1_31],
  [0x1_52, 0x1_53],
  [0x2_bc, 0x2_bc],
  [0x2_c6, 0x2_c6],
  [0x2_da, 0x2_da],
  [0x2_dc, 0x2_dc],
  [0x3_04, 0x3_04],
  [0x3_08, 0x3_08],
  [0x20_13, 0x20_14],
  [0x20_18, 0x20_1a],
  [0x20_1c, 0x20_1e],
  [0x20_22, 0x20_22],
  [0x20_26, 0x20_26],
  [0x20_32, 0x20_33],
  [0x20_39, 0x20_3a],
  [0x20_44, 0x20_44],
  [0x20_ac, 0x20_ac],
  [0x21_22, 0x21_22],
  [0x21_91, 0x21_91],
  [0x21_93, 0x21_93],
  [0x22_12, 0x22_12],
  [0x22_15, 0x22_15],
  [0xfe_ff, 0xfe_ff],
];

function covers(
  ranges: ReadonlyArray<readonly [number, number]>,
  text: string
): boolean {
  return Array.from(text).every((char) => {
    const code = char.codePointAt(0) ?? 0;
    return ranges.some(([low, high]) => code >= low && code <= high);
  });
}

/** Whether every character of `text` has a glyph in the card's title font. */
export function hasCardGlyphs(text: string): boolean {
  return covers(OG_GLYPH_RANGES, text);
}

/** Whether every character of `text` has a glyph in the card's mono font. */
export function hasMonoGlyphs(text: string): boolean {
  return covers(OG_MONO_GLYPH_RANGES, text);
}

/**
 * A page path as the card shows it: leading slash, no trailing slash, only the
 * characters our routes use, within the cap and the mono font's glyphs.
 * `null` when it can't be drawn.
 */
export function cardRoute(path: string): string | null {
  const route = path.length > 1 ? path.replace(TRAILING_SLASHES, "") : path;
  if (
    route.length > OG_ROUTE_MAX ||
    !ROUTE_PATTERN.test(route) ||
    !hasMonoGlyphs(route)
  ) {
    return null;
  }
  return route;
}

/** First path segment to card label. Anything else gets no label. */
const SECTION_LABELS = new Map([
  ["docs", "Docs"],
  ["blog", "Blog"],
  ["glossary", "Glossary"],
  ["versus", "Compare"],
  ["compare", "Compare"],
  ["alternatives", "Compare"],
  ["changelog", "Changelog"],
  ["ses", "Amazon SES"],
  ["tools", "Tools"],
  ["migrate", "Migrate"],
]);

/** Label for a route such as `/docs/guides/aws-setup`; empty when it has none. */
export function ogSection(path: string): string {
  const first = path.split("/").find((segment) => segment !== "") ?? "";
  return SECTION_LABELS.get(first) ?? "";
}

/**
 * Collapse whitespace and cut to `OG_TITLE_MAX` characters with an ellipsis.
 * Counts code points, so an emoji is never split in half.
 */
export function clampOgTitle(title: string): string {
  const chars = Array.from(title.replace(/\s+/g, " ").trim());
  if (chars.length <= OG_TITLE_MAX) {
    return chars.join("");
  }
  return `${chars
    .slice(0, OG_TITLE_MAX - 1)
    .join("")
    .trimEnd()}…`;
}

type OgCard = {
  /** The page path, e.g. `/docs/guides/dkim`. */
  route: string;
  section?: string | null;
  title: string;
};

/** The payload `d`: the version, title, section and route as base64url JSON. */
export function encodeOgCard({ title, section, route }: OgCard): string {
  return Buffer.from(
    JSON.stringify({
      v: OG_CARD_VERSION,
      t: title,
      s: section ?? "",
      r: route,
    })
  ).toString("base64url");
}

const PAYLOAD_PATTERN = /^[A-Za-z0-9_-]+$/;

/** The card behind `d`, or `null` when it is malformed, a stale version or over the caps. */
function decodeOgCard(
  d: string
): { title: string; section: string; route: string } | null {
  if (d.length > OG_PAYLOAD_MAX || !PAYLOAD_PATTERN.test(d)) {
    return null;
  }
  let data: unknown;
  try {
    data = JSON.parse(Buffer.from(d, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) {
    return null;
  }
  const { v, t, s, r } = data as Record<string, unknown>;
  if (
    v !== OG_CARD_VERSION ||
    typeof t !== "string" ||
    typeof s !== "string" ||
    typeof r !== "string" ||
    t === "" ||
    Array.from(t).length > OG_TITLE_MAX ||
    Array.from(s).length > OG_SECTION_MAX ||
    r.length > OG_ROUTE_MAX ||
    !ROUTE_PATTERN.test(r)
  ) {
    return null;
  }
  return { title: t, section: s, route: r };
}

/** HMAC-SHA256 over the payload string `d`, kept to `OG_SIG_LENGTH` hex characters. */
export function signOgPayload(d: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(d)
    .digest("hex")
    .slice(0, OG_SIG_LENGTH);
}

const SIG_PATTERN = new RegExp(`^[0-9a-f]{${OG_SIG_LENGTH}}$`);

/** Constant-time check. Fails closed on a missing secret or a malformed `sig`. */
export function verifyOgPayload(
  d: string,
  sig: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!secret || typeof sig !== "string" || !SIG_PATTERN.test(sig)) {
    return false;
  }
  const expected = Buffer.from(signOgPayload(d, secret));
  const actual = Buffer.from(sig);
  // timingSafeEqual throws on unequal lengths; the pattern above rules that out.
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** The one query string a card is served for, without the leading `?`. */
export function ogCardQuery(d: string, sig: string): string {
  return `d=${d}&sig=${sig}`;
}

/**
 * The `/og?…` path for a page, or `null` when `OG_IMAGE_SECRET` is unset, the
 * title is empty, it has a character the card font lacks, or the path can't be
 * drawn as a route (`cardRoute`). The caller keeps
 * its default image on `null`, so a missing env var degrades to the shared card
 * instead of breaking images.
 */
export function ogCardPath(
  { title, path }: { title: string; path: string },
  secret: string | undefined = process.env.OG_IMAGE_SECRET
): string | null {
  const clean = clampOgTitle(title);
  const route = cardRoute(path);
  if (!(secret && clean && route && hasCardGlyphs(clean))) {
    return null;
  }
  const d = encodeOgCard({ title: clean, section: ogSection(path), route });
  return `/og?${ogCardQuery(d, signOgPayload(d, secret))}`;
}

/**
 * What the route may draw for a request, from its raw query string (`?d=…&sig=…`
 * as received): the title and section only when the query is exactly the one
 * `ogCardPath` writes, the signature verifies, and the decoded values are within
 * bounds. Otherwise `null` (serve the generic card). The caps and the payload
 * shape are checked before the HMAC.
 */
export function parseOgCardRequest(
  search: string,
  secret: string | undefined
): { title: string; section: string; route: string } | null {
  const params = new URLSearchParams(search);
  const d = params.get("d");
  const sig = params.get("sig");
  if (d === null || sig === null) {
    return null;
  }
  const card = decodeOgCard(d);
  if (!card) {
    return null;
  }
  // Exactly `?d=<d>&sig=<sig>`: no extra parameters, no other order or encoding.
  if (search !== `?${ogCardQuery(d, sig)}`) {
    return null;
  }
  return verifyOgPayload(d, sig, secret) ? card : null;
}
