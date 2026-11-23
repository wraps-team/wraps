import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

// Wrap createHmac so a test can prove a request was rejected before any HMAC.
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, createHmac: vi.fn(actual.createHmac) };
});

import { createHmac } from "node:crypto";
import {
  cardRoute,
  clampOgTitle,
  encodeOgCard,
  hasCardGlyphs,
  hasMonoGlyphs,
  OG_CARD_VERSION,
  OG_GLYPH_RANGES,
  OG_MONO_GLYPH_RANGES,
  OG_PAYLOAD_MAX,
  OG_ROUTE_MAX,
  OG_SECTION_MAX,
  OG_SIG_LENGTH,
  OG_TITLE_MAX,
  ogCardPath,
  ogCardQuery,
  ogSection,
  parseOgCardRequest,
  signOgPayload,
  verifyOgPayload,
} from "@/lib/og-card";

const SECRET = "test-secret-not-for-production-0123456789";
const webRoot = resolve(__dirname, "..", "..");

/** `?d=…&sig=…` for a card, signed with SECRET. */
function signedSearch(
  title: string,
  section = "",
  route = "/docs/guides/dkim"
): string {
  const d = encodeOgCard({ title, section, route });
  return `?${ogCardQuery(d, signOgPayload(d, SECRET))}`;
}

describe("ogSection", () => {
  it.each([
    ["/docs/guides/aws-setup", "Docs"],
    ["/blog/some-post", "Blog"],
    ["/glossary/dkim", "Glossary"],
    ["/versus/sendgrid", "Compare"],
    ["/compare/resend", "Compare"],
    ["/alternatives/mailgun", "Compare"],
    ["/changelog/2026-11", "Changelog"],
    ["/ses/errors/554", "Amazon SES"],
    ["/tools/spf-builder", "Tools"],
    ["/migrate/from-sendgrid", "Migrate"],
  ])("%s is labelled %s", (path, label) => {
    expect(ogSection(path)).toBe(label);
  });

  it("gives no label to other sections, the root, and prototype keys", () => {
    expect(ogSection("/")).toBe("");
    expect(ogSection("")).toBe("");
    expect(ogSection("/about")).toBe("");
    expect(ogSection("/constructor/x")).toBe("");
    expect(ogSection("/__proto__")).toBe("");
  });

  it("reads only the first path segment", () => {
    expect(ogSection("/about/docs")).toBe("");
    expect(ogSection("docs/quickstart")).toBe("Docs");
  });
});

describe("clampOgTitle", () => {
  it("collapses whitespace and trims", () => {
    expect(clampOgTitle("  Hello \n  world\t")).toBe("Hello world");
  });

  it("leaves a title at the cap alone", () => {
    const title = "a".repeat(OG_TITLE_MAX);
    expect(clampOgTitle(title)).toBe(title);
  });

  it("cuts a longer title to the cap with an ellipsis", () => {
    const clamped = clampOgTitle("a".repeat(OG_TITLE_MAX + 50));
    expect(Array.from(clamped)).toHaveLength(OG_TITLE_MAX);
    expect(clamped.endsWith("…")).toBe(true);
  });

  it("does not split a surrogate pair", () => {
    const clamped = clampOgTitle("😀".repeat(OG_TITLE_MAX + 5));
    expect(Array.from(clamped)).toHaveLength(OG_TITLE_MAX);
    expect(clamped).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });
});

describe("signOgPayload / verifyOgPayload", () => {
  const d = encodeOgCard({
    title: "Configure DKIM",
    section: "Docs",
    route: "/docs/x",
  });

  it("signs to 16 lowercase hex characters, deterministically", () => {
    const sig = signOgPayload(d, SECRET);
    expect(sig).toMatch(/^[0-9a-f]{16}$/);
    expect(OG_SIG_LENGTH).toBe(16);
    expect(signOgPayload(d, SECRET)).toBe(sig);
  });

  it("round-trips", () => {
    expect(verifyOgPayload(d, signOgPayload(d, SECRET), SECRET)).toBe(true);
  });

  it("rejects a tampered payload and a signature from another secret", () => {
    const sig = signOgPayload(d, SECRET);
    const other = encodeOgCard({
      title: "Configure DKIM!",
      section: "Docs",
      route: "/docs/x",
    });
    expect(verifyOgPayload(other, sig, SECRET)).toBe(false);
    expect(verifyOgPayload(d, signOgPayload(d, "another-secret"), SECRET)).toBe(
      false
    );
  });

  it("fails closed on a missing, short, long, non-hex or upper-case signature", () => {
    const sig = signOgPayload(d, SECRET);
    for (const bad of [
      null,
      undefined,
      "",
      sig.slice(0, 15),
      `${sig}0`,
      "z".repeat(16),
      sig.toUpperCase(),
    ]) {
      expect(verifyOgPayload(d, bad, SECRET)).toBe(false);
    }
  });

  it("fails closed when there is no secret", () => {
    const sig = signOgPayload(d, SECRET);
    expect(verifyOgPayload(d, sig, undefined)).toBe(false);
    expect(verifyOgPayload(d, sig, "")).toBe(false);
  });
});

