/**
 * Template Plain-Text Mustache Case Normalization
 *
 * @react-email/render({ plainText: true }) uppercases `<Heading>` content
 * via html-to-text's default h1 behavior. When a template puts Handlebars
 * syntax inside a heading, `{{#if firstName}}` becomes `{{#IF FIRSTNAME}}`
 * in the plain-text output. SES Handlebars is case-sensitive — it does not
 * recognize `#IF` as the `if` block helper and reports:
 *
 *   "Attribute 'IF' is not present in the rendering data."
 *
 * `normalizePlainTextMustaches` restores the original casing of known
 * Handlebars keywords (if/unless/each/with/else) and known template
 * variables so SES can parse the plain-text version correctly.
 */

import { describe, expect, it } from "vitest";
import { normalizePlainTextMustaches } from "../mustache-case";

describe("normalizePlainTextMustaches", () => {
  it("lowercases an uppercased `{{#IF}}` block open", () => {
    const out = normalizePlainTextMustaches("{{#IF}}", new Set());
    expect(out).toBe("{{#if}}");
  });

  it("lowercases `{{/IF}}` block close and `{{ELSE}}` chain marker", () => {
    const out = normalizePlainTextMustaches(
      "a{{/IF}}b{{ELSE}}c{{/UNLESS}}d{{#EACH}}e{{#WITH}}f",
      new Set()
    );
    expect(out).toBe("a{{/if}}b{{else}}c{{/unless}}d{{#each}}e{{#with}}f");
  });

  it("restores variable case from the canonical variable set", () => {
    // html-to-text uppercased `{{firstName}}` to `{{FIRSTNAME}}`. The
    // canonical set (tracked by the proxy during HTML render) tells us
    // the original camelCase spelling to restore.
    const out = normalizePlainTextMustaches(
      "Hey {{FIRSTNAME}}, welcome to {{COMPANYNAME}}!",
      new Set(["firstName", "companyName"])
    );
    expect(out).toBe("Hey {{firstName}}, welcome to {{companyName}}!");
  });

  it("restores block helper + argument together", () => {
    // This is the exact pattern from the failing reengagement template:
    // `{{#IF FIRSTNAME}}Hey {{FIRSTNAME}}, the{{ELSE}}The{{/IF}}` needs
    // to become the original `{{#if firstName}}...{{else}}...{{/if}}`.
    const out = normalizePlainTextMustaches(
      "{{#IF FIRSTNAME}}Hey {{FIRSTNAME}}, the{{ELSE}}The{{/IF}} setup just got easier.",
      new Set(["firstName"])
    );
    expect(out).toBe(
      "{{#if firstName}}Hey {{firstName}}, the{{else}}The{{/if}} setup just got easier."
    );
  });

  it("leaves already-correct mustaches untouched", () => {
    const input =
      "{{#if firstName}}Hey {{firstName}}{{else}}Hey there{{/if}}, welcome.";
    expect(normalizePlainTextMustaches(input, new Set(["firstName"]))).toBe(
      input
    );
  });

  it("leaves unknown uppercase tokens untouched (not a known helper or variable)", () => {
    // `SKU_123` is not a Handlebars helper and not in the canonical set —
    // we have no safe way to rewrite it, so it stays as-is. Better to
    // leave one stray token than mangle a real identifier.
    const input = "Order {{SKU_123}} processed.";
    expect(normalizePlainTextMustaches(input, new Set(["firstName"]))).toBe(
      input
    );
  });

  it("restores case of dotted variable references like {{CONTACT.FIRSTNAME}}", () => {
    // Templates that use dotted Handlebars paths inside a <Heading>:
    //   <Heading>Hi {{contact.firstName}}</Heading>
    // get uppercased by html-to-text to {{CONTACT.FIRSTNAME}}. SES Handlebars
    // is case-sensitive — it would treat CONTACT.FIRSTNAME as a missing
    // attribute and reject the template at send time. The normalizer must
    // walk each dotted segment and restore each one from the canonical set.
    const out = normalizePlainTextMustaches(
      "Hi {{CONTACT.FIRSTNAME}}, welcome to {{ORGANIZATION.NAME}}.",
      new Set(["contact.firstName", "organization.name"])
    );
    expect(out).toBe(
      "Hi {{contact.firstName}}, welcome to {{organization.name}}."
    );
  });

  it("leaves dotted refs alone when the full path is not in the canonical set", () => {
    // Conservative behavior: if the full lowercased path isn't a known
    // variable, we don't guess at the right case. The production canonical
    // set is built by scanning the original (case-preserving) HTML, so
    // full dotted paths are always present when they should be —
    // partial-match heuristics aren't needed and would risk mangling
    // identifiers we don't actually know.
    const out = normalizePlainTextMustaches(
      "Hi {{CONTACT.FIRSTNAME}}",
      new Set(["firstName"])
    );
    expect(out).toBe("Hi {{CONTACT.FIRSTNAME}}");
  });

  it("restores case of dotted refs inside block helpers", () => {
    // {{#if contact.firstName}}...{{/if}} → {{#IF CONTACT.FIRSTNAME}}...{{/IF}}
    // after html-to-text. Both the helper case AND the dotted argument case
    // need to be restored. The block-helper arg path was already covered
    // for single-word args; this pins the dotted-arg case.
    const out = normalizePlainTextMustaches(
      "{{#IF CONTACT.FIRSTNAME}}Hi {{CONTACT.FIRSTNAME}}{{else}}Hi there{{/IF}}",
      new Set(["contact.firstName"])
    );
    expect(out).toBe(
      "{{#if contact.firstName}}Hi {{contact.firstName}}{{else}}Hi there{{/if}}"
    );
  });
});
