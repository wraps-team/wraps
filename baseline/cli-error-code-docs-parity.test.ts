import { globSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// `wraps` throws `WrapsError` with a machine-readable `code` from ~90 sites
// across the CLI, and every one of those codes is documented on
// wraps.dev/docs/reference/errors — the page an operator (or an agent
// parsing `--json` output) lands on when they hit one. Nothing ties the two
// files together: not the compiler, not a lint rule, only review. That is
// exactly the kind of pairing that rots — the CLI change is the interesting
// part of a diff, the docs row is the boring part, and the boring part is
// what gets dropped when a change is urgent.
//
// This file checks presence only, in both directions: every thrown code
// must appear in the docs page, and every documented code (minus a small,
// commented allowlist) must actually be thrown somewhere. It has no opinion
// about which of the reference's 12 sections a code belongs in, and it does
// not check that a row's message or solution text is accurate — only that
// the code itself is not orphaned on either side. It also does not cover the
// `AWS_*` family (open-ended: `parseAWSError` returns `error.name` straight
// from the AWS SDK) or the `PULUMI_*` prefix mismatch between the emitted
// and documented forms — both are deliberately out of scope for this test.

const ROOT = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf-8");

const DOCS_PAGE = "apps/website/src/app/docs/reference/errors/page-content.tsx";

// Codes that are documented but never constructed via `new WrapsError`.
// UNKNOWN_ERROR is handleCLIError's default for an error it could not
// classify at all (errors.ts:375) — it reaches users through the JSON
// envelope without ever being thrown, so it is correctly documented and
// correctly absent from the thrown set.
const DOCUMENTED_BUT_NOT_THROWN = new Set(["UNKNOWN_ERROR"]);

// Codes the docs page once invented: it documented 22 codes the CLI never
// emitted until it was rewritten from CLI source (4d9c8f83). These five are
// named so those specific inventions cannot come back. Moved here from the
// website's error-code test when the two were merged (plan 348).
const FICTIONAL_CODES = [
  "CREDENTIALS_NOT_FOUND",
  "MISSING_PERMISSIONS",
  "STACK_NOT_FOUND",
  "DOMAIN_NOT_VERIFIED",
  "SES_SANDBOX",
];

const WRAPS_ERROR_MARKER = "new WrapsError(";
// The code is always the second constructor argument: a lone, double-quoted
// UPPER_SNAKE literal sitting alone on its own line, even when the message
// above it is a template literal.
const CODE_LITERAL = /\n\s*"([A-Z][A-Z0-9_]{2,})",?\s*\n/;

// `new WrapsError(` sites whose code argument is a template literal rather
// than a static string, so no code can be extracted — and none should be.
// Keyed by the literal's source text, not a file:line, so ordinary edits
// above the site do not break this test.
//
// `AWS_${code}` is errors.ts's awsUnknownError fallback. It mints codes from
// the AWS SDK's own error names (AWS_ExpiredTokenException, AWS_AccessDenied,
// ...), which is an open-ended set that cannot be exhaustively documented —
// the same reason the AWS_* family is out of scope for the docs-matching
// assertions below.
// biome-ignore lint/suspicious/noTemplateCurlyInString: source text matched literally, not a forgotten template string
const DYNAMIC_CODE_SITES = new Set(["`AWS_${code}`"]);

const TEMPLATE_CODE_LITERAL = /\n\s*(`[^`\n]*`),?\s*\n/;

// The bound that matters is the next `new WrapsError(` call (see below) — the
// true worst case across the tree, with that bound in place, is 172
// characters (packages/cli/src/commands/email/plan.ts:381, reaching
// REGION_REQUIRED_FOR_SET). 1200 is a belt-and-braces ceiling above that,
// not a measured worst case; a much larger real gap would be a sign this
// extraction has drifted from how codes are constructed.
const LOOKAHEAD_WINDOW = 1200;

function collectThrownCodes() {
  const files = globSync("packages/cli/src/**/*.ts", { cwd: ROOT })
    .map((f) => f.toString())
    .filter((f) => !f.includes("__tests__"));

  const codeToFile = new Map<string, string>();
  const unextractable: string[] = [];
  const undeclaredDynamicCodes: string[] = [];

  for (const file of files) {
    const source = read(file);
    let searchFrom = 0;
    while (true) {
      const markerIndex = source.indexOf(WRAPS_ERROR_MARKER, searchFrom);
      if (markerIndex === -1) break;

      const nextMarkerIndex = source.indexOf(
        WRAPS_ERROR_MARKER,
        markerIndex + WRAPS_ERROR_MARKER.length
      );
      const windowEnd =
        nextMarkerIndex === -1
          ? markerIndex + LOOKAHEAD_WINDOW
          : Math.min(markerIndex + LOOKAHEAD_WINDOW, nextMarkerIndex);
      const window = source.slice(markerIndex, windowEnd);
      const line = () => source.slice(0, markerIndex).split("\n").length;

      const staticMatch = window.match(CODE_LITERAL);
      if (staticMatch) {
        if (!codeToFile.has(staticMatch[1])) {
          codeToFile.set(staticMatch[1], file);
        }
      } else {
        const templateMatch = window.match(TEMPLATE_CODE_LITERAL);
        if (templateMatch && DYNAMIC_CODE_SITES.has(templateMatch[1])) {
          // Deliberately dynamic — collects no code, reports no failure.
        } else if (templateMatch) {
          undeclaredDynamicCodes.push(
            `${file}:${line()} (${templateMatch[1]})`
          );
        } else {
          unextractable.push(`${file}:${line()}`);
        }
      }

      searchFrom = markerIndex + WRAPS_ERROR_MARKER.length;
    }
  }

  return { codeToFile, unextractable, undeclaredDynamicCodes };
}

function collectDocumentedCodes(): Set<string> {
  const source = read(DOCS_PAGE);
  const matches = source.matchAll(/code:\s*"([A-Z][A-Z0-9_]+)"/g);
  return new Set([...matches].map((m) => m[1]));
}

describe("CLI error codes stay in sync with the website error reference", () => {
  const { codeToFile, unextractable, undeclaredDynamicCodes } =
    collectThrownCodes();
  const thrownCodes = new Set(codeToFile.keys());
  const documentedCodes = collectDocumentedCodes();

  it("extracts a code from every `new WrapsError(` site in packages/cli/src", () => {
    // A guardrail that silently ignores what it cannot parse is worse than
    // no guardrail: it reports green while covering less than it claims to.
    expect(
      unextractable,
      `these \`new WrapsError(\` sites did not yield a code within ${LOOKAHEAD_WINDOW} characters of the call — the extraction regex in this test needs updating, not the call sites: ${unextractable.join(", ")}`
    ).toEqual([]);
  });

  it("has no undeclared dynamic-code sites", () => {
    // A site whose code argument is a template literal is not a parse
    // failure — it is a maintainer decision. If this fails, the site's code
    // argument is a template literal this test cannot extract a code from.
    // If it is another open-ended family that genuinely cannot be
    // exhaustively documented (like AWS_${code}), add its literal source
    // text to DYNAMIC_CODE_SITES with a comment saying why. If it is not,
    // give it a static code instead.
    expect(
      undeclaredDynamicCodes,
      `these \`new WrapsError(\` sites have a template-literal code argument that is not in DYNAMIC_CODE_SITES: ${undeclaredDynamicCodes.join(", ")}`
    ).toEqual([]);
  });

  it("finds a non-trivial number of thrown codes", () => {
    // Guards against a future refactor (e.g. a factory helper replacing
    // direct `new WrapsError(` calls) silently emptying the extraction,
    // which would turn every other assertion below into a vacuous pass
    // over an empty set.
    expect(
      thrownCodes.size,
      `expected at least 80 distinct thrown WrapsError codes in packages/cli/src, found ${thrownCodes.size} — if this is a real drop, check whether the extraction in this test still matches how codes are constructed`
    ).toBeGreaterThanOrEqual(80);
  });

  it(`documents every thrown code in ${DOCS_PAGE}`, () => {
    const undocumented = [...thrownCodes]
      .filter((code) => !documentedCodes.has(code))
      .map((code) => `${code} (thrown from ${codeToFile.get(code)})`);

    expect(
      undocumented,
      `these codes are thrown via \`new WrapsError(...)\` but have no matching \`code: "..."\` row in ${DOCS_PAGE} — add one for each: ${undocumented.join(", ")}`
    ).toEqual([]);
  });

  it("throws every documented code (modulo the allowlist) somewhere in packages/cli/src", () => {
    const orphaned = [...documentedCodes].filter(
      (code) => !(thrownCodes.has(code) || DOCUMENTED_BUT_NOT_THROWN.has(code))
    );

    expect(
      orphaned,
      `these codes are documented in ${DOCS_PAGE} but are never constructed via \`new WrapsError(\` in packages/cli/src: ${orphaned.join(", ")} — either the docs row is stale (the code was renamed or removed) and should go, or it belongs in DOCUMENTED_BUT_NOT_THROWN with a comment explaining why it is never thrown`
    ).toEqual([]);
  });

  it("documents every DOCUMENTED_BUT_NOT_THROWN code", () => {
    const missing = [...DOCUMENTED_BUT_NOT_THROWN].filter(
      (code) => !documentedCodes.has(code)
    );

    expect(
      missing,
      `these codes are emitted outside \`new WrapsError(\` (so no extractor finds them) and must still have a \`code: "..."\` row in ${DOCS_PAGE}: ${missing.join(", ")}`
    ).toEqual([]);
  });

  it("never re-documents the fictional codes the page once invented", () => {
    const source = read(DOCS_PAGE);
    // Word-boundary match, not .includes(): a longer code must not mask a
    // shorter one (b6033316).
    const reintroduced = FICTIONAL_CODES.filter((code) =>
      new RegExp(`\\b${code}\\b`).test(source)
    );

    expect(
      reintroduced,
      `${DOCS_PAGE} documents codes the CLI has never emitted and that were deliberately removed in 4d9c8f83: ${reintroduced.join(", ")} — delete those rows`
    ).toEqual([]);
  });
});
