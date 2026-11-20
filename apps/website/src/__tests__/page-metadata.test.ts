import { globSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Metadata } from "next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseOgCardRequest } from "@/lib/og-card";
import {
  DEFAULT_OG_IMAGE,
  type PageMetadataInput,
  pageMetadata,
  SITE_URL,
} from "@/lib/page-metadata";

const webRoot = resolve(__dirname, "..", "..");
const read = (relativePath: string) =>
  readFileSync(resolve(webRoot, relativePath), "utf8");

const BASE = {
  title: "AWS Setup Guide",
  description: "Configure your AWS account for Wraps.",
  path: "/docs/guides/aws-setup",
};

function ogType(meta: Metadata): string | undefined {
  return (meta.openGraph as { type?: string } | null | undefined)?.type;
}

function images(value: unknown): Array<{ url: string; alt?: string }> {
  return (Array.isArray(value) ? value : [value]) as Array<{
    url: string;
    alt?: string;
  }>;
}

// Unset (empty counts as unset) unless a test sets it: the default-image
// tests below describe what ships when OG_IMAGE_SECRET is missing.
beforeEach(() => {
  vi.stubEnv("OG_IMAGE_SECRET", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("pageMetadata", () => {
  it("builds canonical and og:url from SITE_URL + path for a nested route", () => {
    const meta = pageMetadata(BASE);
    expect(SITE_URL).toBe("https://wraps.dev");
    expect(meta.alternates?.canonical).toBe(
      "https://wraps.dev/docs/guides/aws-setup"
    );
    expect(meta.openGraph?.url).toBe("https://wraps.dev/docs/guides/aws-setup");
  });

  it("maps '/' to the bare origin, what the homepage canonical emits today", () => {
    const meta = pageMetadata({ ...BASE, path: "/" });
    expect(meta.alternates?.canonical).toBe("https://wraps.dev");
    expect(meta.openGraph?.url).toBe("https://wraps.dev");
  });

  it("leaves <title> bare for the root template and suffixes og and twitter titles", () => {
    const meta = pageMetadata(BASE);
    expect(meta.title).toBe("AWS Setup Guide");
    expect(meta.openGraph?.title).toBe("AWS Setup Guide | Wraps");
    expect(meta.twitter?.title).toBe("AWS Setup Guide | Wraps");
  });

  it("throws when the title already ends in '| Wraps' (the double-suffix bug)", () => {
    expect(() =>
      pageMetadata({ ...BASE, title: "Inbound Email | Wraps" })
    ).toThrow(/\| Wraps/);
    expect(() =>
      pageMetadata({ ...BASE, social: { title: "Inbound Email | Wraps" } })
    ).toThrow(/\| Wraps/);
  });

  it("absoluteTitle bypasses the root template and the og suffix", () => {
    const meta = pageMetadata({
      ...BASE,
      title: "Wraps - The Email Platform for Amazon SES",
      absoluteTitle: true,
    });
    expect(meta.title).toEqual({
      absolute: "Wraps - The Email Platform for Amazon SES",
    });
    expect(meta.openGraph?.title).toBe(
      "Wraps - The Email Platform for Amazon SES"
    );
    expect(meta.twitter?.title).toBe(
      "Wraps - The Email Platform for Amazon SES"
    );
  });

  it("without OG_IMAGE_SECRET, defaults to the shared card with an alt that is the og title", () => {
    const meta = pageMetadata(BASE);
    const [og] = images(meta.openGraph?.images);
    expect(og).toMatchObject({
      url: DEFAULT_OG_IMAGE.url,
      width: DEFAULT_OG_IMAGE.width,
      height: DEFAULT_OG_IMAGE.height,
      alt: "AWS Setup Guide | Wraps",
    });
    const [tw] = images(meta.twitter?.images);
    expect(tw).toMatchObject({
      url: DEFAULT_OG_IMAGE.url,
      alt: "AWS Setup Guide | Wraps",
    });
  });

  describe("with OG_IMAGE_SECRET set", () => {
    const SECRET = "test-secret-not-for-production-0123456789";

    beforeEach(() => {
      vi.stubEnv("OG_IMAGE_SECRET", SECRET);
    });

    function cardOf(meta: Metadata) {
      const [og] = images(meta.openGraph?.images) as Array<{
        url: string;
        alt?: string;
        width?: number;
        height?: number;
      }>;
      return og;
    }

    it("defaults to a signed /og card with the page title and section", () => {
      const meta = pageMetadata(BASE);
      const og = cardOf(meta);
      expect(og).toMatchObject({
        width: 1200,
        height: 630,
        alt: "AWS Setup Guide | Wraps",
      });
      expect(og.url.startsWith("/og?")).toBe(true);
      const url = new URL(og.url, SITE_URL);
      expect(parseOgCardRequest(url.searchParams, SECRET)).toEqual({
        title: "AWS Setup Guide",
        section: "Docs",
      });
      // X gets the same card, with the same alt.
      const [tw] = images(meta.twitter?.images);
      expect(tw).toMatchObject({
        url: og.url,
        alt: "AWS Setup Guide | Wraps",
        width: 1200,
        height: 630,
      });
    });

    it("shows the social title when the page has one, never the | Wraps suffix", () => {
      const og = cardOf(
        pageMetadata({ ...BASE, social: { title: "Set up AWS for Wraps" } })
      );
      const url = new URL(og.url, SITE_URL);
      expect(parseOgCardRequest(url.searchParams, SECRET)?.title).toBe(
        "Set up AWS for Wraps"
      );
    });

    it("gives a page outside the section map a card with no label", () => {
      const og = cardOf(pageMetadata({ ...BASE, path: "/about" }));
      const url = new URL(og.url, SITE_URL);
      expect(url.searchParams.has("section")).toBe(false);
    });

    it("keeps the shared card on the homepage", () => {
      const og = cardOf(
        pageMetadata({
          title: "Wraps - The Email Platform for Amazon SES",
          description: "d",
          path: "/",
          absoluteTitle: true,
        })
      );
      expect(og.url).toBe(DEFAULT_OG_IMAGE.url);
    });

    it("keeps an explicit image, and emits none for image: null", () => {
      const explicit = pageMetadata({ ...BASE, image: "/media/release.png" });
      expect(cardOf(explicit).url).toBe("/media/release.png");
      expect(
        pageMetadata({ ...BASE, image: null }).openGraph
      ).not.toHaveProperty("images");
    });
  });

  it("keeps a bespoke image with its dimensions and alt, on both cards", () => {
    const meta = pageMetadata({
      ...BASE,
      image: {
        url: "/agents-og.png",
        width: 1200,
        height: 630,
        type: "image/png",
        alt: "Agent mailboxes",
      },
    });
    expect(images(meta.openGraph?.images)).toEqual([
      {
        url: "/agents-og.png",
        width: 1200,
        height: 630,
        type: "image/png",
        alt: "Agent mailboxes",
      },
    ]);
    expect(images(meta.twitter?.images)).toEqual([
      {
        url: "/agents-og.png",
        alt: "Agent mailboxes",
        width: 1200,
        height: 630,
      },
    ]);
  });

  it("image: null emits no images so a file-based opengraph-image keeps the card", () => {
    const meta = pageMetadata({ ...BASE, image: null });
    expect(meta.openGraph).not.toHaveProperty("images");
    expect(meta.twitter).not.toHaveProperty("images");
    expect(meta.twitter).toMatchObject({ card: "summary_large_image" });
  });

  it("gives a bare image URL an alt", () => {
    const meta = pageMetadata({ ...BASE, image: "/media/release.png" });
    expect(images(meta.openGraph?.images)).toEqual([
      { url: "/media/release.png", alt: "AWS Setup Guide | Wraps" },
    ]);
  });

  it("social overrides the og and twitter copy without touching <title> or description", () => {
    const meta = pageMetadata({
      ...BASE,
      social: { title: "AWS Setup", description: "Shorter social copy." },
    });
    expect(meta.title).toBe("AWS Setup Guide");
    expect(meta.description).toBe("Configure your AWS account for Wraps.");
    expect(meta.openGraph?.title).toBe("AWS Setup | Wraps");
    expect(meta.openGraph?.description).toBe("Shorter social copy.");
    expect(meta.twitter?.title).toBe("AWS Setup | Wraps");
    expect(meta.twitter?.description).toBe("Shorter social copy.");
  });

  it("social.titleSuffix replaces '| Wraps' where a page already used another suffix", () => {
    const meta = pageMetadata({
      ...BASE,
      social: { title: "Shipped a thing", titleSuffix: "Wraps Changelog" },
    });
    expect(meta.openGraph?.title).toBe("Shipped a thing | Wraps Changelog");
    expect(meta.twitter?.title).toBe("Shipped a thing | Wraps Changelog");
  });

  it("social.titleSuffix null keeps an editorial social title without the suffix", () => {
    const meta = pageMetadata({
      ...BASE,
      social: { title: "Give your agent an email address.", titleSuffix: null },
    });
    expect(meta.title).toBe("AWS Setup Guide");
    expect(meta.openGraph?.title).toBe("Give your agent an email address.");
    expect(meta.twitter?.title).toBe("Give your agent an email address.");
  });

  it("social.twitterCopy overrides the X card copy only, as written", () => {
    const meta = pageMetadata({
      ...BASE,
      social: {
        twitterCopy: { title: "X title", description: "X description" },
      },
    });
    expect(meta.openGraph?.title).toBe("AWS Setup Guide | Wraps");
    expect(meta.openGraph?.description).toBe(BASE.description);
    expect(meta.twitter?.title).toBe("X title");
    expect(meta.twitter?.description).toBe("X description");
  });

  it("emits article times and authors on articles only", () => {
    const article = pageMetadata({
      ...BASE,
      type: "article",
      publishedTime: "2026-01-21T00:00:00.000Z",
      modifiedTime: "2026-02-01T00:00:00.000Z",
      authors: ["Wraps Team"],
    });
    expect(article.openGraph).toMatchObject({
      type: "article",
      publishedTime: "2026-01-21T00:00:00.000Z",
      modifiedTime: "2026-02-01T00:00:00.000Z",
      authors: ["Wraps Team"],
    });

    const website = pageMetadata({
      ...BASE,
      publishedTime: "2026-01-21T00:00:00.000Z",
      modifiedTime: "2026-02-01T00:00:00.000Z",
      authors: ["Wraps Team"],
    });
    expect(ogType(website)).toBe("website");
    expect(website.openGraph).not.toHaveProperty("publishedTime");
    expect(website.openGraph).not.toHaveProperty("modifiedTime");
    expect(website.openGraph).not.toHaveProperty("authors");
  });

  it("always sets site, locale, type, card and description on both cards", () => {
    const inputs: PageMetadataInput[] = [
      BASE,
      { ...BASE, type: "article" },
      { ...BASE, path: "/" },
    ];
    for (const input of inputs) {
      const meta = pageMetadata(input);
      expect(meta.openGraph).toMatchObject({
        siteName: "Wraps",
        locale: "en_US",
        description: BASE.description,
      });
      expect(ogType(meta)).toBe(input.type ?? "website");
      expect(meta.twitter).toMatchObject({
        card: "summary_large_image",
        site: "@useWraps",
        description: BASE.description,
      });
    }
  });
});

// Next.js merges metadata shallowly, so a page that writes its own `openGraph`
// or `twitter` replaces the root's whole object and silently loses the shared
// fields (image, site, locale). The helper is the one place those keys are
// written; these checks keep it that way.
describe("metadata stays behind pageMetadata()", () => {
  const BUILDERS = [
    "versusMetadata",
    "glossaryMetadata",
    "sesTopicMetadata",
    "sesErrorMetadata",
  ];
  const ALLOWED_TO_WRITE_SOCIAL_KEYS = new Set([
    "src/app/layout.tsx",
    "src/lib/page-metadata.ts",
  ]);
  // The only key a page may add after `...pageMetadata(...)`. Anything else can
  // override what the helper just wrote (a `title` with the suffix, a different
  // `alternates.canonical`).
  const KEYS_ALLOWED_AFTER_SPREAD = new Set(["keywords"]);

  const sourceFiles = [
    ...globSync("src/app/**/*.{ts,tsx}", { cwd: webRoot }),
    ...globSync("src/components/**/*.{ts,tsx}", { cwd: webRoot }),
  ].filter((file) => !ALLOWED_TO_WRITE_SOCIAL_KEYS.has(file));

  /** Source with comments blanked, so a mention in a comment is not a call or a key. */
  const code = (file: string) =>
    read(file)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

  it("scans the source tree (a broken glob must not pass silently)", () => {
    expect(sourceFiles.length).toBeGreaterThan(200);
  });

  it("no file under src/app or src/components writes an openGraph, twitter or alternates key", () => {
    // Optional quotes, and any value that is not a string literal: a spread, an
    // identifier or an object all count. `twitter: "https://..."` in sample data
    // is a string, so it is not a metadata key.
    const keyPattern =
      /^\s*["']?(openGraph|twitter|alternates)["']?\s*:[ \t]*(?![ \t"'`])/m;
    const assignPattern = /\.(openGraph|twitter|alternates)\s*=[^=]/;
    const offenders = sourceFiles.filter((file) => {
      const source = code(file);
      return keyPattern.test(source) || assignPattern.test(source);
    });
    expect(offenders).toEqual([]);
  });

  it("no page but the homepage passes the shared /og-image.png to pageMetadata()", () => {
    // A page with no image of its own gets a signed /og card with its title.
    // Passing the shared image by hand opts out of that and shows the generic
    // card. Pages with a real image pass its URL; the homepage leaves `image`
    // out and keeps the shared one by default.
    const calls = (file: string) => {
      const source = code(file);
      const found: string[] = [];
      for (const match of source.matchAll(/\bpageMetadata\(/g)) {
        let depth = 1;
        let end = (match.index ?? 0) + match[0].length;
        while (end < source.length && depth > 0) {
          const char = source[end];
          depth += char === "(" ? 1 : char === ")" ? -1 : 0;
          end += 1;
        }
        found.push(source.slice(match.index, end));
      }
      return found;
    };
    const withCalls = sourceFiles.filter(
      (file) => file !== "src/app/page.tsx" && calls(file).length > 0
    );
    expect(withCalls.length).toBeGreaterThan(100);
    const offenders = withCalls.filter((file) =>
      calls(file).some((call) => /og-image\.png/.test(call))
    );
    expect(offenders).toEqual([]);
  });

  it("keys after a ...pageMetadata() spread are limited to keywords", () => {
    const spreaders = sourceFiles.filter((file) =>
      /\.\.\.pageMetadata\(/.test(code(file))
    );
    expect(spreaders.length).toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const file of spreaders) {
      const source = code(file);
      const start = source.indexOf("...pageMetadata(");
      // Walk to the paren that closes the call, then read the keys that follow
      // it at the top level of the enclosing object.
      let depth = 0;
      let end = -1;
      for (let i = source.indexOf("(", start); i < source.length; i++) {
        if (source[i] === "(") {
          depth++;
        } else if (source[i] === ")" && --depth === 0) {
          end = i;
          break;
        }
      }
      let braces = 0;
      for (const match of source
        .slice(end + 1)
        .matchAll(/[{}[\]]|^\s*["']?([A-Za-z]\w*)["']?\s*:/gm)) {
        const token = match[0].trim();
        if (token === "{" || token === "[") {
          braces++;
        } else if (token === "}" || token === "]") {
          if (--braces < 0) {
            break; // left the enclosing object
          }
        } else if (
          braces === 0 &&
          !KEYS_ALLOWED_AFTER_SPREAD.has(match[1] ?? "")
        ) {
          offenders.push(`${file}: ${match[1]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every page.tsx that exports metadata or generateMetadata goes through pageMetadata or a builder", () => {
    const pages = globSync("src/app/**/page.tsx", { cwd: webRoot });
    const exporters = pages.filter((file) =>
      /export\s+(const\s+(metadata|generateMetadata)\b|(async\s+)?function\s+generateMetadata\b)/.test(
        code(file)
      )
    );
    expect(exporters.length).toBeGreaterThan(0);
    const offenders = exporters.filter((file) => {
      const source = code(file);
      return !["pageMetadata", ...BUILDERS].some((name) =>
        new RegExp(`\\b${name}\\(`).test(source)
      );
    });
    expect(offenders).toEqual([]);
  });

  it("the four article builders call pageMetadata", () => {
    for (const file of [
      "src/components/versus-article.tsx",
      "src/components/glossary-article.tsx",
      "src/components/ses-topic-article.tsx",
      "src/components/ses-error-article.tsx",
    ]) {
      expect(code(file), file).toMatch(/\bpageMetadata\(/);
    }
  });

  it("the root layout takes its shared card and origin from the helper", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain("DEFAULT_OG_IMAGE");
    expect(layout).toContain("SITE_URL");
  });
});
