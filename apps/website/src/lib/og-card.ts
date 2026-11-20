import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signing for the `/og` card route (`src/app/og/route.tsx`).
 *
 * Every `/og?title=…&section=…&sig=…` URL is minted by `pageMetadata` at build
 * time and signed with `OG_IMAGE_SECRET`, so nobody can make wraps.dev render
 * arbitrary text on an image that carries its logo. The route verifies the
 * signature and serves the generic card when it fails.
 */

/** Longest title the route will draw. The helper clamps to this before signing. */
export const OG_TITLE_MAX = 200;
/** Longest section label the route will draw. */
export const OG_SECTION_MAX = 24;
/** Hex characters kept from the HMAC-SHA256 digest. */
export const OG_SIG_LENGTH = 16;

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
  section?: string | null;
  title: string;
};

/**
 * Canonical form of the signed values: the decoded title and section in a
 * fixed order, percent-encoded one way. Signing this rather than the raw query
 * string means `+` versus `%20` and parameter order can't break verification.
 * A missing section and an empty one sign the same.
 */
function canonicalQuery({ title, section }: OgCard): string {
  return new URLSearchParams([
    ["title", title],
    ["section", section ?? ""],
  ]).toString();
}

export function signOgCard(card: OgCard, secret: string): string {
  return createHmac("sha256", secret)
    .update(canonicalQuery(card))
    .digest("hex")
    .slice(0, OG_SIG_LENGTH);
}

const SIG_PATTERN = new RegExp(`^[0-9a-f]{${OG_SIG_LENGTH}}$`);

/** Constant-time check. Fails closed on a missing secret or a malformed `sig`. */
export function verifyOgCard(
  card: OgCard & { sig: string | null | undefined },
  secret: string | undefined
): boolean {
  if (!secret || typeof card.sig !== "string" || !SIG_PATTERN.test(card.sig)) {
    return false;
  }
  const expected = Buffer.from(signOgCard(card, secret));
  const actual = Buffer.from(card.sig);
  // timingSafeEqual throws on unequal lengths; the pattern above rules that out.
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * The `/og?…` path for a page, or `null` when `OG_IMAGE_SECRET` is unset (or
 * the title is empty). The caller keeps its default image on `null`, so a
 * missing env var degrades to the generic card instead of breaking images.
 */
export function ogCardPath(
  { title, path }: { title: string; path: string },
  secret: string | undefined = process.env.OG_IMAGE_SECRET
): string | null {
  const clean = clampOgTitle(title);
  if (!(secret && clean)) {
    return null;
  }
  const section = ogSection(path);
  const params = new URLSearchParams({ title: clean });
  if (section) {
    params.set("section", section);
  }
  params.set("sig", signOgCard({ title: clean, section }, secret));
  return `/og?${params.toString()}`;
}

/**
 * What the route may draw for a request: the title and section when `sig`
 * verifies and both are within bounds, otherwise `null` (serve the generic card).
 */
export function parseOgCardRequest(
  params: URLSearchParams,
  secret: string | undefined
): { title: string; section: string } | null {
  const title = params.get("title") ?? "";
  const section = params.get("section") ?? "";
  if (
    title === "" ||
    Array.from(title).length > OG_TITLE_MAX ||
    Array.from(section).length > OG_SECTION_MAX
  ) {
    return null;
  }
  if (!verifyOgCard({ title, section, sig: params.get("sig") }, secret)) {
    return null;
  }
  return { title, section };
}
