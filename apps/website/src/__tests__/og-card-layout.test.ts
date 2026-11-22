import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { OgCard, titleLayout } from "@/app/og/card";

type Node = ReactElement<{
  children?: unknown;
  style?: Record<string, unknown>;
}>;

/** Every element in a React tree, depth first. */
function elements(node: unknown): Node[] {
  if (Array.isArray(node)) {
    return node.flatMap(elements);
  }
  if (typeof node !== "object" || node === null || !("props" in node)) {
    return [];
  }
  const element = node as Node;
  return [element, ...elements(element.props.children)];
}

/** Concatenated text under a node. */
function text(node: unknown): string {
  if (typeof node === "string") {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map(text).join("");
  }
  if (typeof node === "object" && node !== null && "props" in node) {
    return text((node as Node).props.children);
  }
  return "";
}

const card = (title: string, route = "/docs/guides/dkim") =>
  elements(
    OgCard({ title, section: "Docs", route, logoSrc: "data:image/png;base64," })
  );

const titleNode = (title: string) =>
  card(title).find(
    (node) => text(node) === title && node.props.style?.lineClamp
  );

describe("titleLayout", () => {
  it("balances every title of 100 characters or fewer, and no longer one", () => {
    for (const length of [1, 28, 29, 56, 57, 100]) {
      expect(titleLayout("a".repeat(length)).balance, String(length)).toBe(
        true
      );
    }
    expect(titleLayout("a".repeat(101)).balance).toBe(false);
    expect(titleLayout("a".repeat(200)).balance).toBe(false);
  });

  it("shrinks the type and widens the clamp as the title grows", () => {
    const tiers = [28, 56, 100, 200].map((n) => titleLayout("a".repeat(n)));
    const sizes = tiers.map((tier) => tier.fontSize);
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
    expect(tiers.map((tier) => tier.lines)).toEqual([2, 3, 4, 5]);
  });
});

describe("OgCard", () => {
  it("sets text-wrap: balance on a short title and not on a 101-character one", () => {
    expect(
      titleNode("Configure DKIM for Amazon SES")?.props.style?.textWrap
    ).toBe("balance");
    const long = "a".repeat(101);
    const style = titleNode(long)?.props.style;
    expect(style).toBeDefined();
    expect(style).not.toHaveProperty("textWrap");
  });

  it("clamps the title to its tier's line count", () => {
    expect(titleNode("a".repeat(150))?.props.style?.lineClamp).toBe(5);
  });

  it("shows the route after wraps.dev in the panel, with an orange $ prompt", () => {
    const nodes = card("T", "/docs/guides/dkim");
    expect(
      nodes.some((node) => text(node) === "wraps.dev/docs/guides/dkim")
    ).toBe(true);
    const prompt = nodes.find((node) => text(node) === "$");
    expect(prompt?.props.style?.color).toBe("#f97316");
  });

  it("shows just wraps.dev for the root route", () => {
    expect(card("T", "/").some((node) => text(node) === "wraps.dev")).toBe(
      true
    );
  });

  it("cuts a long route with an ellipsis inside the panel instead of wrapping or overflowing", () => {
    const route = `/${"a-very-long-segment/".repeat(5)}end`;
    const node = card("T", route).find(
      (candidate) => text(candidate) === `wraps.dev${route}`
    );
    expect(node?.props.style).toMatchObject({
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      minWidth: 0,
    });
  });
});
