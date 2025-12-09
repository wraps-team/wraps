import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import type { JSXAttribute, JSXElement, ObjectExpression } from "@babel/types";
import type { JSONContent } from "@tiptap/core";

/**
 * Recursively mark JSX elements as processed to avoid duplicates
 */
function markAsProcessed(
  element: JSXElement,
  processed: Set<JSXElement>
): void {
  processed.add(element);
  for (const child of element.children) {
    if (child.type === "JSXElement") {
      markAsProcessed(child, processed);
    }
  }
}

/**
 * Parse React Email JSX code to TipTap JSON format
 * Converts React Email components to our custom email nodes
 */
export function parseReactEmailToTipTap(code: string): JSONContent {
  const content: JSONContent[] = [];

  try {
    const ast = parse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    });

    // Track which JSX elements we've already processed to avoid duplicates
    const processedElements = new Set<JSXElement>();

    traverse(ast, {
      JSXElement(path) {
        // Skip if already processed (as a child of another element)
        if (processedElements.has(path.node)) {
          return;
        }

        // Process JSX elements that are:
        // 1. Direct children of Program (module level)
        // 2. Inside return statements
        // 3. Inside expression statements (e.g., standalone JSX)
        // 4. Inside arrow function bodies
        // 5. But NOT nested inside other JSX elements
        const parentType = path.parent.type;
        const isTopLevel =
          parentType === "Program" ||
          parentType === "ReturnStatement" ||
          parentType === "ExpressionStatement" ||
          parentType === "ArrowFunctionExpression" ||
          parentType === "BlockStatement" ||
          parentType === "JSXExpressionContainer"; // For expressions like {condition && <Element/>}

        // Skip if this element is a child of another JSX element
        const isNestedJSX =
          parentType === "JSXElement" || parentType === "JSXFragment";

        if (isTopLevel && !isNestedJSX) {
          // Mark this element and all its children as processed
          markAsProcessed(path.node, processedElements);

          const node = parseJSXElement(path.node);
          if (node) {
            // If it's a container (Html, Body), extract its children
            if (Array.isArray(node)) {
              content.push(...node);
            } else {
              content.push(node);
            }
          }
        }
      },
    });
  } catch (error) {
    console.error("Failed to parse React Email code:", error);
    // Return a basic document with the error
    return {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Failed to parse React Email code. Please check the syntax.",
            },
          ],
        },
      ],
    };
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

function parseJSXElement(
  element: JSXElement
): JSONContent | JSONContent[] | null {
  const opening = element.openingElement;
  const componentName = getComponentName(opening.name);

  if (!componentName) {
    return null;
  }

  // Get props
  const props = getJSXProps(opening.attributes as JSXAttribute[]);

  // Parse children
  const children: JSONContent[] = [];
  for (const child of element.children) {
    if (child.type === "JSXElement") {
      const parsed = parseJSXElement(child);
      if (parsed) {
        if (Array.isArray(parsed)) {
          children.push(...parsed);
        } else {
          children.push(parsed);
        }
      }
    } else if (child.type === "JSXText") {
      const text = child.value.trim();
      if (text) {
        children.push({ type: "text", text });
      }
    } else if (child.type === "JSXExpressionContainer") {
      // Handle {variable} expressions
      const expr = child.expression;
      if (expr.type === "Identifier") {
        children.push({
          type: "variable",
          attrs: {
            name: expr.name,
            label: expr.name,
            fallback: "",
            format: null,
          },
        });
      } else if (expr.type === "StringLiteral") {
        children.push({ type: "text", text: expr.value });
      }
    }
  }

  // Map React Email components to TipTap nodes
  switch (componentName) {
    // Container components - extract children
    case "Html":
    case "Body":
    case "Container":
    case "Head":
      return children;

    // Section/Row/Column
    case "Section":
      return createSection(props, children);

    case "Row":
      return createRow(props, children);

    case "Column":
      return createColumn(props, children);

    // Button
    case "Button":
      return createButton(props, children);

    // Text/Heading
    case "Text":
      return createText(props, children);

    case "Heading":
      return createHeading(props, children);

    // Image
    case "Img":
    case "Image":
      return createImage(props);

    // Divider
    case "Hr":
      return createDivider(props);

    // Link
    case "Link":
      return createLink(props, children);

    // Preview text (skip)
    case "Preview":
      return null;

    // Default - wrap in paragraph
    default:
      if (children.length > 0) {
        return {
          type: "paragraph",
          content: children,
        };
      }
      return null;
  }
}

function getComponentName(
  name: JSXElement["openingElement"]["name"]
): string | null {
  if (name.type === "JSXIdentifier") {
    return name.name;
  }
  if (name.type === "JSXMemberExpression") {
    // Handle cases like Email.Button
    return name.property.name;
  }
  return null;
}