describe("encodeOgCard", () => {
  it("carries the version, title and section as base64url JSON", () => {
    const d = encodeOgCard({
      title: "A & B = C",
      section: "Docs",
      route: "/docs/guides/dkim",
    });
    expect(d).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(JSON.parse(Buffer.from(d, "base64url").toString())).toEqual({
      v: OG_CARD_VERSION,
      t: "A & B = C",
      s: "Docs",
      r: "/docs/guides/dkim",
    });
  });

  it("treats a missing section and an empty one the same", () => {
    expect(encodeOgCard({ title: "T", route: "/x" })).toBe(
      encodeOgCard({ title: "T", section: "", route: "/x" })
    );
  });
});

describe("ogCardPath", () => {
  it("returns null without a secret, so the caller keeps its default image", () => {
    expect(ogCardPath({ title: "T", path: "/docs/x" }, undefined)).toBeNull();
    expect(ogCardPath({ title: "T", path: "/docs/x" }, "")).toBeNull();
  });

  it("returns null for a title that is empty once cleaned", () => {
    expect(ogCardPath({ title: "  \n ", path: "/docs/x" }, SECRET)).toBeNull();
  });

  it("returns null for a title with a character the card font lacks", () => {
    expect(ogCardPath({ title: "A → B", path: "/docs/x" }, SECRET)).toBeNull();
    expect(ogCardPath({ title: "日本語", path: "/docs/x" }, SECRET)).toBeNull();
  });

  it("builds /og?d=…&sig=… that the route accepts, with no escapes in it", () => {
    const path = ogCardPath(
      { title: "SES bounce rate & you", path: "/docs/guides/bounces" },
      SECRET
    ) as string;
    expect(path).toMatch(/^\/og\?d=[A-Za-z0-9_-]+&sig=[0-9a-f]{16}$/);
    expect(parseOgCardRequest(path.slice("/og".length), SECRET)).toEqual({
      title: "SES bounce rate & you",
      section: "Docs",
      route: "/docs/guides/bounces",
    });
  });

  it("carries the page path as the route, trimming a trailing slash", () => {
    const path = ogCardPath(
      { title: "T", path: "/docs/guides/dkim/" },
      SECRET
    ) as string;
    expect(parseOgCardRequest(path.slice("/og".length), SECRET)?.route).toBe(
      "/docs/guides/dkim"
    );
  });

  it("returns null for a path the card can't draw, so the page keeps the shared card", () => {
    for (const path of [
      "docs/x",
      "/has space",
      "/ü",
      "/a?b=c",
      `/${"a".repeat(OG_ROUTE_MAX)}`,
    ]) {
      expect(ogCardPath({ title: "T", path }, SECRET), path).toBeNull();
    }
    expect(cardRoute("/docs/x/")).toBe("/docs/x");
    expect(cardRoute("/")).toBe("/");
  });

  it("gives a page without a section an empty label", () => {
    const path = ogCardPath(
      { title: "About", path: "/about" },
      SECRET
    ) as string;
    expect(parseOgCardRequest(path.slice("/og".length), SECRET)).toEqual({
      title: "About",
      section: "",
      route: "/about",
    });
  });

  it("clamps a long title before signing so the route still accepts it", () => {
    const path = ogCardPath(
      { title: "x".repeat(OG_TITLE_MAX * 2), path: "/blog/p" },
      SECRET
    ) as string;
    const card = parseOgCardRequest(path.slice("/og".length), SECRET);
    expect(Array.from(card?.title ?? "")).toHaveLength(OG_TITLE_MAX);
  });

  it("reads the secret from OG_IMAGE_SECRET when none is passed", () => {
    const before = process.env.OG_IMAGE_SECRET;
    try {
      process.env.OG_IMAGE_SECRET = SECRET;
      expect(ogCardPath({ title: "T", path: "/docs/x" })).toMatch(/^\/og\?/);
      process.env.OG_IMAGE_SECRET = "";
      expect(ogCardPath({ title: "T", path: "/docs/x" })).toBeNull();
      delete process.env.OG_IMAGE_SECRET;
      expect(ogCardPath({ title: "T", path: "/docs/x" })).toBeNull();
    } finally {
      if (before === undefined) {
        delete process.env.OG_IMAGE_SECRET;
      } else {
        process.env.OG_IMAGE_SECRET = before;
      }
    }
  });
});

