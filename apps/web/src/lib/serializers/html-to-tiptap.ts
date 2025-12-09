import type { JSONContent } from "@tiptap/core";
import { parse } from "node-html-parser";

/**
 * Parse HTML string to TipTap JSON format
 * Maps common HTML elements to our custom email nodes
 */
export function parseHTMLToTipTap(html: string): JSONContent {
  const root = parse(html, {
    blockTextElements: {
      script: false,
      noscript: false,
      style: false,
    },
  });

  const content: JSONContent[] = [];

  // Process all child nodes
  for (const child of root.childNodes) {
    const nodes = parseNode(child);
    content.push(...nodes);
  }

  // If no content was parsed, add a default paragraph
  if (content.length === 0) {
    content.push({
      type: "paragraph",
      content: [{ type: "text", text: "Imported content" }],
    });
  }

  return {
    type: "doc",
    content,
  };
}

function parseNode(
  node: ReturnType<typeof parse>["childNodes"][number]
): JSONContent[] {
  // Handle text nodes
  if (node.nodeType === 3) {
    // Text node
    const text = node.text.trim();
    if (!text) {
      return [];
    }
    return [{ type: "text", text }];
  }

  // Handle element nodes
  if (node.nodeType !== 1) {
    return [];
  }

  const element = node as ReturnType<typeof parse>;
  const tagName = element.tagName?.toLowerCase();

  if (!tagName) {
    return [];
  }

  // Map HTML elements to TipTap nodes
  switch (tagName) {
    // Headings
    case "h1":
      return [createHeading(element, 1)];
    case "h2":
      return [createHeading(element, 2)];
    case "h3":
      return [createHeading(element, 3)];
    case "h4":
      return [createHeading(element, 4)];
    case "h5":
      return [createHeading(element, 5)];
    case "h6":
      return [createHeading(element, 6)];

    // Paragraph and text containers
    case "p":
    case "div":
      return [createParagraph(element)];

    // Links - could be buttons
    case "a": {
      const href = element.getAttribute("href") || "";
      const style = element.getAttribute("style") || "";
      const classAttr = element.getAttribute("class") || "";

      // Check if it's styled like a button
      if (
        style.includes("background") ||
        classAttr.includes("button") ||
        classAttr.includes("btn")
      ) {
        return [createButton(element, href)];
      }

      // Otherwise treat as inline link in paragraph
      return [createParagraph(element)];
    }

    // Images
    case "img":
      return [createImage(element)];

    // Horizontal rule / divider
    case "hr":
      return [createDivider(element)];

    // Lists
    case "ul":
      return [createBulletList(element)];
    case "ol":
      return [createOrderedList(element)];
    case "li":
      return [createListItem(element)];

    // Table elements - map to sections
    case "table":
    case "tbody":
    case "thead":
      return parseChildren(element);

    case "tr":
      return [createRow(element)];

    case "td":
    case "th":
      return [createSection(element)];

    // Semantic sections
    case "section":
    case "article":
    case "header":
    case "footer":
    case "main":
    case "aside":
      return [createSection(element)];

    // Inline elements - return their children
    case "span":
    case "strong":
    case "b":
    case "em":
    case "i":
    case "u":
      return parseInlineElement(element);

    // Line break - convert to paragraph break
    case "br":
      return [];

    // Skip script, style, etc.
    case "script":
    case "style":
    case "meta":
    case "link":
    case "head":
    case "title":
      return [];

    // Default: try to parse children
    default:
      return parseChildren(element);
  }
}

function parseChildren(element: ReturnType<typeof parse>): JSONContent[] {
  const content: JSONContent[] = [];
  for (const child of element.childNodes) {
    content.push(...parseNode(child));
  }
  return content;
}

function parseInlineElement(element: ReturnType<typeof parse>): JSONContent[] {
  const content: JSONContent[] = [];
  const tagName = element.tagName?.toLowerCase();

  for (const child of element.childNodes) {
    if (child.nodeType === 3) {
      const text = child.text.trim();
      if (text) {
        const marks: JSONContent["marks"] = [];

        // Add appropriate marks
        if (tagName === "strong" || tagName === "b") {
          marks.push({ type: "bold" });
        }
        if (tagName === "em" || tagName === "i") {
          marks.push({ type: "italic" });
        }
        if (tagName === "u") {
          marks.push({ type: "underline" });
        }

        content.push({
          type: "text",
          text,
          marks: marks.length > 0 ? marks : undefined,
        });
      }
    } else {
      content.push(...parseNode(child));
    }
  }

  return content;
}

function createHeading(
  element: ReturnType<typeof parse>,
  level: number
): JSONContent {
  const content = parseInlineContent(element);
  return {
    type: "heading",
    attrs: { level },
    content: content.length > 0 ? content : [{ type: "text", text: "Heading" }],
  };
}

function createParagraph(element: ReturnType<typeof parse>): JSONContent {
  const content = parseInlineContent(element);
  return {
    type: "paragraph",
    content: content.length > 0 ? content : undefined,
  };
}

