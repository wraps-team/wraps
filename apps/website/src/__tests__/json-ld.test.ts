import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { JsonLd, serializeJsonLd } from "@/components/json-ld";

const HOSTILE = {
  "@context": "https://schema.org",
  "@type": "Question",
  name: "</script><script>x</script>",
  text: "a & b > c <!-- d --> \u2028 e \u2029 f",
  nested: [{ k: "</SCRIPT >" }],
};

function scriptText(html: string): string {
  const match = html.match(
    /^<script type="application\/ld\+json">([\s\S]*)<\/script>$/
  );
  expect(match).not.toBeNull();
  return match?.[1] ?? "";
}

describe("JsonLd", () => {
  it("renders a string containing </script> without ending the tag early", () => {
    const html = renderToStaticMarkup(createElement(JsonLd, { data: HOSTILE }));

    // The only </script is the real closing tag, at the very end.
    expect(html.match(/<\/script/gi)).toHaveLength(1);
    expect(html.endsWith("</script>")).toBe(true);
    expect(html.match(/<script/gi)).toHaveLength(1);
  });

  it("writes <, >, & and <!-- as \\u escapes in the rendered tag", () => {
    const html = renderToStaticMarkup(createElement(JsonLd, { data: HOSTILE }));

    expect(html).not.toContain("<!--");
    expect(html).not.toContain("-->");
    expect(html).not.toContain("&amp;");
    expect(html).toContain("\\u003c/script\\u003e");
    expect(html).toContain("\\u003c!--");
    expect(html).toContain("\\u0026");
  });

  it("round-trips: parsing the tag text gives back the input", () => {
    const html = renderToStaticMarkup(createElement(JsonLd, { data: HOSTILE }));
    expect(JSON.parse(scriptText(html))).toEqual(HOSTILE);
  });

  it("escapes <, >, & and the line separators in the serialized string", () => {
    const out = serializeJsonLd(HOSTILE);
    for (const char of ["<", ">", "&", "\u2028", "\u2029"]) {
      expect(out).not.toContain(char);
    }
    expect(JSON.parse(out)).toEqual(HOSTILE);
  });

  it("leaves ordinary data byte-for-byte as JSON.stringify writes it", () => {
    const data = {
      "@type": "Organization",
      name: "Wraps",
      url: "https://wraps.dev",
    };
    expect(serializeJsonLd(data)).toBe(JSON.stringify(data));
  });
});
