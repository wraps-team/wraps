import type { Metadata } from "next";
import { ogCardPath } from "@/lib/og-card";

/**
 * The one place that writes `openGraph` and `twitter` metadata.
 *
 * Next.js merges metadata shallowly: a page that sets `openGraph` or `twitter`
 * replaces the root layout's object whole, so every field the page leaves out
 * (image, site, locale, card type) silently disappears from the rendered
 * `<head>`. Pages and article builders call `pageMetadata()` instead of
 * writing those keys by hand, and a test in `__tests__/page-metadata.test.ts`
 * fails when a file outside this one and the root layout does.
 */

export const SITE_URL = "https://wraps.dev";
export const SITE_NAME = "Wraps";
export const TWITTER_SITE = "@useWraps";

/** Root-layout fallback title (the homepage `<title>`) and description. */
export const SITE_TITLE = "Wraps - The Email Platform for Amazon SES";
export const SITE_DESCRIPTION =
  "Newsletters, automations, contacts and app emails in one platform your team can use. It runs on your own AWS account, with unlimited contacts on every plan.";

/**
 * The shared 1200x630 card: the homepage's image, and what every other page
 * falls back to when `OG_IMAGE_SECRET` is unset (see `defaultImageFor`).
 */
export const DEFAULT_OG_IMAGE = {
  url: "/og-image.png",
  width: 1200,
  height: 630,
  alt: "Wraps — Email infrastructure, deployed to your own AWS.",
};

const TITLE_SUFFIX = "Wraps";
const SUFFIX_PATTERN = /\|\s*Wraps\s*$/;

export type PageImage = {
  url: string;
  width?: number;
  height?: number;
  type?: string;
  alt?: string;
};

export type PageMetadataInput = {
  /**
   * The bare page title. The root layout's `%s | Wraps` template builds
   * `<title>`, and `og:title` / `twitter:title` are `${title} | Wraps` so the
   * three agree. Throws when it already ends in "| Wraps".
   */
  title: string;
  description: string;
  /** The route: "/docs/guides/aws-setup", or "/" for the homepage. */
  path: string;
  /**
   * Use `title` as written, with no template and no "| Wraps" suffix. Only the
   * homepage, whose `<title>` is the root layout's `title.default`.
   */
  absoluteTitle?: boolean;
  /**
   * Defaults to a signed `/og` card with the page's title, or DEFAULT_OG_IMAGE
   * on the homepage and when `OG_IMAGE_SECRET` is unset. A bare URL string gets the title as alt.
   * `null` emits no `images` at all, for a route with its own file-based
   * `opengraph-image`: an explicit `images` array in the metadata object wins
   * over that file, so the route can only keep its card by leaving it out.
   */
  image?: string | PageImage | ReadonlyArray<string | PageImage> | null;
  /** Defaults to "website". */
  type?: "website" | "article";
  /**
   * Social copy that differs from the page title or description. `title` is
   * bare like the page title. `titleSuffix` replaces "Wraps" in the "| Wraps"
   * suffix for pages that already used another one, and `null` drops the suffix
   * for an editorial social title that never carried it. `twitterCopy` holds copy
   * the X card words differently from the Open Graph card; its strings are used
   * as written.
   */
  social?: {
    title?: string;
    description?: string;
    titleSuffix?: string | null;
    twitterCopy?: { title?: string; description?: string };
  };
  /** Articles only; ignored on other types. */
  publishedTime?: string;
  modifiedTime?: string;
  authors?: string[];
};

function assertBareTitle(label: string, value: string): void {
  if (SUFFIX_PATTERN.test(value)) {
    throw new Error(
      `pageMetadata: ${label} "${value}" already ends in "| Wraps"; the root template and the og suffix add it. Pass the bare title.`
    );
  }
}

/**
 * The image for a page that passes none: a signed `/og` card showing its own
 * title and section (`app/og/route.tsx`), so a docs page, a glossary term and
 * a comparison no longer share one generic card. The homepage keeps
 * DEFAULT_OG_IMAGE, and so does every page when `OG_IMAGE_SECRET` is unset, so
 * a missing env var degrades to the shared card instead of breaking images.
 */
function defaultImageFor(
  { title, path, social }: PageMetadataInput,
  alt: string
): PageImage {
  const card =
    path === "/" ? null : ogCardPath({ title: social?.title ?? title, path });
  return card
    ? { url: card, width: 1200, height: 630, alt }
    : { ...DEFAULT_OG_IMAGE, alt };
}

function toImages(
  input: PageMetadataInput["image"],
  defaultImage: PageImage,
  fallbackAlt: string
): PageImage[] {
  if (input === undefined) {
    return [defaultImage];
  }
  if (input === null) {
    return [];
  }
  const list = (
    typeof input === "string" || !Array.isArray(input) ? [input] : input
  ) as Array<string | PageImage>;
  return list.map((entry) =>
    typeof entry === "string"
      ? { url: entry, alt: fallbackAlt }
      : { ...entry, alt: entry.alt ?? fallbackAlt }
  );
}

function socialTitleFor(input: PageMetadataInput): string {
  const { title, absoluteTitle = false, social } = input;
  const suffix =
    social?.titleSuffix === undefined ? TITLE_SUFFIX : social.titleSuffix;
  if (absoluteTitle) {
    return title;
  }
  assertBareTitle("title", title);
  if (social?.title !== undefined && suffix === TITLE_SUFFIX) {
    assertBareTitle("social.title", social.title);
  }
  const bare = social?.title ?? title;
  return suffix === null ? bare : `${bare} | ${suffix}`;
}

function articleFields(input: PageMetadataInput) {
  return {
    ...(input.publishedTime && { publishedTime: input.publishedTime }),
    ...(input.modifiedTime && { modifiedTime: input.modifiedTime }),
    ...(input.authors && { authors: input.authors }),
  };
}

export function pageMetadata(input: PageMetadataInput): Metadata {
  const { title, description, path, absoluteTitle = false, social } = input;
  const url = path === "/" ? SITE_URL : `${SITE_URL}${path}`;
  const socialTitle = socialTitleFor(input);
  const socialDescription = social?.description ?? description;
  const images = toImages(
    input.image,
    defaultImageFor(input, socialTitle),
    socialTitle
  );
  const imageFields = images.length > 0 ? { images } : {};

  const openGraphBase = {
    title: socialTitle,
    description: socialDescription,
    url,
    siteName: SITE_NAME,
    locale: "en_US",
    ...imageFields,
  };

  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    openGraph:
      input.type === "article"
        ? { ...openGraphBase, type: "article", ...articleFields(input) }
        : { ...openGraphBase, type: "website" },
    twitter: {
      card: "summary_large_image",
      site: TWITTER_SITE,
      title: social?.twitterCopy?.title ?? socialTitle,
      description: social?.twitterCopy?.description ?? socialDescription,
      ...(images.length > 0 && {
        images: images.map(({ url: imageUrl, alt, width, height }) => ({
          url: imageUrl,
          alt,
          ...(width !== undefined && { width }),
          ...(height !== undefined && { height }),
        })),
      }),
    },
    alternates: { canonical: url },
  };
}