function parseInlineContent(element: ReturnType<typeof parse>): JSONContent[] {
  const content: JSONContent[] = [];

  for (const child of element.childNodes) {
    if (child.nodeType === 3) {
      const text = child.text.trim();
      if (text) {
        content.push({ type: "text", text });
      }
    } else if (child.nodeType === 1) {
      const childElement = child as ReturnType<typeof parse>;
      const tagName = childElement.tagName?.toLowerCase();

      if (tagName === "br") {
        // Skip line breaks in inline content
        continue;
      }

      if (["strong", "b", "em", "i", "u", "span"].includes(tagName || "")) {
        content.push(...parseInlineElement(childElement));
      } else if (tagName === "a") {
        const href = childElement.getAttribute("href") || "";
        const text = childElement.text.trim();
        if (text) {
          content.push({
            type: "text",
            text,
            marks: [{ type: "link", attrs: { href } }],
          });
        }
      } else {
        // For other elements, just get the text
        const text = childElement.text.trim();
        if (text) {
          content.push({ type: "text", text });
        }
      }
    }
  }

  return content;
}

function createButton(
  element: ReturnType<typeof parse>,
  href: string
): JSONContent {
  const text = element.text.trim() || "Click here";
  const style = parseInlineStyle(element.getAttribute("style") || "");

  return {
    type: "emailButton",
    attrs: {
      text,
      href,
      backgroundColor: style.backgroundColor || style.background || "#5046e5",
      color: style.color || "#ffffff",
      padding: style.padding || "12px 24px",
      borderRadius: style.borderRadius || "6px",
      fontSize: style.fontSize || "14px",
      fontWeight: style.fontWeight || "600",
      align: "left",
    },
  };
}

function createImage(element: ReturnType<typeof parse>): JSONContent {
  const src = element.getAttribute("src") || "";
  const alt = element.getAttribute("alt") || "";
  const width = element.getAttribute("width") || "100%";
  const height = element.getAttribute("height") || "auto";

  return {
    type: "emailImage",
    attrs: {
      src,
      alt,
      width,
      height,
    },
  };
}

function createDivider(element: ReturnType<typeof parse>): JSONContent {
  const style = parseInlineStyle(element.getAttribute("style") || "");

  return {
    type: "emailDivider",
    attrs: {
      color: style.borderColor || style.backgroundColor || "#e5e7eb",
      thickness: style.borderWidth || style.height || "1px",
      margin: style.margin || "24px",
    },
  };
}

function createSection(element: ReturnType<typeof parse>): JSONContent {
  const style = parseInlineStyle(element.getAttribute("style") || "");
  const content = parseChildren(element);

  // Filter to only block-level content
  const blockContent = content.filter(
    (node) =>
      node.type !== "text" ||
      (node.type === "text" && node.text && node.text.trim())
  );

  // Wrap any text nodes in paragraphs
  const wrappedContent = blockContent.map((node) => {
    if (node.type === "text") {
      return {
        type: "paragraph",
        content: [node],
      };
    }
    return node;
  });

  return {
    type: "emailSection",
    attrs: {
      backgroundColor: style.backgroundColor || "#ffffff",
      padding: style.padding || "24px",
      borderRadius: style.borderRadius || "0",
    },
    content:
      wrappedContent.length > 0 ? wrappedContent : [{ type: "paragraph" }],
  };
}

function createRow(element: ReturnType<typeof parse>): JSONContent {
  const children = parseChildren(element);

  // Convert children to columns
  const columns = children.map((child) => {
    if (child.type === "emailSection") {
      return {
        type: "emailColumn",
        attrs: { width: "auto" },
        content: child.content || [{ type: "paragraph" }],
      };
    }
    return {
      type: "emailColumn",
      attrs: { width: "auto" },
      content: [child],
    };
  });

  return {
    type: "emailRow",
    attrs: { gap: "16px", align: "top" },
    content:
      columns.length > 0
        ? columns
        : [
            {
              type: "emailColumn",
              attrs: { width: "auto" },
              content: [{ type: "paragraph" }],
            },
          ],
  };
}

function createBulletList(element: ReturnType<typeof parse>): JSONContent {
  const items: JSONContent[] = [];

  for (const child of element.childNodes) {
    if (child.nodeType === 1) {
      const childElement = child as ReturnType<typeof parse>;
      if (childElement.tagName?.toLowerCase() === "li") {
        items.push(createListItem(childElement));
      }
    }
  }

  return {
    type: "bulletList",
    content:
      items.length > 0
        ? items
        : [{ type: "listItem", content: [{ type: "paragraph" }] }],
  };
}

function createOrderedList(element: ReturnType<typeof parse>): JSONContent {
  const items: JSONContent[] = [];

  for (const child of element.childNodes) {
    if (child.nodeType === 1) {
      const childElement = child as ReturnType<typeof parse>;
      if (childElement.tagName?.toLowerCase() === "li") {
        items.push(createListItem(childElement));
      }
    }
  }

  return {
    type: "orderedList",
    content:
      items.length > 0
        ? items
        : [{ type: "listItem", content: [{ type: "paragraph" }] }],
  };
}

function createListItem(element: ReturnType<typeof parse>): JSONContent {
  const content = parseInlineContent(element);

  return {
    type: "listItem",
    content: [
      {
        type: "paragraph",
        content: content.length > 0 ? content : undefined,
      },
    ],
  };
}

function parseInlineStyle(style: string): Record<string, string> {
  const result: Record<string, string> = {};

  if (!style) {
    return result;
  }

  const declarations = style.split(";");
  for (const declaration of declarations) {
    const [property, value] = declaration.split(":").map((s) => s.trim());
    if (property && value) {
      // Convert kebab-case to camelCase
      const camelProperty = property.replace(/-([a-z])/g, (_, letter) =>
        letter.toUpperCase()
      );
      result[camelProperty] = value;
    }
  }

  return result;
}
