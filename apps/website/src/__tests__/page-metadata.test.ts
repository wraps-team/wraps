import { globSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Metadata } from "next";
import { describe, expect, it } from "vitest";
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

  it("defaults to the shared card with an alt that is the og title", () => {
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

  const sourceFiles = [
    ...globSync("src/app/**/*.{ts,tsx}", { cwd: webRoot }),
    ...globSync("src/components/**/*.{ts,tsx}", { cwd: webRoot }),
  ].filter((file) => !ALLOWED_TO_WRITE_SOCIAL_KEYS.has(file));

  it("no file under src/app or src/components writes an openGraph: or twitter: key", () => {
    // `twitter: "https://..."` in sample data is not a metadata key, so only an
    // object literal after the key counts.
    const offenders = sourceFiles.filter((file) =>
      /^\s*(openGraph|twitter)\s*:\s*\{/m.test(read(file))
    );
    expect(offenders).toEqual([]);
  });

  it("every page.tsx that exports metadata or generateMetadata goes through pageMetadata or a builder", () => {
    const pages = globSync("src/app/**/page.tsx", { cwd: webRoot });
    const exporters = pages.filter((file) =>
      /export\s+(const\s+metadata\b|(async\s+)?function\s+generateMetadata\b)/.test(
        read(file)
      )
    );
    expect(exporters.length).toBeGreaterThan(0);
    const offenders = exporters.filter((file) => {
      const source = read(file);
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
      expect(read(file), file).toMatch(/\bpageMetadata\(/);
    }
  });

  it("the root layout takes its shared card and origin from the helper", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain("DEFAULT_OG_IMAGE");
    expect(layout).toContain("SITE_URL");
  });
});
