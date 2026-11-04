// Characters that are unsafe in an inline script. U+2028/U+2029 are line
// terminators in older JS parsers although JSON allows them.
const UNSAFE_IN_SCRIPT = /[<>&\u2028\u2029]/g;

const ESCAPES: Record<string, string> = {
  "<": "\\u003c",
  ">": "\\u003e",
  "&": "\\u0026",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

/**
 * Serializes JSON-LD for inline embedding in a <script> tag.
 *
 * React 19 already rewrites `<script` and `</script` in script text (see
 * `scriptRegex` in react-dom-server), so a literal `</script>` in a string
 * cannot end the tag today. This serializer is defence in depth for what React
 * leaves alone: `<!--`, `>`, `&`, and the line separators U+2028 and U+2029.
 * All five are written as \u escapes, which a JSON parser reads back to
 * exactly the same data.
 */
export function serializeJsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(
    UNSAFE_IN_SCRIPT,
    (char) => ESCAPES[char] ?? char
  );
}

export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json">{serializeJsonLd(data)}</script>; // baseline:allow-no-sync-scripts — JSON-LD is data, never executes
}