function getJSXProps(attributes: JSXAttribute[]): Record<string, unknown> {
  const props: Record<string, unknown> = {};

  for (const attr of attributes) {
    if (!attr || attr.type !== "JSXAttribute") {
      continue;
    }

    const name = attr.name.type === "JSXIdentifier" ? attr.name.name : null;
    if (!name) {
      continue;
    }

    if (!attr.value) {
      // Boolean prop like `disabled`
      props[name] = true;
    } else if (attr.value.type === "StringLiteral") {
      props[name] = attr.value.value;
    } else if (attr.value.type === "JSXExpressionContainer") {
      const expr = attr.value.expression;
      if (expr.type === "StringLiteral") {
        props[name] = expr.value;
      } else if (expr.type === "NumericLiteral") {
        props[name] = expr.value;
      } else if (expr.type === "BooleanLiteral") {
        props[name] = expr.value;
      } else if (expr.type === "ObjectExpression") {
        props[name] = parseObjectExpression(expr);
      } else if (expr.type === "Identifier") {
        // Variable reference - store as placeholder
        props[name] = `{{${expr.name}}}`;
      }
    }
  }

  return props;
}

function parseObjectExpression(
  expr: ObjectExpression
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const prop of expr.properties) {
    if (prop.type === "ObjectProperty") {
      const key =
        prop.key.type === "Identifier"
          ? prop.key.name
          : prop.key.type === "StringLiteral"
            ? prop.key.value
            : null;

      if (!key) {
        continue;
      }

      if (prop.value.type === "StringLiteral") {
        result[key] = prop.value.value;
      } else if (prop.value.type === "NumericLiteral") {
        result[key] = prop.value.value;
      } else if (prop.value.type === "BooleanLiteral") {
        result[key] = prop.value.value;
      }
    }
  }

  return result;
}

function createSection(
  props: Record<string, unknown>,
  children: JSONContent[]
): JSONContent {
  const style = (props.style as Record<string, string>) || {};

  // Wrap text nodes in paragraphs
  const wrappedChildren = children.map((child) => {
    if (child.type === "text") {
      return {
        type: "paragraph",
        content: [child],
      };
    }
    return child;
  });

  return {
    type: "emailSection",
    attrs: {
      backgroundColor: style.backgroundColor || "#ffffff",
      padding: style.padding || "24px",
      borderRadius: style.borderRadius || "0",
    },
    content:
      wrappedChildren.length > 0 ? wrappedChildren : [{ type: "paragraph" }],
  };
}

function createRow(
  props: Record<string, unknown>,
  children: JSONContent[]
): JSONContent {
  const style = (props.style as Record<string, string>) || {};

  // Ensure children are columns
  const columns = children.map((child) => {
    if (child.type === "emailColumn") {
      return child;
    }
    return {
      type: "emailColumn",
      attrs: { width: "auto" },
      content: [child],
    };
  });

  return {
    type: "emailRow",
    attrs: {
      gap: style.gap || "16px",
      align: "top",
    },
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

function createColumn(
  props: Record<string, unknown>,
  children: JSONContent[]
): JSONContent {
  const style = (props.style as Record<string, string>) || {};

  return {
    type: "emailColumn",
    attrs: {
      width: style.width || props.width || "auto",
    },
    content:
      children.length > 0
        ? children.map((child) =>
            child.type === "text"
              ? { type: "paragraph", content: [child] }
              : child
          )
        : [{ type: "paragraph" }],
  };
}

function createButton(
  props: Record<string, unknown>,
  children: JSONContent[]
): JSONContent {
  const style = (props.style as Record<string, string>) || {};
  const text =
    children
      .filter((c): c is JSONContent & { text: string } => c.type === "text")
      .map((c) => c.text)
      .join("") || "Click here";

  return {
    type: "emailButton",
    attrs: {
      text,
      href: (props.href as string) || "#",
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

function createText(
  _props: Record<string, unknown>,
  children: JSONContent[]
): JSONContent {
  return {
    type: "paragraph",
    content: children.length > 0 ? children : undefined,
  };
}

function createHeading(
  props: Record<string, unknown>,
  children: JSONContent[]
): JSONContent {
  const as = props.as as string;
  let level = 2;

  if (as?.match(/^h[1-6]$/)) {
    level = Number.parseInt(as[1], 10);
  }

  return {
    type: "heading",
    attrs: { level },
    content:
      children.length > 0 ? children : [{ type: "text", text: "Heading" }],
  };
}

function createImage(props: Record<string, unknown>): JSONContent {
  return {
    type: "emailImage",
    attrs: {
      src: (props.src as string) || "",
      alt: (props.alt as string) || "",
      width: (props.width as string) || "100%",
      height: (props.height as string) || "auto",
    },
  };
}

function createDivider(props: Record<string, unknown>): JSONContent {
  const style = (props.style as Record<string, string>) || {};

  return {
    type: "emailDivider",
    attrs: {
      color: style.borderColor || "#e5e7eb",
      thickness: style.borderWidth || "1px",
      margin: style.margin || "24px",
    },
  };
}

function createLink(
  props: Record<string, unknown>,
  children: JSONContent[]
): JSONContent {
  const text =
    children
      .filter((c): c is JSONContent & { text: string } => c.type === "text")
      .map((c) => c.text)
      .join("") || "Link";

  return {
    type: "paragraph",
    content: [
      {
        type: "text",
        text,
        marks: [
          {
            type: "link",
            attrs: {
              href: (props.href as string) || "#",
            },
          },
        ],
      },
    ],
  };
}
