/**
 * Integration test: the CLI's render pipeline produces plain-text output
 * with correctly-cased Handlebars tokens even when the template puts a
 * block helper inside a <Heading>.
 *
 * This is the regression test for the `reengagement-activate-account`
 * SES failure: "Attribute 'IF' is not present in the rendering data."
 */

import { Heading, Html } from "@react-email/components";
import React from "react";
import { describe, expect, it } from "vitest";
import { renderTemplateWithProxy } from "../template-render";

function TemplateWithHandlebarsInHeading(props: Record<string, string>) {
  const { firstName } = props;
  return React.createElement(
    Html,
    null,
    React.createElement(
      Heading,
      { as: "h1" },
      `{{#if firstName}}Hey ${firstName}, the{{else}}The{{/if}} setup just got easier.`
    )
  );
}

function TemplateWithDottedHandlebarsInHeading(
  _props: Record<string, string>
) {
  return React.createElement(
    Html,
    null,
    React.createElement(
      Heading,
      { as: "h1" },
      "{{#if contact.firstName}}Hey {{contact.firstName}}, the{{else}}The{{/if}} setup just got easier."
    )
  );
}

describe("renderTemplateWithProxy", () => {
  it("normalizes uppercased Handlebars tokens that html-to-text produces from <Heading> content", async () => {
    const { html, text, accessedProps } = await renderTemplateWithProxy(
      TemplateWithHandlebarsInHeading
    );

    // Proxy captured the prop
    expect(accessedProps.has("firstName")).toBe(true);

    // HTML is unaffected (html-to-text only runs on the plain-text path)
    expect(html).toContain("{{#if firstName}}");
    expect(html).not.toContain("{{#IF");

    // Plain text MUST have lowercase helpers and canonical variable case,
    // otherwise SES Handlebars will reject the template at send time.
    expect(text).not.toMatch(/\{\{#IF\b/);
    expect(text).not.toContain("{{/IF}}");
    expect(text).not.toContain("{{ELSE}}");
    expect(text).not.toContain("{{FIRSTNAME}}");
    expect(text).toContain("{{#if firstName}}");
    expect(text).toContain("{{firstName}}");
    expect(text).toContain("{{else}}");
    expect(text).toContain("{{/if}}");
  });

  it("restores dotted Handlebars paths from the HTML scan when plain-text uppercases a heading", async () => {
    const { html, text, accessedProps } = await renderTemplateWithProxy(
      TemplateWithDottedHandlebarsInHeading
    );

    expect(accessedProps.size).toBe(0);
    expect(html).toContain("{{#if contact.firstName}}");
    expect(html).toContain("{{contact.firstName}}");
    expect(text).not.toMatch(/\{\{#IF\b/);
    expect(text).not.toContain("{{CONTACT.FIRSTNAME}}");
    expect(text).toContain("{{#if contact.firstName}}");
    expect(text).toContain("{{contact.firstName}}");
    expect(text).toContain("{{else}}");
    expect(text).toContain("{{/if}}");
  });

  it("throws a clear error when the component returns null", async () => {
    // TemplateComponent's type allows `(props) => React.ReactElement | null`,
    // so a feature-flagged or conditional template can legitimately return
    // null. The previous implementation cast `element as React.ReactElement`
    // and passed null to @react-email/render, which throws a confusing
    // internal error. This pins the contract that null components are
    // rejected at the boundary with an actionable message.
    function NullTemplate(_props: Record<string, string>) {
      return null;
    }

    await expect(renderTemplateWithProxy(NullTemplate)).rejects.toThrow(
      /returned null/
    );
  });
});
