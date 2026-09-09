/**
 * Render a React Email component into the HTML + plain-text bodies that
 * the CLI pushes to SES.
 *
 * The render uses a tracking Proxy for props so that every accessed prop
 * produces a `{{name}}` placeholder in the output — this is how the CLI
 * captures user-template variables without needing explicit declarations.
 *
 * The plain-text output is additionally normalized via
 * `normalizePlainTextMustaches` to restore the case of Handlebars keywords
 * and known variables. This is load-bearing: `@react-email/render`'s
 * plain-text path (html-to-text) uppercases `<Heading>`/`<h1>` content,
 * turning `{{#if firstName}}` into `{{#IF FIRSTNAME}}`. SES Handlebars is
 * case-sensitive and rejects `#IF` as a missing `IF` attribute, which is
 * exactly the `reengagement-activate-account` send-time failure we saw
 * in production.
 */

import { normalizePlainTextMustaches } from "@wraps/template-render/mustache-case";
import type React from "react";

export type RenderedTemplate = {
  html: string;
  text: string;
  accessedProps: Set<string>;
};

type TemplateComponent = (
  props: Record<string, string>
) => React.ReactElement | null;

export async function renderTemplateWithProxy(
  Component: TemplateComponent
): Promise<RenderedTemplate> {
  const accessedProps = new Set<string>();
  const props = new Proxy({} as Record<string, string>, {
    get: (_target, prop) => {
      if (typeof prop === "symbol") {
        return;
      }
      const name = String(prop);
      accessedProps.add(name);
      return `{{${name}}}`;
    },
  });

  const { render } = await import("@react-email/render");
  const element = Component(props);
  // TemplateComponent's type allows `(props) => React.ReactElement | null`,
  // so a feature-flagged or conditional template can legitimately return
  // null. @react-email/render doesn't throw on null — it silently returns
  // a doctype-only HTML string and an empty plain-text body, which would
  // result in the CLI publishing an empty template to SES with no error.
  // Reject at the boundary with a clear, actionable message.
  if (element === null) {
    throw new Error(
      "Template component returned null. Check that the component's default export returns a React element unconditionally."
    );
  }
  const html = await render(element);
  const rawText = await render(element, {
    plainText: true,
  });

  // Canonical variable set for plain-text case restoration: merge HTML-scanned
  // names with Proxy-tracked accesses so we cover vars that only appear in
  // conditionals/comparisons and never render as text.
  const htmlVarNames = new Set<string>();
  const regex = /\{\{([a-zA-Z0-9_.]+)(?:\|[^}]*)?\}\}/g;
  let match = regex.exec(html);
  while (match !== null) {
    htmlVarNames.add(match[1]);
    match = regex.exec(html);
  }

  const canonicalVars = new Set<string>([...htmlVarNames, ...accessedProps]);
  const text = normalizePlainTextMustaches(rawText, canonicalVars);

  return { html, text, accessedProps };
}