describe("parseOgCardRequest", () => {
  it("accepts the canonical query and returns the route", () => {
    expect(parseOgCardRequest(signedSearch("Hello", "Docs"), SECRET)).toEqual({
      title: "Hello",
      section: "Docs",
      route: "/docs/guides/dkim",
    });
  });

  it("rejects an extra parameter, a reordered query, and a re-encoded payload", () => {
    const search = signedSearch("Hello", "Docs");
    const [dPart, sigPart] = search.slice(1).split("&");
    expect(parseOgCardRequest(`${search}&x=1`, SECRET)).toBeNull();
    expect(parseOgCardRequest(`${search}&`, SECRET)).toBeNull();
    expect(parseOgCardRequest(`?x=1&${search.slice(1)}`, SECRET)).toBeNull();
    expect(parseOgCardRequest(`?${sigPart}&${dPart}`, SECRET)).toBeNull();
    // A character of `d` written as a percent escape decodes to the same value.
    const first = dPart.charAt(2);
    const escaped = `?d=${dPart.slice(2, 2)}${dPart
      .slice(2)
      .replace(first, `%${first.charCodeAt(0).toString(16)}`)}&${sigPart}`;
    expect(parseOgCardRequest(escaped, SECRET)).toBeNull();
    // Duplicate parameters: the first one verifies, the request is still not canonical.
    expect(parseOgCardRequest(`${search}&d=other`, SECRET)).toBeNull();
    // A fragment-less, query-less or bare request.
    expect(parseOgCardRequest("", SECRET)).toBeNull();
    expect(parseOgCardRequest("?", SECRET)).toBeNull();
  });

  it("rejects a bad, missing, empty or tampered signature", () => {
    const d = encodeOgCard({
      title: "Hello",
      section: "Docs",
      route: "/docs/x",
    });
    for (const search of [
      `?d=${d}&sig=${"0".repeat(16)}`,
      `?d=${d}`,
      `?d=${d}&sig=`,
      `?${ogCardQuery(encodeOgCard({ title: "Buy crypto", section: "Docs", route: "/docs/x" }), signOgPayload(d, SECRET))}`,
    ]) {
      expect(parseOgCardRequest(search, SECRET)).toBeNull();
    }
  });

  it("rejects a payload that is not a card of the current version", () => {
    const sign = (value: unknown) => {
      const d = Buffer.from(JSON.stringify(value)).toString("base64url");
      return `?${ogCardQuery(d, signOgPayload(d, SECRET))}`;
    };
    const ok = { v: OG_CARD_VERSION, t: "T", s: "", r: "/docs/x" };
    expect(parseOgCardRequest(sign(ok), SECRET)).toEqual({
      title: "T",
      section: "",
      route: "/docs/x",
    });
    for (const bad of [
      { ...ok, v: OG_CARD_VERSION + 1 },
      { ...ok, v: undefined },
      { ...ok, t: "" },
      { ...ok, t: 5 },
      { ...ok, s: null },
      { ...ok, r: undefined },
      { ...ok, r: 5 },
      { ...ok, r: "docs/x" },
      { ...ok, r: "/docs/a b" },
      { ...ok, r: "/docs/x?y=1" },
      { ...ok, r: "/docs/%2e%2e" },
      { ...ok, r: "/docs/ü" },
      { ...ok, r: `/${"a".repeat(OG_ROUTE_MAX)}` },
      "just a string",
      null,
      [],
    ]) {
      expect(parseOgCardRequest(sign(bad), SECRET)).toBeNull();
    }
    const notJson = Buffer.from("not json").toString("base64url");
    expect(
      parseOgCardRequest(
        `?${ogCardQuery(notJson, signOgPayload(notJson, SECRET))}`,
        SECRET
      )
    ).toBeNull();
  });

  it("rejects an over-long title or section even with a valid signature", () => {
    expect(
      parseOgCardRequest(signedSearch("t".repeat(OG_TITLE_MAX + 1)), SECRET)
    ).toBeNull();
    expect(
      parseOgCardRequest(
        signedSearch("T", "s".repeat(OG_SECTION_MAX + 1)),
        SECRET
      )
    ).toBeNull();
    // At the caps it is fine.
    expect(
      parseOgCardRequest(
        signedSearch("t".repeat(OG_TITLE_MAX), "s".repeat(OG_SECTION_MAX)),
        SECRET
      )
    ).not.toBeNull();
  });

  it("rejects an oversized payload before computing any HMAC", () => {
    const d = "A".repeat(OG_PAYLOAD_MAX + 1);
    const sig = signOgPayload(d, SECRET); // valid for d, so only the size can reject it
    vi.mocked(createHmac).mockClear();
    expect(parseOgCardRequest(`?d=${d}&sig=${sig}`, SECRET)).toBeNull();
    expect(createHmac).not.toHaveBeenCalled();
  });

  it("rejects a malformed or non-canonical request before computing any HMAC", () => {
    const search = signedSearch("Hello");
    vi.mocked(createHmac).mockClear();
    expect(parseOgCardRequest(`${search}&x=1`, SECRET)).toBeNull();
    expect(parseOgCardRequest("?d=%00%01&sig=0", SECRET)).toBeNull();
    expect(parseOgCardRequest("?d=&sig=0", SECRET)).toBeNull();
    expect(createHmac).not.toHaveBeenCalled();
    // Control: the canonical request does reach the HMAC.
    expect(parseOgCardRequest(search, SECRET)).not.toBeNull();
    expect(createHmac).toHaveBeenCalled();
  });

  it("round-trips the route, and rejects a tampered one with the old signature", () => {
    const d = encodeOgCard({
      title: "Hello",
      section: "Docs",
      route: "/docs/a",
    });
    const sig = signOgPayload(d, SECRET);
    expect(parseOgCardRequest(`?${ogCardQuery(d, sig)}`, SECRET)?.route).toBe(
      "/docs/a"
    );
    const forged = encodeOgCard({
      title: "Hello",
      section: "Docs",
      route: "/docs/b",
    });
    expect(
      parseOgCardRequest(`?${ogCardQuery(forged, sig)}`, SECRET)
    ).toBeNull();
  });

  it("rejects an invalid or oversized route before computing any HMAC", () => {
    const routes = [
      "docs/no-leading-slash",
      "/has space",
      "/query?x=1",
      "/encoded/%2e%2e",
      "/unicode/ü",
      "/",
      `/${"a".repeat(OG_ROUTE_MAX)}`,
    ];
    for (const route of routes.filter((r) => r !== "/")) {
      const d = encodeOgCard({ title: "T", section: "", route });
      // Valid signature, so only the route can reject it.
      const sig = signOgPayload(d, SECRET);
      vi.mocked(createHmac).mockClear();
      expect(
        parseOgCardRequest(`?${ogCardQuery(d, sig)}`, SECRET),
        route
      ).toBeNull();
      expect(createHmac, route).not.toHaveBeenCalled();
    }
    // The bare root path is a valid route (the panel then shows just wraps.dev).
    expect(parseOgCardRequest(signedSearch("T", "", "/"), SECRET)?.route).toBe(
      "/"
    );
    // At the cap it is fine.
    expect(
      parseOgCardRequest(
        signedSearch("T", "", `/${"a".repeat(OG_ROUTE_MAX - 1)}`),
        SECRET
      )
    ).not.toBeNull();
  });

  it("rejects everything when the secret is unset", () => {
    expect(
      parseOgCardRequest(signedSearch("Hello", "Docs"), undefined)
    ).toBeNull();
    expect(parseOgCardRequest(signedSearch("Hello", "Docs"), "")).toBeNull();
  });
});

