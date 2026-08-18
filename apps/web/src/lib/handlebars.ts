/**
 * Shared Handlebars helpers used by template compilation, the broadcast
 * variable mapper action, and any preview iframe that needs to substitute
 * variables and evaluate {{#if}}/{{else}}/{{/if}} blocks.
 *
 * Kept in its own module so server actions and client components can import
 * just these helpers without pulling in compile-template.ts's heavy
 * sucrase / @react-email/render dependencies.
 */

import {
  type CompiledTemplate,
  nestKeys as canonicalNestKeys,
  compileTemplate,
} from "@wraps/template-render";
// Subpath import: dependency-free regex, safe to ship to the browser.
import {
  buildSesRenderData,
  transformVariablesForSes,
} from "@wraps/template-render/mustache-case";

/**
 * Bare-word Handlebars tokens that the variable extractor regex matches
 * but should NOT be surfaced as user variables.
 *
 * The regex `/\{\{([a-zA-Z0-9_.]+)(?:\|([^}]*))?\}\}/g` already skips the
 * common block helper forms `{{#if}}`, `{{/if}}`, `{{#each}}`, `{{/each}}`
 * (because of `#` and `/`). Only two bare words actually slip through:
 *
 *   - `{{else}}` — the alternate branch of an `{{#if}}` or `{{#unless}}`
 *   - `{{this}}` — the current Handlebars context reference
 *
 * Keep this set tight. Adding `if` / `unless` / `each` / `with` here
 * would be misleading because those forms can never appear bare in the
 * regex output, and an over-broad set risks filtering future user vars.
 */
export const HANDLEBARS_KEYWORDS = new Set(["else", "this"]);

/**
 * Extract `{{variable}}` / `{{variable|fallback}}` placeholders from a
 * template string (subject line, compiled HTML, etc.).
 *
 * The name pattern is restricted to `[a-zA-Z0-9_.]+` ON PURPOSE: block
 * helper tags like `{{#if firstName}}` and `{{/if}}` must never be
 * extracted as variables (`#` and `/` don't match), and HANDLEBARS_KEYWORDS
 * above is sized to that contract. Don't loosen the pattern.
 *
 * Whitespace tolerance matches transformVariablesForSes: `{{ firstName }}`
 * publishes and renders fine, so it must be visible to the coverage check
 * and variable mapper too.
 */
export function extractHandlebarsVariables(
  source: string
): Array<{ name: string; fallback?: string }> {
  const vars: Array<{ name: string; fallback?: string }> = [];
  const seen = new Set<string>();
  const regex = /\{\{\s*([a-zA-Z0-9_.]+)(?:\s*\|\s*([^}]*?))?\s*\}\}/g;
  let match = regex.exec(source);

  while (match !== null) {
    const name = match[1];
    if (!(seen.has(name) || HANDLEBARS_KEYWORDS.has(name))) {
      seen.add(name);
      const fallback = match[2]?.trim();
      vars.push(fallback ? { name, fallback } : { name });
    }
    match = regex.exec(source);
  }

  return vars;
}

/**
 * Re-export the canonical `nestKeys` from `@wraps/template-render`. This
 * file used to ship its own copy; the canonical version is now the single
 * source of truth and the dashboard preview, the broadcast variable mapper,
 * the subscription mailer, and any future consumer all share it.
 */
export const nestKeys = canonicalNestKeys;

/**
 * Render compiled template HTML through Handlebars with substitution data
 * so a preview iframe shows what the email will actually look like —
 * including `{{#if}}/{{else}}/{{/if}}` block evaluation and `{{var}}`
 * substitution.
 *
 * The compiled HTML stored in the database keeps its raw `{{var}}`
 * placeholders (so SES and the workflow runtime can substitute per-recipient
 * at send time). This helper is for *display only* in the dashboard.
 *
 * Falls back to the raw HTML if Handlebars compilation fails so a malformed
 * template doesn't blank out the preview pane.
 */
// Bounded cache of compiled templates keyed by html string. The carousel
// re-renders 5 times per recipient swap and the editor re-renders on every
// keystroke; without memoization we'd recompile the same template
// repeatedly. 32 entries is enough for any realistic preview session — when
// full we drop everything and start over (a proper LRU isn't worth the
// complexity at this scale).
//
// The compile + render itself lives in @wraps/template-render so the
// dashboard preview, the test-send endpoint, the workflow worker, and the
// subscription mailer all use the same code path. This module just adds
// the per-html memoization layer that's specific to the browser-side
// preview hot path.
const COMPILE_CACHE_MAX = 32;
const compileCache = new Map<string, CompiledTemplate>();

function getCompiledTemplate(html: string): CompiledTemplate {
  const cached = compileCache.get(html);
  if (cached) {
    return cached;
  }
  // Transform inside the cache so it runs once per template, not once per
  // render — this cache exists for the preview hot path.
  const tmpl = compileTemplate(transformVariablesForSes(html));
  if (compileCache.size >= COMPILE_CACHE_MAX) {
    compileCache.clear();
  }
  compileCache.set(html, tmpl);
  return tmpl;
}

/**
 * Render a compiled template the way a send would.
 *
 * `transformVariablesForSes` first (inside the compile cache), exactly like the
 * batch sender and the workflow step handlers: stored `compiledHtml` holds the
 * authoring syntax (`{{firstName|there}}`, `{{contact.firstName}}`), and
 * Handlebars cannot parse it — `|` is block-params syntax, so a fallback
 * variable is a compile error, not a substitution. Untransformed, a preview
 * silently fell back to raw `{{...}}` and a test send failed with a Handlebars
 * parse error while the real broadcast rendered fine.
 *
 * `buildSesRenderData` widens the data to the key shape the transformed
 * template expects, whichever shape the caller passed.
 */
export function renderForPreview(
  html: string,
  data: Record<string, unknown>
): string {
  if (!html) {
    return html;
  }
  return getCompiledTemplate(html)(buildSesRenderData(data));
}

// Variables that usually hold a paragraph rather than a word, so a form gives
// them a textarea. An <input> cannot hold a newline at all — text pasted into
// one is silently flattened — which is how a broadcast's {{content}} lost its
// line breaks before reaching the renderer.
const LONG_FORM_NAME_PATTERN =
  /content|body|message|paragraph|description|markdown|html/i;

/**
 * Shared by the broadcast variable mapper and the send-test form so the same
 * variable does not get a textarea in one and a single-line input in the other.
 *
 * Deliberately no length heuristic: this is recomputed on every render, so a
 * "value is long now" rule would swap <Input> for <Textarea> mid-keystroke and
 * unmount the focused element. Newlines only arrive from loaded data, never
 * from typing, so that check is stable while the user types.
 */
export function isLongFormVariable(name: string, value: string): boolean {
  return LONG_FORM_NAME_PATTERN.test(name) || value.includes("\n");
}
