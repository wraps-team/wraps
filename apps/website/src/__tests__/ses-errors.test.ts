import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SES_ERRORS } from "@/lib/ses-errors";

const repoRoot = resolve(__dirname, "..", "..", "..", "..");
const cliSrcDir = resolve(repoRoot, "packages/cli/src");

const SLUG = /^[a-z0-9-]+$/;
const AWS_DOCS_PREFIX = "https://docs.aws.amazon.com/";

/**
 * Every code passed as the second argument to `new WrapsError(...)` anywhere
 * in packages/cli/src. Same extraction rule as cli-error-codes.test.ts — the
 * point here is the reverse direction: the SES pages may only claim a code the
 * CLI actually raises, so their remediation text stays traceable to the
 * catalog it was adapted from instead of drifting into invention.
 */
function extractCliErrorCodes(): Set<string> {
  const codes = new Set<string>();
  const entries = readdirSync(cliSrcDir, {
    recursive: true,
    withFileTypes: true,
  });

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".ts")) {
      continue;
    }
    if (entry.name.endsWith(".test.ts")) {
      continue;
    }
    const parentPath =
      (entry as { parentPath?: string; path?: string }).parentPath ??
      (entry as { path?: string }).path;
    if (!parentPath || parentPath.includes("__tests__")) {
      continue;
    }

    const source = readFileSync(resolve(parentPath, entry.name), "utf8");
    const callRe = /new WrapsError\(/g;
    let match: RegExpExecArray | null = callRe.exec(source);
    while (match !== null) {
      const chunk = source.slice(match.index, match.index + 2000);
      const codeMatch = chunk.match(/,\s*\n?\s*"([A-Z][A-Z0-9_]{2,})"/);
      if (codeMatch) {
        codes.add(codeMatch[1]);
      }
      match = callRe.exec(source);
    }
  }

  return codes;
}

describe("SES error pages stay traceable to the CLI error catalog", () => {
  it("extracted a plausible number of codes from packages/cli/src", () => {
    // A regex that stopped matching would make the assertion below vacuous.
    expect(extractCliErrorCodes().size).toBeGreaterThanOrEqual(80);
  });

  it("claims only WrapsError codes the CLI can actually raise", () => {
    const codes = extractCliErrorCodes();
    const invented = SES_ERRORS.filter(
      (error) => !codes.has(error.wrapsErrorCode)
    ).map((error) => `${error.slug} -> ${error.wrapsErrorCode}`);

    expect(
      invented,
      `These /ses/errors pages name a WrapsError code that does not exist in packages/cli/src. Either the CLI renamed it, or the page was written from general knowledge instead of the catalog:\n${invented.join("\n")}`
    ).toEqual([]);
  });
});

describe("SES error entries are well formed", () => {
  it("gives every entry a unique, URL-safe slug", () => {
    const slugs = SES_ERRORS.map((error) => error.slug);
    const malformed = slugs.filter((slug) => !SLUG.test(slug));
    expect(malformed).toEqual([]);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("gives every entry a literal message, a cause and a fix", () => {
    const incomplete = SES_ERRORS.filter(
      (error) =>
        error.literalMessage.trim() === "" ||
        error.causes.length === 0 ||
        error.fixes.length === 0
    ).map((error) => error.slug);
    expect(incomplete).toEqual([]);
  });

  it("points every entry at AWS's own documentation", () => {
    const offsite = SES_ERRORS.filter(
      (error) => !error.awsDocsUrl.startsWith(AWS_DOCS_PREFIX)
    ).map((error) => `${error.slug} -> ${error.awsDocsUrl}`);
    expect(offsite).toEqual([]);
  });

  it("covers at least the twelve errors the cluster shipped with", () => {
    expect(SES_ERRORS.length).toBeGreaterThanOrEqual(12);
  });
});