/** Code points in a ttf's cmap (format 4 and 12 subtables), read from the file. */
function cmapCodePoints(file: string): Set<number> {
  const font = readFileSync(resolve(webRoot, file));
  const tables = font.readUInt16BE(4);
  let cmapOffset = -1;
  for (let i = 0; i < tables; i++) {
    const record = 12 + i * 16;
    if (font.toString("ascii", record, record + 4) === "cmap") {
      cmapOffset = font.readUInt32BE(record + 8);
    }
  }
  expect(cmapOffset).toBeGreaterThan(0);
  const points = new Set<number>();
  const subtables = font.readUInt16BE(cmapOffset + 2);
  for (let i = 0; i < subtables; i++) {
    const start = cmapOffset + font.readUInt32BE(cmapOffset + 4 + i * 8 + 4);
    const format = font.readUInt16BE(start);
    if (format === 4) {
      const segments = font.readUInt16BE(start + 6) / 2;
      const ends = start + 14;
      const starts = ends + segments * 2 + 2;
      for (let s = 0; s < segments; s++) {
        const low = font.readUInt16BE(starts + s * 2);
        const high = font.readUInt16BE(ends + s * 2);
        for (let code = low; code <= high && code !== 0xff_ff; code++) {
          points.add(code);
        }
      }
    } else if (format === 12) {
      const groups = font.readUInt32BE(start + 12);
      for (let g = 0; g < groups; g++) {
        const group = start + 16 + g * 12;
        for (
          let code = font.readUInt32BE(group);
          code <= font.readUInt32BE(group + 4);
          code++
        ) {
          points.add(code);
        }
      }
    }
  }
  return points;
}

