import { existsSync, globSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, test } from "vitest";

// There is one bounce and complaint catalog. It lives in
// packages/core/src/email-diagnostics.ts and is imported as
// @wraps/core/email-diagnostics everywhere. A second copy (in apps/web or
// apps/api) would translate the same SES code two ways, once at ingest and
// once at read, so this test fails the moment one appears.

const ROOT = resolve(import.meta.dirname, "..");
const CATALOG_FILE = "packages/core/src/email-diagnostics.ts";
const EXCLUDED_SEGMENT = /(^|\/)(node_modules|dist|\.next)(\/|$)/;

function readFile(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf-8");
}

function sourceFiles(roots: string[]): string[] {
  return roots
    .flatMap((root) =>
      globSync(`${root}/**/*.{ts,tsx,mts,cts}`, { cwd: ROOT }).map((f) =>
        f.toString()
      )
    )
    .filter((f) => !EXCLUDED_SEGMENT.test(f));
}

// Declarations that must exist exactly once. The PROVIDER_PATTERNS pattern
// includes the element type, so the unrelated `Record<string, ...>` map in
// packages/email-check (a different MX lookup table) does not match.
const CATALOG_DECLARATIONS: Array<{ label: string; pattern: RegExp }> = [
  { label: "const CLASS_COPY", pattern: /\bconst CLASS_COPY\b/ },
  {
    label: "const RFC_SUBJECT_DETAIL",
    pattern: /\bconst RFC_SUBJECT_DETAIL\b/,
  },
  {
    label: "const PROVIDER_PATTERNS: ProviderPattern[]",
    pattern: /\bconst PROVIDER_PATTERNS: ProviderPattern\[\]/,
  },
  {
    label: "const BOUNCE_SUBTYPE_MAP",
    pattern: /\bconst BOUNCE_SUBTYPE_MAP\b/,
  },
  {
    label: "const COMPLAINT_FEEDBACK_TYPE_MAP",
    pattern: /\bconst COMPLAINT_FEEDBACK_TYPE_MAP\b/,
  },
  {
    label: "export function translateDiagnosticCode",
    pattern: /\bexport function translateDiagnosticCode\b/,
  },
];

describe("email-diagnostics has one catalog", () => {
  const files = sourceFiles(["apps", "packages"]);

  test.each(CATALOG_DECLARATIONS)(
    "$label is declared in exactly one file, the core catalog",
    ({ label, pattern }) => {
      const declaredIn = files.filter((file) => pattern.test(readFile(file)));
      expect(
        declaredIn,
        `${label} is declared in ${declaredIn.length} files: ${declaredIn.join(", ")}`
      ).toEqual([CATALOG_FILE]);
    }
  );

  test("the old apps/web catalog module is gone", () => {
    expect(
      existsSync(resolve(ROOT, "apps/web/src/lib/email-diagnostics.ts"))
    ).toBe(false);
  });

  test("nothing imports the old apps/web catalog path", () => {
    const stale: string[] = [];
    for (const file of files) {
      for (const match of readFile(file).matchAll(
        /from\s+["']([^"']*email-diagnostics)["']/g
      )) {
        const specifier = match[1];
        if (specifier === "@/lib/email-diagnostics") {
          stale.push(`${file} -> ${specifier}`);
          continue;
        }
        if (specifier.startsWith(".")) {
          const target = resolve(ROOT, dirname(file), `${specifier}.ts`);
          const relative = target.slice(ROOT.length + 1);
          if (!existsSync(target) || relative.startsWith("apps/web/src/lib/")) {
            stale.push(`${file} -> ${specifier}`);
          }
        }
      }
    }
    expect(stale, stale.join(", ")).toEqual([]);
  });

  test("apps/api takes translateDiagnosticCode only from @wraps/core/email-diagnostics", () => {
    const apiFiles = sourceFiles(["apps/api/src"]).filter(
      (file) => !(file.includes("__tests__") || file.includes(".test."))
    );
    const importSource =
      /import\s+(?:type\s+)?\{[^}]*\btranslateDiagnosticCode\b[^}]*\}\s+from\s+["']([^"']+)["']/g;

    const sources: Array<{ file: string; from: string }> = [];
    for (const file of apiFiles) {
      for (const match of readFile(file).matchAll(importSource)) {
        sources.push({ file, from: match[1] });
      }
    }

    expect(
      sources.length,
      "no apps/api file imports translateDiagnosticCode"
    ).toBeGreaterThan(0);
    const wrong = sources.filter(
      (s) => s.from !== "@wraps/core/email-diagnostics"
    );
    expect(wrong, JSON.stringify(wrong)).toEqual([]);
  });
});
