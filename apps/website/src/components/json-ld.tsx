// Written with new RegExp and \\u escapes so no formatter rewrites them into
// literal U+2028/U+2029, which are line terminators inside a regex literal.
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
 * Raw JSON.stringify output is not safe there: a string containing
 * `</script>` would end the script element and let the rest be parsed as HTML.
 * `<`, `>` and `&` are written as \u escapes, and so are the line separators
 * U+2028 and U+2029 (legal in JSON, not in older JS parsers). A JSON parser
 * reads the escaped text back to exactly the same data.
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
