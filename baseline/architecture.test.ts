import { existsSync, globSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");

function readFile(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf-8");
}

function findFiles(pattern: string): string[] {
  return globSync(pattern, { cwd: ROOT }).map((f) => f.toString());
}

// ─────────────────────────────────────────────────────────
// Test 1: Organization-scoped queries
// ─────────────────────────────────────────────────────────

// Tables that have an organizationId column and MUST be scoped in queries.
const ORG_SCOPED_TABLES = new Set([
  "contact",
  "topic",
  "topicSettings",
  "template",
  "reusableBlock",
  "templateVariable",
  "brandKit",
  "aiConversation",
  "workflow",
  "workflowExecution",
  "awsAccount",
  "apiKey",
  "auditLog",
  "batchSend",
  "messageSend",
  "segment",
  "contactEvent",
  "emailTemplate",
  "organizationExtension",
  "member",
  "invitation",
  "statement",
  "aiUsageMonthly",
  "aiUsageLog",
  "apiUsageDaily",
  "apiRateLimitWindow",
  "messageUsageMonthly",
  "eventUsageMonthly",
]);

// Files excluded from org-scope checks.
// These validate org ownership through alternative mechanisms.
const ORG_SCOPE_EXCLUDED_FILES = new Set([
  // Webhook handlers authenticate via SES webhook secret → awsAccount lookup
  "apps/api/src/routes/webhooks.ts",
  // Internal services called by org-validated routes
  "apps/api/src/services/workflow-events.ts",
  "apps/api/src/services/segment-evaluator.ts",
  "apps/api/src/services/credentials.ts",
  "apps/api/src/services/workflow-queue.ts",
  "apps/api/src/services/workflow-scheduler.ts",
]);

// Queries that scan routes + actions for org-scoped table operations
const QUERY_FILE_PATTERNS = [
  "apps/api/src/routes/**/*.ts",
  "apps/api/src/services/**/*.ts",
  "apps/web/src/actions/**/*.ts",
];

function getQueryFiles(): string[] {
  return QUERY_FILE_PATTERNS.flatMap(findFiles).filter(
    (f) =>
      !(
        f.includes("__tests__") ||
        f.includes(".test.") ||
        ORG_SCOPE_EXCLUDED_FILES.has(f)
      )
  );
}

/**
 * Scans for .operation(tableName) and checks if organizationId
 * appears within a window around the query. Uses a generous window
 * since Drizzle queries span many lines.
 */
function findMissingScopeViolations(
  operation: string,
  windowBefore: number,
  windowAfter: number
): string[] {
  const violations: string[] = [];
  const files = getQueryFiles();
  const regex = new RegExp(`\\.${operation}\\((\\w+)\\)`, "g");

  for (const file of files) {
    const content = readFile(file);
    const lines = content.split("\n");
    for (const match of content.matchAll(regex)) {
      const tableName = match[1];
      if (!ORG_SCOPED_TABLES.has(tableName)) {
        continue;
      }

      // Check if this line has a baseline:allow-unscoped comment
      const lineStart = content.lastIndexOf("\n", match.index) + 1;
      const lineEnd = content.indexOf("\n", match.index);
      const line = content.slice(
        lineStart,
        lineEnd === -1 ? undefined : lineEnd
      );
      if (line.includes("baseline:allow-unscoped")) {
        continue;
      }

      const beforeMatch = content.slice(0, match.index);
      const lineNum = beforeMatch.split("\n").length;

      const windowStart = Math.max(lineNum - 1 - windowBefore, 0);
      const windowEnd = Math.min(lineNum + windowAfter, lines.length);
      const window = lines.slice(windowStart, windowEnd).join("\n");

      if (!window.includes("organizationId")) {
        violations.push(
          `${file}:${lineNum} — .${operation}(${tableName}) missing organizationId`
        );
      }
    }
  }

  return violations;
}

describe("org-scoped queries", () => {
  // Large window: org validation often happens 30+ lines before the query
  // in server actions (session check → org lookup → business logic → query)

  // Window sizes are generous because server actions validate org ownership
  // at the top of the function, then have many lines of business logic
  // before the actual query.

  test("UPDATE queries on org-scoped tables include organizationId", () => {
    const violations = findMissingScopeViolations("update", 80, 15);
    expect(violations, violations.join("\n")).toEqual([]);
  });

  test("DELETE queries on org-scoped tables include organizationId", () => {
    const violations = findMissingScopeViolations("delete", 80, 15);
    expect(violations, violations.join("\n")).toEqual([]);
  });

  test("SELECT queries on org-scoped tables include organizationId", () => {
    const violations = findMissingScopeViolations("from", 80, 25);
    expect(violations, violations.join("\n")).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────
// Test 4: No private env vars in client components
// (baseline.toml can't handle this: Rust regex lacks lookahead for NEXT_PUBLIC_)
// ─────────────────────────────────────────────────────────

describe("client components do not access private env vars", () => {
  test("no process.env access to non-NEXT_PUBLIC_ vars in 'use client' files", () => {
    const clientFiles = findFiles("apps/web/src/**/*.{ts,tsx}").filter(
      (f) => !(f.includes("__tests__") || f.includes(".test."))
    );

    const violations: string[] = [];

    for (const file of clientFiles) {
      const content = readFile(file);

      // Only check client components
      if (
        !(
          content.startsWith('"use client"') ||
          content.startsWith("'use client'")
        )
      ) {
        continue;
      }

      const lines = content.split("\n");
      const envRegex = /process\.env\.([A-Z_]+)/g;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Skip comments
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) {
          continue;
        }

        // Skip lines inside template literals (code examples in UI)
        const beforeLine = lines.slice(0, i).join("\n");
        const backticksBefore = (beforeLine.match(/`/g) || []).length;
        if (backticksBefore % 2 === 1) {
          continue;
        }

        envRegex.lastIndex = 0;

        for (const match of line.matchAll(envRegex)) {
          const varName = match[1];
          // NEXT_PUBLIC_ vars are inlined by Next.js at build time — safe
          if (varName.startsWith("NEXT_PUBLIC_")) {
            continue;
          }
          // NODE_ENV is always available
          if (varName === "NODE_ENV") {
            continue;
          }

          violations.push(
            `${file}:${i + 1} — client component accesses private env var: process.env.${varName}`
          );
        }
      }
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────
// Test 7: No @tanstack/react-form in server components
// (baseline.toml can't handle this: file_not_contains only supports one string,
//  but files use both "use client" and 'use client')
// ─────────────────────────────────────────────────────────

describe("no client-only imports in server components", () => {
  test("@tanstack/react-form must only be imported in 'use client' files", () => {
    const files = findFiles("apps/web/src/**/*.{ts,tsx}").filter(
      (f) =>
        !(
          f.includes("__tests__") ||
          f.includes(".test.") ||
          f.includes("/lib/forms/")
        )
    );

    const violations: string[] = [];

    for (const file of files) {
      const content = readFile(file);
      if (!content.includes("@tanstack/react-form")) {
        continue;
      }

      const isClient =
        content.startsWith('"use client"') ||
        content.startsWith("'use client'");

      if (!isClient) {
        // Check if it's a pure type import or the server-safe nextjs subpath
        const lines = content.split("\n");
        const hasClientOnlyImport = lines.some(
          (line) =>
            line.includes("@tanstack/react-form") &&
            !line.includes("@tanstack/react-form-nextjs") &&
            !line.includes("@tanstack/react-form/nextjs") &&
            !line.trim().startsWith("//") &&
            !line.includes("import type")
        );

        if (hasClientOnlyImport) {
          violations.push(
            `${file} — imports @tanstack/react-form but is not a 'use client' component`
          );
        }
      }
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────
// Test 8: No redirect() inside try/catch
// (baseline.toml can't handle this: needs brace-depth tracking)
// ─────────────────────────────────────────────────────────

describe("no redirect() inside try/catch", () => {
  test("Next.js redirect() must not be called inside try blocks", () => {
    const files = findFiles("apps/web/src/**/*.{ts,tsx}").filter(
      (f) => !(f.includes("__tests__") || f.includes(".test."))
    );

    const violations: string[] = [];

    for (const file of files) {
      const content = readFile(file);

      // Only check files that import redirect from next/navigation
      if (!content.includes('from "next/navigation"')) {
        continue;
      }
      if (!(content.includes("redirect(") || content.includes("redirect,"))) {
        continue;
      }

      // Simple brace-depth tracker: find try blocks and check for redirect inside
      const lines = content.split("\n");
      let inTryBlock = false;
      let tryDepth = 0;
      let braceDepth = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Skip comments
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) {
          continue;
        }

        // Detect try block start
        if (/\btry\s*\{/.test(line)) {
          inTryBlock = true;
          tryDepth = braceDepth;
        }

        // Track brace depth
        for (const char of line) {
          if (char === "{") {
            braceDepth++;
          }
          if (char === "}") {
            braceDepth--;
            // Exiting the try block
            if (inTryBlock && braceDepth === tryDepth) {
              inTryBlock = false;
            }
          }
        }

        // Check for redirect() inside try block
        if (inTryBlock && /\bredirect\(/.test(line)) {
          violations.push(
            `${file}:${i + 1} — redirect() inside try/catch (redirect throws internally and will be swallowed)`
          );
        }
      }
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────
// Test 9: No console.log in web app
// (baseline.toml can't handle this: needs template literal awareness)
// ─────────────────────────────────────────────────────────

describe("no console.log in web app", () => {
  test("no console.log calls in web app", () => {
    const files = findFiles("apps/web/src/**/*.{ts,tsx}").filter(
      (f) => !(f.includes("__tests__") || f.includes(".test."))
    );

    const violations: string[] = [];
    const consoleLogRegex = /console\.log\(/g;

    for (const file of files) {
      const content = readFile(file);
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Skip comments
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) {
          continue;
        }

        // Skip lines inside template literals (code examples in UI)
        const beforeLine = lines.slice(0, i).join("\n");
        const backticksBefore = (beforeLine.match(/`/g) || []).length;
        if (backticksBefore % 2 === 1) {
          continue;
        }

        // Skip lines with escape hatch
        if (line.includes("baseline:allow-console")) {
          continue;
        }

        consoleLogRegex.lastIndex = 0;
        if (consoleLogRegex.test(line)) {
          violations.push(`${file}:${i + 1} — console.log() call`);
        }
      }
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────
// Test: Icon buttons must have aria-label or sr-only
// ─────────────────────────────────────────────────────────

describe("icon buttons have accessible labels", () => {
  test('size="icon" buttons must have aria-label or sr-only', () => {
    const files = findFiles("apps/web/src/**/*.tsx").filter(
      (f) => !(f.includes("__tests__") || f.includes(".test."))
    );

    const violations: string[] = [];

    for (const file of files) {
      const content = readFile(file);
      if (!content.includes('size="icon"')) {
        continue;
      }

      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.includes('size="icon"')) {
          continue;
        }

        // Walk backwards to find the opening <Button or <button
        let elementStart = i;
        for (let j = i; j >= Math.max(0, i - 15); j--) {
          if (/<(?:Button|button)\b/.test(lines[j])) {
            elementStart = j;
            break;
          }
        }

        // Walk forward to find the closing </Button>, </button>, or self-closing />
        let elementEnd = i;
        for (let j = i; j < Math.min(lines.length, i + 15); j++) {
          if (
            lines[j].includes("</Button>") ||
            lines[j].includes("</button>") ||
            (lines[j].includes("/>") && !lines[j].includes("<"))
          ) {
            elementEnd = j;
            break;
          }
        }

        const elementBlock = lines
          .slice(elementStart, elementEnd + 1)
          .join("\n");

        const hasAriaLabel = elementBlock.includes("aria-label");
        const hasSrOnly = elementBlock.includes("sr-only");
        const hasEscapeHatch = elementBlock.includes(
          "baseline:allow-no-aria-label"
        );

        if (!(hasAriaLabel || hasSrOnly || hasEscapeHatch)) {
          violations.push(
            `${file}:${elementStart + 1} — size="icon" button missing aria-label or sr-only`
          );
        }
      }
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────
// Test: No Unicode ellipsis — use three dots instead
// ─────────────────────────────────────────────────────────

describe("typography: use three dots not Unicode ellipsis", () => {
  test("user-facing strings must use ... not \u2026 (U+2026)", () => {
    const files = findFiles("apps/web/src/**/*.tsx").filter(
      (f) => !(f.includes("__tests__") || f.includes(".test."))
    );

    const violations: string[] = [];

    for (const file of files) {
      const content = readFile(file);
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) {
          continue;
        }

        if (line.includes("\u2026")) {
          violations.push(
            `${file}:${i + 1} — contains \u2026 (U+2026), use ... instead`
          );
        }
      }
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });
});

function getCLICommandFiles(): string[] {
  return findFiles("packages/cli/src/commands/**/*.ts").filter(
    (f) => !(f.includes("__tests__") || f.includes(".test."))
  );
}

// ─────────────────────────────────────────────────────────
// Test 12: No metadata save before deployment completes
// (baseline.toml can't handle this: needs ordering semantics within function)
// ─────────────────────────────────────────────────────────

describe("metadata save order", () => {
  test("saveConnectionMetadata must not appear before deployment calls in same function", () => {
    const files = getCLICommandFiles();
    const violations: string[] = [];

    const saveRegex = /saveConnectionMetadata\s*\(/g;
    const deployRegex =
      /stack\.up\s*\(|deployEmailStack\s*\(|deploySmsStack\s*\(|deployCdnStack\s*\(/g;

    for (const file of files) {
      const content = readFile(file);

      // Only check files that have both save and deploy
      if (
        !(
          content.includes("saveConnectionMetadata") &&
          (content.includes("stack.up") ||
            content.includes("deployEmailStack") ||
            content.includes("deploySmsStack") ||
            content.includes("deployCdnStack"))
        )
      ) {
        continue;
      }

      const lines = content.split("\n");

      // Find all save and deploy line numbers
      const saveLines: number[] = [];
      const deployLines: number[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes("baseline:allow-early-save")) {
          continue;
        }

        saveRegex.lastIndex = 0;
        deployRegex.lastIndex = 0;

        if (saveRegex.test(line)) {
          saveLines.push(i + 1);
        }
        if (deployRegex.test(line)) {
          deployLines.push(i + 1);
        }
      }

      if (saveLines.length === 0 || deployLines.length === 0) {
        continue;
      }

      // Check if any save appears before the first deploy
      const firstDeploy = Math.min(...deployLines);
      for (const saveLine of saveLines) {
        if (saveLine < firstDeploy) {
          violations.push(
            `${file}:${saveLine} — saveConnectionMetadata before deployment at line ${firstDeploy}`
          );
        }
      }
    }

    // Ratchet: 0 expected violations.
    expect(violations, violations.join("\n")).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────
// Test 13: No duplicate infrastructure helper functions
// (baseline.toml can't handle this: cross-file uniqueness check)
// ─────────────────────────────────────────────────────────

describe("no duplicate infrastructure helpers", () => {
  test("resource-check functions must not be duplicated across files", () => {
    const files = findFiles("packages/cli/src/infrastructure/**/*.ts").filter(
      (f) => !(f.includes("__tests__") || f.includes(".test."))
    );

    // Track function declarations
    const functionLocations: Record<string, string[]> = {};
    const funcDeclRegex =
      /(?:async\s+)?function\s+(roleExists|tableExists|sqsQueueExists|snsTopicExists|lambdaFunctionExists)\s*\(/g;

    for (const file of files) {
      const content = readFile(file);

      funcDeclRegex.lastIndex = 0;
      for (const match of content.matchAll(funcDeclRegex)) {
        const funcName = match[1];
        if (!functionLocations[funcName]) {
          functionLocations[funcName] = [];
        }
        functionLocations[funcName].push(file);
      }
    }

    const violations: string[] = [];
    for (const [funcName, locations] of Object.entries(functionLocations)) {
      if (locations.length > 1) {
        violations.push(`${funcName}() duplicated in: ${locations.join(", ")}`);
      }
    }

    // Ratchet: 0 — all helpers extracted to shared/resource-checks.ts.
    expect(violations, violations.join("\n")).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────
// Test 14: No duplicate verifyOrgAccess declarations
// ─────────────────────────────────────────────────────────

describe("no duplicate verifyOrgAccess", () => {
  test("verifyOrgAccess must not be declared outside shared module", () => {
    const files = findFiles("apps/web/src/actions/**/*.ts").filter(
      (f) =>
        !(
          f.includes("__tests__") ||
          f.includes(".test.") ||
          f.includes("/shared/")
        )
    );

    const violations: string[] = [];
    const funcRegex = /function\s+verifyOrgAccess\s*\(/g;

    for (const file of files) {
      const content = readFile(file);
      funcRegex.lastIndex = 0;
      if (funcRegex.test(content)) {
        violations.push(
          `${file} declares verifyOrgAccess locally (import from shared/verify-org-access instead)`
        );
      }
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────
// Test 15: No duplicate hash helpers
// ─────────────────────────────────────────────────────────

describe("no duplicate hash helpers", () => {
  test("hashEmail and hashPhone must not be declared outside shared module", () => {
    const files = findFiles("apps/web/src/actions/**/*.ts").filter(
      (f) =>
        !(
          f.includes("__tests__") ||
          f.includes(".test.") ||
          f.includes("/shared/")
        )
    );

    const violations: string[] = [];
    const hashRegex = /function\s+(hashEmail|hashPhone)\s*\(/g;

    for (const file of files) {
      const content = readFile(file);
      hashRegex.lastIndex = 0;
      for (const match of content.matchAll(hashRegex)) {
        violations.push(
          `${file} declares ${match[1]} locally (import from shared/hash instead)`
        );
      }
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────
// Test 16: File size limits
// ─────────────────────────────────────────────────────────

describe("file size limits", () => {
  const LIMITS: Array<{ pattern: string; maxLines: number; label: string }> = [
    {
      pattern: "apps/web/src/actions/*.ts",
      maxLines: 1000,
      label: "action files",
    },
    {
      pattern: "apps/api/src/routes/**/*.ts",
      maxLines: 1500,
      label: "API route files",
    },
    {
      pattern: "apps/api/src/**/workers/**/*.ts",
      maxLines: 1000,
      label: "worker files",
    },
  ];

  for (const { pattern, maxLines, label } of LIMITS) {
    test(`${label} must not exceed ${maxLines} lines`, () => {
      const files = findFiles(pattern).filter(
        (f) => !(f.includes("__tests__") || f.includes(".test."))
      );

      const violations: string[] = [];

      for (const file of files) {
        const content = readFile(file);

        // Escape hatch: comment in first 5 lines
        const head = content.split("\n").slice(0, 5).join("\n");
        if (head.includes("// baseline:allow-large-file")) {
          continue;
        }

        const lineCount = content.split("\n").length;
        if (lineCount > maxLines) {
          violations.push(`${file} has ${lineCount} lines (max ${maxLines})`);
        }
      }

      expect(violations, violations.join("\n")).toEqual([]);
    });
  }
});

// ─────────────────────────────────────────────────────────
// Test: Plain <button> with only icon children must have aria-label
// (catches icon-only buttons that don't use size="icon")
// ─────────────────────────────────────────────────────────

describe("icon-only plain buttons have accessible labels", () => {
  test("plain <button> with only icon children must have aria-label or title", () => {
    const files = findFiles("apps/web/src/**/*.tsx").filter(
      (f) => !(f.includes("__tests__") || f.includes(".test."))
    );

    const violations: string[] = [];

    for (const file of files) {
      const content = readFile(file);
      if (!content.includes("<button")) {
        continue;
      }

      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!/<button\b/.test(line)) {
          continue;
        }

        // Walk forward to find the closing </button>
        let elementEnd = -1;
        for (let j = i; j < Math.min(lines.length, i + 20); j++) {
          if (lines[j].includes("</button>")) {
            elementEnd = j;
            break;
          }
        }
        if (elementEnd === -1) {
          continue;
        }

        const elementBlock = lines.slice(i, elementEnd + 1).join("\n");

        // Skip if already has aria-label, title, or escape hatch
        if (
          elementBlock.includes("aria-label") ||
          elementBlock.includes("title=") ||
          elementBlock.includes("baseline:allow-no-label")
        ) {
          continue;
        }

        // Find where the opening tag ends, handling JSX expressions
        // that may contain > (arrow functions, comparisons).
        // Track {}-depth so we only match > at depth 0.
        const buttonIdx = elementBlock.indexOf("<button");
        if (buttonIdx === -1) {
          continue;
        }
        let depth = 0;
        let contentStart = -1;
        for (let c = buttonIdx + 7; c < elementBlock.length; c++) {
          const ch = elementBlock[c];
          if (ch === "{") {
            depth++;
          } else if (ch === "}") {
            depth--;
          } else if (ch === ">" && depth === 0) {
            contentStart = c + 1;
            break;
          }
        }
        if (contentStart === -1) {
          continue;
        }
        const closingIndex = elementBlock.lastIndexOf("</button>");
        if (closingIndex <= contentStart) {
          continue;
        }

        const innerContent = elementBlock.slice(contentStart, closingIndex);

        // Strip only self-closing JSX tags (icons like <X />, <Icon />)
        // and whitespace. If anything else remains (text, expressions, non-self-closing
        // elements), the button has content and is not icon-only.
        const textOnly = innerContent
          .replace(/<\w[^>]*\/>/g, "") // Remove self-closing tags only
          .replace(/\s+/g, "") // Remove whitespace
          .trim();

        if (textOnly.length === 0) {
          violations.push(
            `${file}:${i + 1} — icon-only <button> missing aria-label or title`
          );
        }
      }
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────
// Test: Checkbox/radio inputs must have label association
// ─────────────────────────────────────────────────────────

describe("form inputs have labels", () => {
  test("checkbox and radio <input> must have id+label or aria-label", () => {
    const files = findFiles("apps/web/src/**/*.tsx").filter(
      (f) =>
        !(
          f.includes("__tests__") ||
          f.includes(".test.") ||
          f.includes("/ui/checkbox.tsx") ||
          f.includes("/ui/radio-group.tsx")
        )
    );

    const violations: string[] = [];

    for (const file of files) {
      const content = readFile(file);
      if (
        !(
          content.includes('type="checkbox"') ||
          content.includes('type="radio"')
        )
      ) {
        continue;
      }

      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (
          !(line.includes('type="checkbox"') || line.includes('type="radio"'))
        ) {
          continue;
        }

        // Only match raw <input elements, not component wrappers
        // Walk backwards to find the opening <input
        let elementStart = i;
        for (let j = i; j >= Math.max(0, i - 5); j--) {
          if (/<input\b/.test(lines[j])) {
            elementStart = j;
            break;
          }
        }
        if (!/<input\b/.test(lines[elementStart])) {
          continue;
        }

        // Walk forward to find /> or >
        let elementEnd = i;
        for (let j = i; j < Math.min(lines.length, i + 5); j++) {
          if (lines[j].includes("/>") || lines[j].includes(">")) {
            elementEnd = j;
            break;
          }
        }

        const elementBlock = lines
          .slice(elementStart, elementEnd + 1)
          .join("\n");

        // Skip hidden inputs
        if (elementBlock.includes('type="hidden"')) {
          continue;
        }

        // Skip if it has accessibility attributes
        if (
          elementBlock.includes("aria-label") ||
          elementBlock.includes("baseline:allow-no-label")
        ) {
          continue;
        }

        // Check if wrapped in a <label> element (implicit association)
        let isWrappedInLabel = false;
        for (
          let j = elementStart - 1;
          j >= Math.max(0, elementStart - 10);
          j--
        ) {
          if (/<label\b/.test(lines[j])) {
            isWrappedInLabel = true;
            break;
          }
          if (/<\/label>/.test(lines[j])) {
            break;
          }
        }
        if (isWrappedInLabel) {
          continue;
        }

        // Check if it has an id
        const idMatch = elementBlock.match(/id=["'{]([^"'}]+)["'}]/);
        if (idMatch) {
          // Check if a <label htmlFor="..."> or <Label htmlFor="..."> exists in the file
          const inputId = idMatch[1];
          if (
            content.includes(`htmlFor="${inputId}"`) ||
            content.includes(`htmlFor={'${inputId}'}`)
          ) {
            continue;
          }
        }

        violations.push(
          `${file}:${elementStart + 1} — <input type="checkbox|radio"> missing id+label or aria-label`
        );
      }
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────
// Test: No `"us-east-1"` hardcoded region outside the allow-list.
//
// The allow-list covers places where us-east-1 is load-bearing (ACM for
// CloudFront must be us-east-1, CloudFront control plane is us-east-1,
// SES_REGIONS data arrays, IAM is global), plus test fixtures. New
// violations must either be fixed (thread region) or documented here with
// a reason.
// ─────────────────────────────────────────────────────────

describe("no hardcoded us-east-1 outside allow-list", () => {
  const US_EAST_1_ALLOW_LIST: RegExp[] = [
    // Legitimate defaults / data / user-facing suggestions
    /^packages\/cli\/src\/constants\.ts$/,
    /^packages\/cli\/src\/infrastructure\/resources\/acm\.ts$/,
    /^packages\/cli\/src\/infrastructure\/resources\/cloudfront\.ts$/,
    /^packages\/cli\/src\/infrastructure\/resources\/s3-cdn\.ts$/,
    /^packages\/cli\/src\/commands\/cdn\//,
    /^packages\/cli\/src\/commands\/selfhost\//,
    /^packages\/cli\/src\/utils\/shared\/s3-state\.ts$/,
    /^packages\/cli\/src\/utils\/shared\/aws\.ts$/,
    /^packages\/cli\/src\/utils\/shared\/prompts\.ts$/,
    /^packages\/cli\/src\/types\/email\.ts$/,
    /^packages\/cli\/src\/commands\/aws\/setup\.ts$/,
    // Scaffolding: string literals inside generated example configs users
    // copy into their own projects. Not runtime region pins.
    /^packages\/cli\/src\/commands\/workflow\/init\.ts$/,
    /^packages\/cli\/src\/commands\/email\/workflows\/init\.ts$/,
    /^packages\/cli\/src\/commands\/email\/templates\/init\.ts$/,
    /^packages\/cli\/src\/commands\/email\/templates\/claude-content\.ts$/,
    // STS GetCallerIdentity is identity-only but SDK v3 requires a region to
    // build the client — us-east-1 is a harmless pin.
    /^packages\/cli\/src\/utils\/shared\/aws-detection\.ts$/,
    // Doctor is the diagnostic command — it deliberately falls back to
    // us-east-1 for the SES sandbox probe and annotates the result.
    /^packages\/cli\/src\/commands\/aws\/doctor\.ts$/,
    // IAM is global — the region is cosmetic on the client.
    /^packages\/cli\/src\/infrastructure\/vercel-oidc\.ts$/,
    /^packages\/cli\/src\/infrastructure\/resources\/smtp-credentials\.ts$/,
    /^packages\/cli\/src\/infrastructure\/shared\/resource-checks\.ts$/,
    /^packages\/cli\/src\/commands\/platform\/connect\.ts$/,
    /^packages\/cli\/src\/commands\/platform\/update-role\.ts$/,
    // Test fixtures. `__tests__/` covers most; the `.test.ts(x)` patterns
    // catch colocated tests that don't live under a `__tests__/` dir.
    /\/__tests__\//,
    /\.test\.ts$/,
    /\.test\.tsx$/,
    /^baseline\//,
  ];

  test("packages/cli/src is free of us-east-1 literals outside allow-list", () => {
    const files = findFiles("packages/cli/src/**/*.ts");

    const violations: string[] = [];
    for (const file of files) {
      if (US_EAST_1_ALLOW_LIST.some((rx) => rx.test(file))) {
        continue;
      }

      const content = readFile(file);
      const lines = content.split("\n");
      // Match "us-east-1", 'us-east-1', or `us-east-1` — single-quote and
      // template-literal forms are TypeScript-legal and would otherwise
      // evade the ratchet.
      const literalRegex = /['"`]us-east-1['"`]/;
      for (let i = 0; i < lines.length; i++) {
        if (literalRegex.test(lines[i])) {
          violations.push(`${file}:${i + 1} — ${lines[i].trim()}`);
        }
      }
    }

    // Ratchet: 0 violations outside allow-list.
    expect(violations, violations.join("\n")).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────
// Test: No silent region fallback in packages/cli/src/infrastructure/**.
//
// This pattern masks a missing region — the resolved value lies about the
// user's intent. Infrastructure must receive region explicitly and error
// if it's missing, not fall back to some default.
//
// Catches `||` and `??` on config.region / options.region. Earlier version
// only caught `||` on `config.region`; `??` and `options.region` variants
// would have bypassed the ratchet.
// ─────────────────────────────────────────────────────────

describe("no region fallback in infrastructure", () => {
  test("packages/cli/src/infrastructure is free of region fallback patterns", () => {
    const files = findFiles("packages/cli/src/infrastructure/**/*.ts").filter(
      (f) => !(f.includes("__tests__") || f.includes(".test."))
    );

    const violations: string[] = [];
    // Match `config.region ||`, `config.region ??`, `options.region ||`,
    // `options.region ??` — all equivalent silent-default shapes.
    const fallbackRegex = /(config|options)\.region\s*(\|\||\?\?)/;

    for (const file of files) {
      const content = readFile(file);
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (fallbackRegex.test(lines[i])) {
          violations.push(`${file}:${i + 1} — ${lines[i].trim()}`);
        }
      }
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────
// Test 5: CLI router forwards region flag to all AWS commands
// ─────────────────────────────────────────────────────────
//
// Commands that call AWS APIs depend on knowing which region to operate in.
// The router (cli.ts) receives `flags.region` from the user but historically
// forgot to forward it to several commands — they silently fell back to
// us-east-1 or whatever getAWSRegion() resolved.
//
// This test scans cli.ts for multi-line `await command({` call blocks that
// use any `flags.*` arg and checks that they include `region: flags.region`.
// Commands in REGION_NOT_NEEDED are explicitly exempted (API-backed or local).
//
// To add a new command that doesn't need region: add its name to the set.
// To add a new AWS command: it must include `region: flags.region`.
// ─────────────────────────────────────────────────────────

describe("cli router forwards region to all AWS commands", () => {
  test("packages/cli/src/cli.ts passes region: flags.region to every AWS command call", () => {
    // Commands that don't touch AWS directly — API-backed, local dev servers,
    // or informational. Adding a new entry here is a conscious opt-out.
    const REGION_NOT_NEEDED = new Set([
      // Local dev / informational — no AWS calls
      "dashboard",
      "platformInfo",
      "news",
      "support",
      "showHelp",
      // Auth / account — AWS credentials but not region-specific
      "authLogin",
      "authStatusCmd",
      "authLogout",
      "awsSetup",
      // Email DNS check — auto-discovers regions from existing connections
      "check",
      // Email reply — local decode, no AWS
      "replyDecode",
      // Domain management — uses Wraps API, not direct AWS
      "listDomains",
      "verifyDomain",
      "getDkim",
      "removeDomain",
      // Email agents — list/kill use Wraps API, not direct AWS (create deploys and forwards region)
      "agentList",
      "agentKill",
      // Templates / workflows — API-backed or local scaffold
      "templatesInit",
      "templatesPush",
      "templatesPreview",
      "workflowsInit",
      "workflowsValidate",
      "workflowsPush",
      "workflowInit",
      // IAM policy generator — outputs policy JSON, no AWS calls
      "permissions",
    ]);

    const content = readFile("packages/cli/src/cli.ts");
    const lines = content.split("\n");
    const violations: string[] = [];

    // Match the opening line of a multi-arg command call: `await fnName({`
    const callOpenRe = /^\s*await\s+(\w+)\s*\(\{/;

    let i = 0;
    while (i < lines.length) {
      const openMatch = lines[i].match(callOpenRe);
      if (openMatch) {
        const fnName = openMatch[1];
        const blockStart = i + 1; // 1-indexed for reporting
        // Collect the call block until the matching closing `});`
        const blockLines: string[] = [lines[i]];
        let j = i + 1;
        let depth = 1;
        while (j < lines.length && depth > 0) {
          const l = lines[j];
          for (const ch of l) {
            if (ch === "{") depth++;
            else if (ch === "}") depth--;
          }
          blockLines.push(l);
          j++;
        }

        if (!REGION_NOT_NEEDED.has(fnName)) {
          const block = blockLines.join("\n");

          // Only flag blocks that actually use flags.* (single-arg or no-arg
          // calls like `await foo()` are caught by the opening regex only when
          // they use `({`, so this filters edge cases).
          if (
            block.includes("flags.") &&
            !block.includes("region: flags.region") &&
            // baseline:allow-no-region — for legitimate exceptions annotate
            // the call site instead of broadening REGION_NOT_NEEDED
            !block.includes("baseline:allow-no-region")
          ) {
            violations.push(
              `cli.ts:${blockStart} — ${fnName}() uses flags.* but omits region: flags.region`
            );
          }
        }

        i = j; // skip past the block we just consumed
        continue;
      }
      i++;
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────
// Test 6: Init/Upgrade commands forward --yes and --preview
// ─────────────────────────────────────────────────────────
//
// Interactive setup/upgrade commands must receive `yes: flags.yes` so callers
// can suppress all confirmation prompts (non-interactive CI, scripting).
// They must also receive `preview: flags.preview` so callers can do a dry-run
// without deploying.  Commands whose option types don't support preview yet
// belong in PREVIEW_NOT_SUPPORTED until the implementation catches up.
//
// To add a new init/upgrade command: include both flags in the router call.
// To skip preview only: add the function name to PREVIEW_NOT_SUPPORTED.
// ─────────────────────────────────────────────────────────

describe("cli router forwards --yes and --preview to init/upgrade commands", () => {
  test("all *Init and *Upgrade calls in cli.ts pass yes: flags.yes and preview: flags.preview", () => {
    // API-backed or local scaffold commands — no interactive AWS prompts.
    const YES_NOT_NEEDED = new Set([
      "templatesInit",
      "workflowsInit",
      "workflowInit",
    ]);

    // Commands whose option types don't include preview? yet.
    // Remove from this set when preview support is added to the implementation.
    const PREVIEW_NOT_SUPPORTED = new Set<string>([]);

    const content = readFile("packages/cli/src/cli.ts");
    const lines = content.split("\n");
    const violations: string[] = [];
    const callOpenRe = /^\s*await\s+(\w+)\s*\(\{/;

    let i = 0;
    while (i < lines.length) {
      const openMatch = lines[i].match(callOpenRe);
      if (openMatch) {
        const fnName = openMatch[1];
        const fnLower = fnName.toLowerCase();
        const isInitUpgrade =
          fnLower.endsWith("init") || fnLower.endsWith("upgrade");

        const blockStart = i + 1;
        const blockLines: string[] = [lines[i]];
        let j = i + 1;
        let depth = 1;
        while (j < lines.length && depth > 0) {
          const l = lines[j];
          for (const ch of l) {
            if (ch === "{") depth++;
            else if (ch === "}") depth--;
          }
          blockLines.push(l);
          j++;
        }

        if (isInitUpgrade) {
          const block = blockLines.join("\n");
          if (
            !(YES_NOT_NEEDED.has(fnName) || block.includes("yes: flags.yes"))
          ) {
            violations.push(
              `cli.ts:${blockStart} — ${fnName}() omits yes: flags.yes`
            );
          }
          const previewExempt =
            YES_NOT_NEEDED.has(fnName) || PREVIEW_NOT_SUPPORTED.has(fnName);
          if (!(previewExempt || block.includes("preview: flags.preview"))) {
            violations.push(
              `cli.ts:${blockStart} — ${fnName}() omits preview: flags.preview`
            );
          }
        }

        i = j;
        continue;
      }
      i++;
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────
// Test 7: Destroy commands forward --force and --preview
// ─────────────────────────────────────────────────────────
//
// Destructive commands gate execution behind --force. If the router forgets
// to forward it, the command falls back to its default (false) and either
// always prompts interactively or rejects --force entirely.
// Destroy commands with a preview? option also need preview: flags.preview
// so callers can dry-run teardown.  Commands without preview support belong
// in PREVIEW_NOT_SUPPORTED until the type and implementation catch up.
//
// To add a new destroy command: include force in the router call.
// ─────────────────────────────────────────────────────────

describe("cli router forwards --force and --preview to destroy commands", () => {
  test("all *Destroy calls in cli.ts pass force: flags.force", () => {
    // Destroy commands whose option types don't include preview? yet.
    const PREVIEW_NOT_SUPPORTED = new Set<string>();

    const content = readFile("packages/cli/src/cli.ts");
    const lines = content.split("\n");
    const violations: string[] = [];
    const callOpenRe = /^\s*await\s+(\w+)\s*\(\{/;

    let i = 0;
    while (i < lines.length) {
      const openMatch = lines[i].match(callOpenRe);
      if (openMatch) {
        const fnName = openMatch[1];
        const isDestroy = fnName.toLowerCase().endsWith("destroy");

        const blockStart = i + 1;
        const blockLines: string[] = [lines[i]];
        let j = i + 1;
        let depth = 1;
        while (j < lines.length && depth > 0) {
          const l = lines[j];
          for (const ch of l) {
            if (ch === "{") depth++;
            else if (ch === "}") depth--;
          }
          blockLines.push(l);
          j++;
        }

        if (isDestroy) {
          const block = blockLines.join("\n");
          if (!block.includes("force: flags.force")) {
            violations.push(
              `cli.ts:${blockStart} — ${fnName}() omits force: flags.force`
            );
          }
          if (
            !(
              PREVIEW_NOT_SUPPORTED.has(fnName) ||
              block.includes("preview: flags.preview")
            )
          ) {
            violations.push(
              `cli.ts:${blockStart} — ${fnName}() omits preview: flags.preview`
            );
          }
        }

        i = j;
        continue;
      }
      i++;
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });
});

// Broadcast resume: schema must declare the indexes that the
// out-of-band CONCURRENT script creates. Without this, a future
// db:generate could forget about them and drift silently.
// ─────────────────────────────────────────────────────────

describe("broadcast resume schema indexes", () => {
  test("message_send_dedup_idx is declared in schema/batch.ts", () => {
    const batchSchema = readFile("packages/db/src/schema/batch.ts");
    expect(batchSchema).toContain('uniqueIndex("message_send_dedup_idx")');
    expect(batchSchema).toMatch(
      /message_send_dedup_idx[\s\S]{0,200}contact_id IS NOT NULL/
    );
  });

  test("contact_keyset_idx is declared in schema/contacts.ts", () => {
    const contactsSchema = readFile("packages/db/src/schema/contacts.ts");
    expect(contactsSchema).toContain('index("contact_keyset_idx")');
    expect(contactsSchema).toMatch(
      /contact_keyset_idx[\s\S]{0,300}organizationId[\s\S]{0,100}createdAt[\s\S]{0,100}\bid\b/
    );
  });

  test("concurrent-index manifest covers both indexes", () => {
    // The DDL moved out of create-broadcast-resume-indexes.ts into the shared
    // manifest, so the per-area scripts and db:migrate-indexes cannot drift.
    // The contract is unchanged: both indexes must still be created
    // out-of-band, because migration 0055 deliberately omits them.
    const manifest = readFile("packages/db/scripts/index-manifest.ts");
    expect(manifest).toContain("CREATE UNIQUE INDEX CONCURRENTLY");
    expect(manifest).toContain("message_send_dedup_idx");
    expect(manifest).toContain("CREATE INDEX CONCURRENTLY");
    expect(manifest).toContain("contact_keyset_idx");

    // And the named script must still run them — migration `-- NOTE:` comments
    // point operators at it by name.
    const script = readFile(
      "packages/db/scripts/create-broadcast-resume-indexes.ts"
    );
    expect(script).toContain("message_send_dedup_idx");
    expect(script).toContain("contact_keyset_idx");
  });

  test("migration 0055 does NOT contain the concurrent indexes (kept out of drizzle-kit)", () => {
    const migration = readFile(
      "packages/db/src/migrations/0055_broadcast_resume_columns.sql"
    );
    const hasConcurrentIndexCreate =
      /^\s*CREATE\s+(UNIQUE\s+)?INDEX\s+(CONCURRENTLY\s+)?(IF NOT EXISTS\s+)?"?(message_send_dedup_idx|contact_keyset_idx)"?/m;
    expect(migration).not.toMatch(hasConcurrentIndexCreate);
  });

  // Self-hosted operators run these against their OWN Postgres. The Neon
  // serverless driver talks only to Neon's WebSocket proxy, so importing it
  // here means every statement dies in the handshake on RDS, Supabase, Docker
  // — anything that isn't Neon. It is also a devDependency, so a production
  // install would not even resolve it. Use `pg`, like the app runtime and the
  // selfhost migrator do.
  test.each([
    "packages/db/scripts/migrate-indexes.ts",
    "packages/db/scripts/run-index-subset.ts",
  ])("%s connects with pg, not the Neon serverless driver", (path) => {
    const script = readFile(path);
    // Match imports only — the scripts explain in prose why they avoid it.
    expect(script).not.toMatch(
      /^import[\s\S]*?from "@neondatabase\/serverless";$/m
    );
    expect(script).toMatch(/^import \{ Pool \} from "pg";$/m);
  });
});

// Test 14: Tailwind v3 CSS-variable shorthand
//
// `size-[--cell-size]` was v3 shorthand for `size-[var(--cell-size)]`.
// Tailwind v4 dropped the implicit var() and requires `size-(--cell-size)`.
// The v3 form still compiles — to `width: --cell-size`, which browsers
// discard. No build error, no type error, no lint error, just missing
// styles. It broke the broadcast date picker and time select in July 2026.
//
// This lives here rather than in baseline.toml because baseline skips any
// file containing a line >= 500 chars, and long className strings are
// precisely where this bug hides.
// ─────────────────────────────────────────────────────────

describe("no tailwind v3 css-variable shorthand", () => {
  test("all ts/tsx files use the v4 paren form", () => {
    const files = [
      ...findFiles("apps/*/src/**/*.{ts,tsx}"),
      ...findFiles("packages/*/src/**/*.{ts,tsx}"),
    ];

    const violations: string[] = [];
    // `-[--foo]` but not `[--foo:value]`, which still sets a variable in v4.
    const v3VarSyntax = /-\[(--[a-zA-Z0-9-]+)\]/g;

    for (const file of files) {
      const lines = readFile(file).split("\n");
      for (const [i, line] of lines.entries()) {
        for (const match of line.matchAll(v3VarSyntax)) {
          violations.push(
            `${file}:${i + 1} — ${match[0]} should be -(${match[1]})`
          );
        }
      }
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────
// Test: SES config-set list/get permission parity
//
// `ses:GetConfigurationSet` takes a set NAME, so it is unreachable without
// `ses:ListConfigurationSets` to discover the names first. Every role template
// granted the Get pair and none granted List, which silently broke config-set
// discovery for every customer — the dashboard reported event tracking as
// disabled on accounts that had it fully configured.
//
// The policy is duplicated across six sources (two CloudFormation templates,
// the CLI's console-role builder, the CLI Pulumi stack, and the standalone
// Pulumi and CDK packages), so the pair can drift apart in any one of them.
// Paths are hardcoded rather than globbed: a repo-wide glob would match test
// fixtures and the gitignored .next-docs tree.
// ─────────────────────────────────────────────────────────

describe("ses config-set list/get permission parity", () => {
  test("every policy source granting GetConfigurationSet also grants ListConfigurationSets", () => {
    const POLICY_SOURCES = [
      "cloudformation/wraps-console-access-role.yaml",
      "cloudformation/wraps-email-infrastructure.yaml",
      "packages/cli/src/commands/platform/update-role.ts",
      "packages/cli/src/infrastructure/resources/iam.ts",
      "packages/pulumi/src/resources/iam.ts",
      "packages/cdk/src/email.ts",
    ];

    const violations: string[] = [];

    // Counted, not just present: three of these files define more than one
    // policy document (wraps-email-infrastructure.yaml alone carries three,
    // including a second copy of wraps-console-access-role), so a file-level
    // `includes` would pass while a block still went unfixed.
    // The negative lookahead keeps GetConfigurationSetEventDestinations —
    // which contains GetConfigurationSet as a substring — out of the count.
    const getRe = /ses:GetConfigurationSet(?!EventDestinations)/g;
    const listRe = /ses:ListConfigurationSets/g;

    for (const file of POLICY_SOURCES) {
      const content = readFile(file);
      const getCount = (content.match(getRe) ?? []).length;
      const listCount = (content.match(listRe) ?? []).length;

      if (getCount === 0) {
        violations.push(
          `${file} — expected a ses:GetConfigurationSet grant, found none. ` +
            "Did the policy move? Update POLICY_SOURCES."
        );
        continue;
      }
      if (listCount < getCount) {
        violations.push(
          `${file} — ${getCount} ses:GetConfigurationSet grant(s) but only ` +
            `${listCount} ses:ListConfigurationSets. Get takes a set name that ` +
            "only List can discover, so config-set scanning fails with " +
            "AccessDeniedException."
        );
      }
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────
// Better-auth catch-all route serves every SCIM verb
// ─────────────────────────────────────────────────────────

describe("auth catch-all route exports every HTTP method", () => {
  test("apps/web/src/app/api/auth/[...all]/route.ts exports GET, POST, PUT, PATCH and DELETE", () => {
    // The SCIM plugin serves user updates on PUT and PATCH and deprovisioning
    // on DELETE. Next.js answers any verb the route file does not export with
    // 405, so dropping one silently breaks IdP sync for every enterprise
    // customer while Create (a POST) keeps working and hides it.
    const content = readFile("apps/web/src/app/api/auth/[...all]/route.ts");
    const missing = ["GET", "POST", "PUT", "PATCH", "DELETE"].filter(
      (method) =>
        !(
          new RegExp(`export\\s+(async\\s+)?function\\s+${method}\\b`).test(
            content
          ) ||
          new RegExp(`export\\s*\\{[^}]*\\b${method}\\b`, "s").test(content)
        )
    );

    expect(
      missing,
      `apps/web/src/app/api/auth/[...all]/route.ts does not export: ${missing.join(", ")}. ` +
        "better-auth's toNextJsHandler returns all five — re-export them or SCIM " +
        "update/deactivate/delete pushes 405."
    ).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────
// pnpm settings live where pnpm 11 reads them
// ─────────────────────────────────────────────────────────

const OVERRIDES_BLOCK = /^overrides:\n((?:[ \t]+\S.*\n|[ \t]*\n)*)/m;
const YAML_ENTRY_LINE = /^\s+\S/;

describe("pnpm config is not stranded in package.json", () => {
  // pnpm 11 stopped reading the "pnpm" field in package.json. It warns on
  // stderr and exits 0, so an overrides block left behind there goes on
  // looking authoritative in review while resolving nothing — CVE floors
  // silently unenforced, duplicate transitive copies back in the tree.
  test("no package.json declares a top-level pnpm field", () => {
    const manifests = [
      "package.json",
      ...findFiles("apps/*/package.json"),
      ...findFiles("packages/*/package.json"),
      "wraps/package.json",
    ];

    const violations = manifests
      .filter((file) => "pnpm" in JSON.parse(readFile(file)))
      .map(
        (file) =>
          `${file} — pnpm 11 ignores the "pnpm" field. Move overrides, ` +
          "packageExtensions and onlyBuiltDependencies (now allowBuilds) " +
          "into pnpm-workspace.yaml. See https://pnpm.io/settings."
      );

    expect(violations, violations.join("\n")).toEqual([]);
  });

  // Deleting the dead field without moving its contents is the other way to
  // lose the pins, and it looks like a clean diff.
  test("pnpm-workspace.yaml declares a non-empty overrides block", () => {
    const content = readFile("pnpm-workspace.yaml");
    const block = OVERRIDES_BLOCK.exec(content);
    const entries = (block?.[1] ?? "")
      .split("\n")
      .filter((line) => YAML_ENTRY_LINE.test(line));

    expect(
      entries.length,
      "pnpm-workspace.yaml has no overrides: block. Most of those entries are " +
        "CVE floors for transitive deps; dropping them re-admits the advisory " +
        "versions without any install-time signal."
    ).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────
// Test: clickable table rows must be reachable by keyboard
// (This cannot be a baseline.toml GritQL rule: deciding whether a row is
//  reachable requires reading the SIBLING columns.tsx, because cells are
//  rendered through flexRender and the link that opens the row lives there,
//  not in the row markup. GritQL matches within one file.
//  It is NOT here because of the 500-char baseline-skip gotcha — no file
//  containing <TableRow> comes close to that limit.)
// ─────────────────────────────────────────────────────────

/**
 * Tables that open on row click and have not yet been given a keyboard path.
 * Opening a row is then mouse-only: no role, no key handler, no link, so
 * keyboard and screen-reader users cannot reach the destination at all
 * (WCAG 2.1.1, Level A — audit finding F7 on the emails list).
 *
 * This list only shrinks. Fix a NAVIGATING table by making its primary cell a
 * real `<Link>` (see `emails/components/columns.tsx`); fix one that opens a
 * sheet or dialog by putting a real button in the row. Then delete its line.
 */
const CLICKABLE_ROW_ALLOWLIST = new Set([
  "apps/web/src/app/(dashboard)/[orgSlug]/(ee)/automations/[workflowId]/executions/components/executions-table.tsx",
  "apps/web/src/app/(dashboard)/[orgSlug]/(ee)/automations/components/workflows-table.tsx",
  // Opens a details sheet rather than navigating, so no link can stand in for
  // it. The fix is a real button inside the row; until then it is pinned here.
  "apps/web/src/app/(dashboard)/[orgSlug]/events/components/events-table.tsx",
  "apps/web/src/app/(dashboard)/[orgSlug]/emails/inbound/components/inbound-emails-table.tsx",
  "apps/web/src/app/(dashboard)/[orgSlug]/sms/components/sms-table.tsx",
]);

const TABLE_ROW_OPEN_TAG = /<TableRow\b/g;
const NAVIGATION_CALL =
  /\brouter\.(push|replace)\s*\(|\bredirect\s*\(|\bnavigate\s*\(|\bwindow\.location\b/;
const KEY_HANDLER = /onKeyDown|onKeyUp|onKeyPress/;
const ACTIVATABLE_ROLE = /role="(button|link)"/;
const CELL_LINK = /<Link\b|<a\s|role="link"/;
const IDENTIFIER = /[A-Za-z_$][\w$]*/g;
/** How far past a handler's declaration to look for a navigation call. */
const HANDLER_BODY_CHARS = 700;

/**
 * The full opening tag starting at `start`, brace-aware so the `>` inside an
 * inline `onClick={() => ...}` arrow does not truncate it.
 */
function openingTagAt(content: string, start: number): string {
  let depth = 0;
  for (let i = start; i < content.length; i++) {
    const char = content[i];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
    } else if (char === ">" && depth === 0) {
      return content.slice(start, i + 1);
    }
  }
  return content.slice(start);
}

/** The brace-matched value of `attr={...}`, or null if the attribute is absent. */
function jsxAttributeValue(tag: string, attr: string): string | null {
  const at = tag.indexOf(`${attr}={`);
  if (at === -1) {
    return null;
  }
  const start = tag.indexOf("{", at);
  let depth = 0;
  for (let i = start; i < tag.length; i++) {
    const char = tag[i];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return tag.slice(start + 1, i);
      }
    }
  }
  return null;
}

/**
 * Whether the row's click handler navigates somewhere, as opposed to opening a
 * sheet, selecting, or expanding in place. Inline handlers are read directly;
 * `onClick={handleRowClick}` is followed one hop to the handler's declaration
 * in the same file. One hop only - a handler that delegates further reads as
 * non-navigating, which is the safe direction (it demands more, not less).
 */
function rowClickNavigates(content: string, openingTag: string): boolean {
  const handler = jsxAttributeValue(openingTag, "onClick");
  if (handler === null) {
    return false;
  }
  if (NAVIGATION_CALL.test(handler)) {
    return true;
  }
  for (const name of handler.match(IDENTIFIER) ?? []) {
    const declared = content.indexOf(`const ${name} =`);
    if (declared === -1) {
      continue;
    }
    if (
      NAVIGATION_CALL.test(
        content.slice(declared, declared + HANDLER_BODY_CHARS)
      )
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Whether the row itself can be operated from the keyboard: a key handler AND
 * a role that announces it as operable. `tabIndex` alone is deliberately NOT
 * enough - it makes the row focusable, which is not the same as activatable,
 * and a focus stop that does nothing on Enter is worse than none.
 */
function rowIsActivatableItself(openingTag: string): boolean {
  return KEY_HANDLER.test(openingTag) && ACTIVATABLE_ROLE.test(openingTag);
}

/**
 * Rows in `file` that open on click with no keyboard path to the same place.
 *
 * Cells render through `flexRender`, so the link that makes a navigating row
 * reachable normally lives in the sibling `columns.tsx`. Two paths are
 * accepted, and only two:
 *
 *   1. the row is activatable in its own markup (key handler + role), or
 *   2. the row's onClick NAVIGATES and the columns file renders a link.
 *
 * Requiring (2) to be a navigation is what stops an unrelated link in some
 * other cell - a "view contact" link in an events table, say - from exempting
 * a row that opens a details sheet, which no link can reach.
 *
 * Known limits, both deliberate:
 *   - when the row navigates, ANY link in the columns file counts; hrefs are
 *     not compared against the onClick destination. Checking that statically
 *     is not worth it, and a table whose row navigates and whose cells link
 *     somewhere is overwhelmingly linking to the row's own subject.
 *   - for a non-navigating row the affordance must be in the row markup. A
 *     button in a columns cell does not count, because in practice that is a
 *     row-actions menu, not the row's own action.
 */
function findClickOnlyRows(file: string, content: string): number[] {
  const columnsFile = `${file.slice(0, file.lastIndexOf("/"))}/columns.tsx`;
  let columnsContent = "";
  if (existsSync(resolve(ROOT, columnsFile))) {
    columnsContent = readFile(columnsFile);
  }
  const columnsLink = CELL_LINK.test(columnsContent);

  const rows: number[] = [];
  TABLE_ROW_OPEN_TAG.lastIndex = 0;
  for (const match of content.matchAll(TABLE_ROW_OPEN_TAG)) {
    const openingTag = openingTagAt(content, match.index);
    if (!openingTag.includes("onClick")) {
      continue;
    }
    if (rowIsActivatableItself(openingTag)) {
      continue;
    }
    if (columnsLink && rowClickNavigates(content, openingTag)) {
      continue;
    }
    rows.push(content.slice(0, match.index).split("\n").length);
  }
  return rows;
}

describe("clickable table rows are reachable by keyboard", () => {
  test("a <TableRow> with onClick offers a keyboard path to the same place", () => {
    const files = findFiles("apps/web/src/**/*.tsx").filter(
      (f) => !(f.includes("__tests__") || f.includes(".test."))
    );

    const violations: string[] = [];

    for (const file of files) {
      const content = readFile(file);
      if (!content.includes("<TableRow") || CLICKABLE_ROW_ALLOWLIST.has(file)) {
        continue;
      }

      for (const lineNum of findClickOnlyRows(file, content)) {
        violations.push(
          `${file}:${lineNum} — <TableRow onClick> with no keyboard path to what it opens. ` +
            "If the row navigates, make its primary cell a <Link> in columns.tsx. " +
            "If it opens a sheet or dialog, put a real button in the row."
        );
      }
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });

  // A stale allowlist reads as coverage. Fixing a table must force its entry out.
  test("the clickable-row allowlist has no stale entries", () => {
    const stale = [...CLICKABLE_ROW_ALLOWLIST].filter(
      (file) => findClickOnlyRows(file, readFile(file)).length === 0
    );

    expect(
      stale,
      `These tables have a keyboard path now. Remove them from CLICKABLE_ROW_ALLOWLIST:\n${stale.join("\n")}`
    ).toEqual([]);
  });
});