describe("card font coverage", () => {
  const inter = cmapCodePoints("src/app/og/fonts/inter-600.ttf");

  it("OG_GLYPH_RANGES is exactly the printable code points in inter-600.ttf", () => {
    const listed = new Set<number>();
    for (const [low, high] of OG_GLYPH_RANGES) {
      for (let code = low; code <= high; code++) {
        listed.add(code);
      }
    }
    const printable = [...inter].filter((code) => code >= 0x20);
    expect([...listed].sort((a, b) => a - b)).toEqual(
      printable.sort((a, b) => a - b)
    );
  });

  it("covers the punctuation the site's titles use", () => {
    for (const char of [
      "—",
      "–",
      "’",
      "‘",
      "“",
      "”",
      "…",
      "€",
      "™",
      "•",
      "·",
    ]) {
      expect(hasCardGlyphs(char), char).toBe(true);
    }
    expect(hasCardGlyphs("→")).toBe(false);
    expect(hasCardGlyphs("≠")).toBe(false);
  });

  it("OG_MONO_GLYPH_RANGES is exactly the printable code points in jetbrains-mono-500.ttf", () => {
    const mono = cmapCodePoints("src/app/og/fonts/jetbrains-mono-500.ttf");
    const listed = new Set<number>();
    for (const [low, high] of OG_MONO_GLYPH_RANGES) {
      for (let code = low; code <= high; code++) {
        listed.add(code);
      }
    }
    expect([...listed].sort((a, b) => a - b)).toEqual(
      [...mono].filter((code) => code >= 0x20).sort((a, b) => a - b)
    );
  });

  it("the mono font covers every character a route may contain", () => {
    expect(hasMonoGlyphs("/abcdefghijklmnopqrstuvwxyz0123456789-._ABC")).toBe(
      true
    );
    expect(hasMonoGlyphs("→")).toBe(false);
  });

  it("the mono font has every character of the section labels and the domain", () => {
    const mono = cmapCodePoints("src/app/og/fonts/jetbrains-mono-500.ttf");
    const text = [
      ...new Set(
        "Docs Blog Glossary Compare Changelog Amazon SES Tools Migrate wraps.dev"
      ),
    ].flatMap((char) => [char, char.toUpperCase(), char.toLowerCase()]);
    for (const char of text) {
      expect(mono.has(char.codePointAt(0) ?? 0), char).toBe(true);
    }
  });
});

describe("OG_IMAGE_SECRET reaches the build", () => {
  // Pages sign their card URLs while they are prerendered, so the secret must
  // be in `next build`'s environment. Turbo 2 runs tasks in strict env mode and
  // drops any variable a task doesn't declare: without this entry Vercel's
  // build never saw the secret and every page fell back to /og-image.png.
  it("is declared in turbo.json's build task env", () => {
    const turbo = JSON.parse(
      readFileSync(resolve(webRoot, "../../turbo.json"), "utf8")
    ) as { tasks: { build: { env?: string[] } } };
    expect(turbo.tasks.build.env).toContain("OG_IMAGE_SECRET");
  });
});
