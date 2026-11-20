import { describe, expect, it } from "vitest";
import {
  clampOgTitle,
  OG_SECTION_MAX,
  OG_SIG_LENGTH,
  OG_TITLE_MAX,
  ogCardPath,
  ogSection,
  parseOgCardRequest,
  signOgCard,
  verifyOgCard,
} from "@/lib/og-card";

const SECRET = "test-secret-not-for-production-0123456789";

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

describe("signOgCard / verifyOgCard", () => {
  const card = { title: "Configure DKIM", section: "Docs" };

  it("signs to 16 lowercase hex characters", () => {
    expect(signOgCard(card, SECRET)).toMatch(/^[0-9a-f]{16}$/);
    expect(OG_SIG_LENGTH).toBe(16);
  });

  it("is deterministic", () => {
    expect(signOgCard(card, SECRET)).toBe(signOgCard({ ...card }, SECRET));
  });

  it("round-trips", () => {
    const sig = signOgCard(card, SECRET);
    expect(verifyOgCard({ ...card, sig }, SECRET)).toBe(true);
  });

  it("rejects a tampered title", () => {
    const sig = signOgCard(card, SECRET);
    expect(
      verifyOgCard({ ...card, title: "Configure DKIM!", sig }, SECRET)
    ).toBe(false);
  });

  it("rejects a tampered section", () => {
    const sig = signOgCard(card, SECRET);
    expect(verifyOgCard({ ...card, section: "Blog", sig }, SECRET)).toBe(false);
  });

  it("rejects a signature from another secret", () => {
    const sig = signOgCard(card, "another-secret");
    expect(verifyOgCard({ ...card, sig }, SECRET)).toBe(false);
  });

  it("does not let title and section trade characters", () => {
    const a = signOgCard({ title: "a&section=b", section: "" }, SECRET);
    const b = signOgCard({ title: "a", section: "b" }, SECRET);
    expect(a).not.toBe(b);
  });

  it("treats a missing section and an empty one the same", () => {
    const sig = signOgCard({ title: "T", section: "" }, SECRET);
    expect(signOgCard({ title: "T" }, SECRET)).toBe(sig);
    expect(verifyOgCard({ title: "T", sig }, SECRET)).toBe(true);
  });

  it("fails closed on a missing, short, long or non-hex signature", () => {
    const sig = signOgCard(card, SECRET);
    expect(verifyOgCard({ ...card, sig: null }, SECRET)).toBe(false);
    expect(verifyOgCard({ ...card, sig: "" }, SECRET)).toBe(false);
    expect(verifyOgCard({ ...card, sig: sig.slice(0, 15) }, SECRET)).toBe(
      false
    );
    expect(verifyOgCard({ ...card, sig: `${sig}0` }, SECRET)).toBe(false);
    expect(verifyOgCard({ ...card, sig: "z".repeat(16) }, SECRET)).toBe(false);
    expect(verifyOgCard({ ...card, sig: sig.toUpperCase() }, SECRET)).toBe(
      false
    );
  });

  it("fails closed when there is no secret", () => {
    const sig = signOgCard(card, SECRET);
    expect(verifyOgCard({ ...card, sig }, undefined)).toBe(false);
    expect(verifyOgCard({ ...card, sig }, "")).toBe(false);
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

  it("builds a /og path that the route accepts", () => {
    const path = ogCardPath(
      { title: "SES bounce rate & you", path: "/docs/guides/bounces" },
      SECRET
    );
    expect(path).not.toBeNull();
    const url = new URL(path as string, "https://wraps.dev");
    expect(url.pathname).toBe("/og");
    expect(parseOgCardRequest(url.searchParams, SECRET)).toEqual({
      title: "SES bounce rate & you",
      section: "Docs",
    });
  });

  it("omits section for pages without one", () => {
    const path = ogCardPath({ title: "About", path: "/about" }, SECRET);
    const url = new URL(path as string, "https://wraps.dev");
    expect(url.searchParams.has("section")).toBe(false);
    expect(parseOgCardRequest(url.searchParams, SECRET)).toEqual({
      title: "About",
      section: "",
    });
  });

  it("clamps a long title before signing so the route still accepts it", () => {
    const path = ogCardPath(
      { title: "x".repeat(OG_TITLE_MAX * 2), path: "/blog/p" },
      SECRET
    );
    const url = new URL(path as string, "https://wraps.dev");
    const card = parseOgCardRequest(url.searchParams, SECRET);
    expect(card).not.toBeNull();
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
  const signed = (title: string, section: string) => {
    const params = new URLSearchParams({ title });
    if (section) {
      params.set("section", section);
    }
    params.set("sig", signOgCard({ title, section }, SECRET));
    return params;
  };

  it("accepts a valid signed request", () => {
    expect(parseOgCardRequest(signed("Hello", "Docs"), SECRET)).toEqual({
      title: "Hello",
      section: "Docs",
    });
  });

  it("verifies the decoded values, not the raw query string", () => {
    // `+` and `%20` both decode to a space.
    const sig = signOgCard({ title: "a b", section: "" }, SECRET);
    for (const query of [`title=a+b&sig=${sig}`, `title=a%20b&sig=${sig}`]) {
      expect(parseOgCardRequest(new URLSearchParams(query), SECRET)).toEqual({
        title: "a b",
        section: "",
      });
    }
  });

  it("rejects a tampered title", () => {
    const params = signed("Hello", "Docs");
    params.set("title", "Buy crypto now");
    expect(parseOgCardRequest(params, SECRET)).toBeNull();
  });

  it("rejects a missing, bad or extra-long signature", () => {
    const params = signed("Hello", "Docs");
    params.delete("sig");
    expect(parseOgCardRequest(params, SECRET)).toBeNull();
    params.set("sig", "0".repeat(16));
    expect(parseOgCardRequest(params, SECRET)).toBeNull();
  });

  it("rejects a request with no title", () => {
    const params = new URLSearchParams({
      sig: signOgCard({ title: "", section: "" }, SECRET),
    });
    expect(parseOgCardRequest(params, SECRET)).toBeNull();
  });

  it("rejects an over-long title or section even with a valid signature", () => {
    const longTitle = "t".repeat(OG_TITLE_MAX + 1);
    expect(parseOgCardRequest(signed(longTitle, ""), SECRET)).toBeNull();
    const longSection = "s".repeat(OG_SECTION_MAX + 1);
    expect(parseOgCardRequest(signed("T", longSection), SECRET)).toBeNull();
  });

  it("rejects everything when the secret is unset", () => {
    expect(parseOgCardRequest(signed("Hello", "Docs"), undefined)).toBeNull();
    expect(parseOgCardRequest(signed("Hello", "Docs"), "")).toBeNull();
  });
});
