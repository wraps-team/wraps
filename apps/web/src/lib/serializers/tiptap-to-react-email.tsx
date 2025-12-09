/**
 * TipTap to React Email Serializer
 *
 * Converts TipTap JSON content to React Email components with Tailwind CSS.
 * Supports dark mode via CSS media queries (prefers-color-scheme).
 * This is a core part of the template editor that transforms
 * the editor's document structure into renderable email HTML.
 */

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  pixelBasedPreset,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";
import { pretty, render } from "@react-email/render";
import type { JSONContent } from "@tiptap/core";
import type { ReactElement } from "react";
import { getImageWithPlaceholder } from "@/lib/brand-kit/placeholders";

type BrandKitColors = {
  primaryColor?: string;
  secondaryColor?: string;
  backgroundColor?: string;
  textColor?: string;
  fontFamily?: string;
  headingFontFamily?: string;
  buttonRadius?: string;
  // Dark mode colors (optional - will auto-generate if not provided)
  darkPrimaryColor?: string;
  darkSecondaryColor?: string;
  darkBackgroundColor?: string;
  darkTextColor?: string;
};

type SerializerOptions = {
  previewText?: string;
  brandKit?: BrandKitColors;
};

/**
 * Resolves a variable in the content with test data
 */
function resolveVariable(
  name: string,
  testData: Record<string, unknown>,
  fallback?: string
): string {
  const value = testData[name];
  if (value !== undefined && value !== null) {
    return String(value);
  }
  return fallback || `{{${name}}}`;
}

/**
 * Evaluates a conditional expression
 */
function evaluateCondition(
  variableName: string,
  operator: string,
  compareValue: unknown,
  testData: Record<string, unknown>
): boolean {
  const value = testData[variableName];

  switch (operator) {
    case "equals":
      return value === compareValue;
    case "notEquals":
      return value !== compareValue;
    case "exists":
      return value !== undefined && value !== null;
    case "notExists":
      return value === undefined || value === null;
    case "contains":
      return String(value).includes(String(compareValue));
    case "greaterThan":
      return Number(value) > Number(compareValue);
    case "lessThan":
      return Number(value) < Number(compareValue);
    default:
      return false;
  }
}

/**
 * Converts a TipTap node to React Email component(s) with Tailwind classes
 * Uses dark: variants for automatic dark mode support
 */
function nodeToReactEmail(
  node: JSONContent,
  testData: Record<string, unknown>,
  index: number
): ReactElement | ReactElement[] | string | null {
  const key = `node-${index}`;

  switch (node.type) {
    case "doc":
      return (
        <>
          {node.content?.map((child, i) =>
            nodeToReactEmail(child, testData, i)
          )}
        </>
      );

    case "paragraph":
      return (
        <Text className="my-4 text-inherit leading-relaxed" key={key}>
          {node.content?.map((child, i) =>
            nodeToReactEmail(child, testData, i)
          )}
        </Text>
      );

    case "text": {
      const text = node.text || "";

      // Apply marks (bold, italic, etc.)
      if (node.marks) {
        for (const mark of node.marks) {
          switch (mark.type) {
            case "bold":
              return (
                <strong className="font-bold" key={key}>
                  {text}
                </strong>
              );
            case "italic":
              return (
                <em className="italic" key={key}>
                  {text}
                </em>
              );
            case "underline":
              return (
                <span className="underline" key={key}>
                  {text}
                </span>
              );
            case "link":
              return (
                <Link
                  className="text-brand-primary underline dark:text-brand-dark-primary"
                  href={mark.attrs?.href}
                  key={key}
                >
                  {text}
                </Link>
              );
          }
        }
      }

      return text;
    }

    case "heading": {
      const level = node.attrs?.level || 1;
      const HeadingTag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      const headingClasses = {
        h1: "text-3xl font-bold my-4",
        h2: "text-2xl font-bold my-4",
        h3: "text-xl font-semibold my-3",
        h4: "text-lg font-semibold my-3",
        h5: "text-base font-semibold my-2",
        h6: "text-sm font-semibold my-2",
      };
      return (
        <Heading
          as={HeadingTag}
          className={headingClasses[HeadingTag]}
          key={key}
        >
          {node.content?.map((child, i) =>
            nodeToReactEmail(child, testData, i)
          )}
        </Heading>
      );
    }

    case "emailButton": {
      // Map buttonRadius to Tailwind classes
      const radiusMap: Record<string, string> = {
        "0px": "rounded-none",
        "4px": "rounded",
        "6px": "rounded-md",
        "8px": "rounded-lg",
        "9999px": "rounded-full",
      };
      const radius = node.attrs?.borderRadius || "4px";
      const roundedClass = radiusMap[radius] || "rounded";

      // Map alignment to Tailwind classes
      const alignMap: Record<string, string> = {
        left: "text-left",
        center: "text-center",
        right: "text-right",
      };
      const align = node.attrs?.align || "left";
      const alignClass = alignMap[align] || "text-left";

      return (
        <div className={alignClass} key={key}>
          <Button
            className={`inline-block bg-brand-primary px-6 py-3 font-semibold text-white no-underline dark:bg-brand-dark-primary ${roundedClass}`}
            href={node.attrs?.href || "#"}
          >
            {node.attrs?.text || "Click here"}
          </Button>
        </div>
      );
    }

    case "emailSection":
      return (
        <Section className="p-5" key={key}>
          {node.content?.map((child, i) =>
            nodeToReactEmail(child, testData, i)
          )}
        </Section>
      );

    case "emailImage": {
      // Map alignment to Tailwind classes
      const alignMap: Record<string, string> = {
        left: "text-left",
        center: "text-center",
        right: "text-right",
      };
      const align = node.attrs?.align || "center";
      const alignClass = alignMap[align] || "text-center";
      // Use placeholder if src is empty or a variable
      const imgSrc = getImageWithPlaceholder(node.attrs?.src, "generic");

      return (
        <div className={alignClass} key={key}>
          <Img
            alt={node.attrs?.alt || "Image"}
            className="inline-block h-auto max-w-full"
            height={node.attrs?.height}
            src={imgSrc}
            width={node.attrs?.width}
          />
        </div>
      );
    }

    case "emailDivider":
    case "horizontalRule":
      return (
        <Hr className="my-6 border-gray-200 dark:border-gray-700" key={key} />
      );

    case "emailSpacer": {
      // Use Tailwind arbitrary value for dynamic height
      const height = node.attrs?.height || 24;
      return (
        <div className={"w-full"} key={key} style={{ height: `${height}px` }} />
      );
    }

    case "emailPreview": {
      // Preview text is handled at the top level, but if nested, render as hidden
      const previewText = node.attrs?.text || "";
      return (
        <div
          className="hidden max-h-0 max-w-0 overflow-hidden opacity-0"
          key={key}
          style={{ display: "none", msoHide: "all" } as React.CSSProperties}
        >
          {previewText}
        </div>
      );
    }

    case "emailAvatar": {
      const size = node.attrs?.size || 64;
      const shape = node.attrs?.shape || "circle";
      const align = node.attrs?.align || "center";
      // Use placeholder if src is empty or a variable
      const avatarSrc = getImageWithPlaceholder(node.attrs?.src, "avatar");

      const borderRadiusMap: Record<string, string> = {
        circle: "9999px",
        rounded: "8px",
        square: "0",
      };

      const alignMap: Record<string, string> = {
        left: "text-left",
        center: "text-center",
        right: "text-right",
      };

      return (
        <div className={alignMap[align] || "text-center"} key={key}>
          <Img
            alt={node.attrs?.alt || "Avatar"}
            className="inline-block"
            height={size}
            src={avatarSrc}
            style={{
              borderRadius: borderRadiusMap[shape] || "9999px",
              objectFit: "cover",
            }}
            width={size}
          />
        </div>
      );
    }

    case "emailCodeBlock": {
      const code = node.attrs?.code || "";
      const bgColor = node.attrs?.backgroundColor || "#1e1e1e";
      const textColor = node.attrs?.textColor || "#d4d4d4";
      const padding = node.attrs?.padding || "16px";
      const borderRadius = node.attrs?.borderRadius || "8px";
      const fontSize = node.attrs?.fontSize || "14px";
      const fontFamily =
        node.attrs?.fontFamily || "'Fira Code', 'Consolas', monospace";

      return (
        <pre
          key={key}
          style={{
            backgroundColor: bgColor,
            color: textColor,
            padding,
            borderRadius,
            fontSize,
            fontFamily,
            overflow: "auto",
            margin: "16px 0",
          }}
        >
          <code>{code}</code>
        </pre>
      );
    }

    case "emailSocialLinks": {
      const links = (node.attrs?.links || []) as Array<{
        platform: string;
        url: string;
      }>;
      const iconSize = node.attrs?.iconSize || 24;
      const iconColor = node.attrs?.iconColor || "#6b7280";
      const iconSpacing = node.attrs?.iconSpacing || "16px";
      const align = node.attrs?.align || "center";

      const alignMap: Record<string, string> = {
        left: "text-left",
        center: "text-center",
        right: "text-right",
      };

      // Social platform icons as simple text links (email clients have limited SVG support)
      const platformLabels: Record<string, string> = {
        twitter: "Twitter",
        linkedin: "LinkedIn",
        instagram: "Instagram",
        facebook: "Facebook",
        youtube: "YouTube",
        github: "GitHub",
      };

      if (links.length === 0) {
        return null;
      }

      return (
        <div className={`my-4 ${alignMap[align] || "text-center"}`} key={key}>
          {links.map((link, i) => (
            <Link
              href={link.url || "#"}
              key={link.platform}
              style={{
                color: iconColor,
                fontSize: `${iconSize}px`,
                marginRight: i < links.length - 1 ? iconSpacing : "0",
                textDecoration: "none",
              }}
            >
              {platformLabels[link.platform] || link.platform}
            </Link>
          ))}
        </div>
      );
    }

    case "variable":
      return resolveVariable(
        node.attrs?.name || "",
        testData,
        node.attrs?.fallback
      );

    case "conditional": {
      const shouldShow = evaluateCondition(
        node.attrs?.variableName || "",
        node.attrs?.operator || "exists",
        node.attrs?.value,
        testData
      );

      if (shouldShow) {
        return (
          <>
            {node.content?.map((child, i) =>
              nodeToReactEmail(child, testData, i)
            )}
          </>
        );
      }
      return null;
    }

    case "bulletList":
      return (
        <ul className="my-4 list-disc pl-5" key={key}>
          {node.content?.map((child, i) =>
            nodeToReactEmail(child, testData, i)
          )}
        </ul>
      );

    case "orderedList":
      return (
        <ol className="my-4 list-decimal pl-5" key={key}>
          {node.content?.map((child, i) =>
            nodeToReactEmail(child, testData, i)
          )}
        </ol>
      );

    case "listItem":
      return (
        <li className="my-1" key={key}>
          {node.content?.map((child, i) =>
            nodeToReactEmail(child, testData, i)
          )}
        </li>
      );

    case "blockquote":
      return (
        <blockquote
          className="my-4 border-gray-200 border-l-4 pl-4 text-gray-600 italic dark:border-gray-600 dark:text-gray-400"
          key={key}
        >
          {node.content?.map((child, i) =>
            nodeToReactEmail(child, testData, i)
          )}
        </blockquote>
      );

    case "codeBlock":
      return (
        <pre
          className="overflow-auto rounded bg-gray-100 p-4 font-mono text-sm dark:bg-gray-800"
          key={key}
        >
          <code>
            {node.content?.map((child, i) =>
              nodeToReactEmail(child, testData, i)
            )}
          </code>
        </pre>
      );

    default:
      // For unknown nodes, try to render children
      if (node.content) {
        return (
          <>
            {node.content.map((child, i) =>
              nodeToReactEmail(child, testData, i)
            )}
          </>
        );
      }
      return null;
  }
}

/**
 * Creates the Tailwind config with brand kit colors and pixelBasedPreset
 * Uses pixel-based values for better email client compatibility
 */
function createTailwindConfig(brandKit?: BrandKitColors) {
  // Default light mode colors
  const primaryColor = brandKit?.primaryColor || "#5046e5";
  const secondaryColor = brandKit?.secondaryColor || "#6366f1";
  const backgroundColor = brandKit?.backgroundColor || "#ffffff";
  const textColor = brandKit?.textColor || "#1f2937";

  // Dark mode colors (use provided or generate sensible defaults)
  const darkPrimaryColor = brandKit?.darkPrimaryColor || "#818cf8"; // Lighter purple
  const darkSecondaryColor = brandKit?.darkSecondaryColor || "#a5b4fc"; // Even lighter
  const darkBackgroundColor = brandKit?.darkBackgroundColor || "#1f2937"; // Dark gray
  const darkTextColor = brandKit?.darkTextColor || "#f9fafb"; // Almost white

  return {
    presets: [pixelBasedPreset], // Use pixel-based units for email compatibility
    darkMode: "media" as const, // Use prefers-color-scheme media query
    theme: {
      extend: {
        colors: {
          brand: {
            // Light mode colors
            primary: primaryColor,
            secondary: secondaryColor,
            background: backgroundColor,
            text: textColor,
            // Dark mode colors (accessible via dark:bg-brand-dark-primary etc.)
            "dark-primary": darkPrimaryColor,
            "dark-secondary": darkSecondaryColor,
            "dark-background": darkBackgroundColor,
            "dark-text": darkTextColor,
          },
        },
        fontFamily: {
          sans: brandKit?.fontFamily || "system-ui, sans-serif",
          heading:
            brandKit?.headingFontFamily ||
            brandKit?.fontFamily ||
            "system-ui, sans-serif",
        },
      },
    },
  };
}

/**
 * Converts TipTap JSON content to a complete React Email component with Tailwind
 * Includes dark mode support via prefers-color-scheme media query
 */
export function tiptapToReactEmail(
  content: JSONContent,
  testData: Record<string, unknown> = {},
  options: SerializerOptions = {}
): ReactElement {
  const emailContent = nodeToReactEmail(content, testData, 0);
  const tailwindConfig = createTailwindConfig(options.brandKit);

  return (
    <Html>
      <Tailwind config={tailwindConfig}>
        <Head>
          {/* Dark mode support meta tags */}
          <meta content="light dark" name="color-scheme" />
          <meta content="light dark" name="supported-color-schemes" />
          {/* Required for Apple Mail dark mode support */}
          <style>{":root { color-scheme: light dark; }"}</style>
        </Head>
        {options.previewText && <Preview>{options.previewText}</Preview>}
        <Body className="bg-gray-50 font-sans text-brand-text dark:bg-gray-900 dark:text-brand-dark-text">
          <Container className="mx-auto max-w-[600px] bg-brand-background p-5 dark:bg-brand-dark-background">
            {emailContent}
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

/**
 * Renders TipTap JSON content to production-ready HTML email
 * Uses @react-email/render to produce email-client-compatible HTML
 * with proper MSO conditionals for Outlook support
 */
export async function renderTipTapToHtml(
  content: JSONContent,
  testData: Record<string, unknown> = {},
  options: SerializerOptions = {}
): Promise<string> {
  const emailComponent = tiptapToReactEmail(content, testData, options);
  const html = await render(emailComponent);
  // Prettify the HTML output for better readability
  const prettyHtml = await pretty(html);
  return prettyHtml;
}

// ============================================================================
// String Code Generation (for Code Editor)
// ============================================================================

/**
 * Convert hex color to Tailwind background class
 * Uses bracket syntax for custom colors, named classes only for black/white
 */
function hexToTailwindBg(hex: string): string {
  const lowerHex = hex.toLowerCase();

  // Use named classes for black and white
  if (lowerHex === "#ffffff" || lowerHex === "#fff") {
    return "bg-white";
  }
  if (lowerHex === "#000000" || lowerHex === "#000") {
    return "bg-black";
  }

  // Use bracket syntax for all other colors (more predictable)
  return `bg-[${hex}]`;
}

/**
 * Convert hex color to Tailwind text class
 * Uses bracket syntax for custom colors, named classes only for black/white
 */
function hexToTailwindText(hex: string): string {
  const lowerHex = hex.toLowerCase();

  // Use named classes for black and white
  if (lowerHex === "#ffffff" || lowerHex === "#fff") {
    return "text-white";
  }
  if (lowerHex === "#000000" || lowerHex === "#000") {
    return "text-black";
  }

  // Use bracket syntax for all other colors (more predictable)
  return `text-[${hex}]`;
}

/**
 * Convert padding value to Tailwind class
 * Always uses bracket syntax for pixel values (matches React Email pattern)
 */
function paddingToTailwind(padding: string): string {
  // Handle 0 values
  if (padding === "0" || padding === "0px") {
    return "p-0";
  }
  // Use bracket syntax for all other values
  return `p-[${padding}]`;
}

/**
 * Convert border-radius value to Tailwind class
 * Uses named classes for common values, bracket syntax otherwise
 */
function borderRadiusToTailwind(radius: string): string {
  // Handle special cases
  if (radius === "0" || radius === "0px") {
    return "rounded-none";
  }
  if (radius === "9999px") {
    return "rounded-full";
  }
  // Use bracket syntax for all other values
  return `rounded-[${radius}]`;
}

function getOperatorCodeString(operator: string): string {
  switch (operator) {
    case "equals":
      return "===";
    case "notEquals":
      return "!==";
    case "greaterThan":
      return ">";
    case "lessThan":
      return "<";
    case "contains":
      return ".includes";
    default:
      return "===";
  }
}

/**
 * Generates React Email code as a string from TipTap JSON content
 * Uses Tailwind CSS classes for styling, preserving actual attribute values
 */
export function generateReactEmailCode(
  content: JSONContent,
  indent = 0
): string {
  const spaces = "  ".repeat(indent);

  if (!content.type) {
    return "";
  }

  switch (content.type) {
    case "doc": {
      // Extract preview nodes from content (they need special placement)
      const contentNodes = content.content || [];
      const previewNodes = contentNodes.filter(
        (c) => c.type === "emailPreview"
      );
      const otherNodes = contentNodes.filter((c) => c.type !== "emailPreview");

      // Generate preview text (combine all preview nodes)
      const previewText = previewNodes
        .map((p) => (p.attrs?.text as string) || "")
        .filter(Boolean)
        .join(" ");

      // Generate children (excluding preview)
      const children = otherNodes
        .map((c) => generateReactEmailCode(c, indent))
        .filter(Boolean)
        .join("\n");

      // Preview must be placed after Head but before Body in React Email
      const previewLine = previewText
        ? `\n        <Preview>${previewText}</Preview>`
        : "";

      return `import { Html, Head, Body, Container, Text, Button, Section, Img, Hr, Heading, Link, Preview, Tailwind, pixelBasedPreset } from "@react-email/components";

export default function EmailTemplate() {
  return (
    <Html>
      <Tailwind config={{ presets: [pixelBasedPreset] }}>
        <Head />${previewLine}
        <Body className="bg-gray-100 font-sans">
          <Container className="bg-white mx-auto p-[20px] max-w-[600px]">
${children}
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}`;
    }

    case "paragraph": {
      const pContent = (content.content || [])
        .map((c) => generateReactEmailCode(c, 0))
        .join("");
      return `${spaces}          <Text className="my-4 leading-relaxed">${pContent}</Text>`;
    }

    case "heading": {
      const level = content.attrs?.level || 1;
      const hContent = (content.content || [])
        .map((c) => generateReactEmailCode(c, 0))
        .join("");
      const headingClasses: Record<number, string> = {
        1: "text-3xl font-bold my-4",
        2: "text-2xl font-bold my-4",
        3: "text-xl font-semibold my-3",
        4: "text-lg font-semibold my-3",
        5: "text-base font-semibold my-2",
        6: "text-sm font-semibold my-2",
      };
      return `${spaces}          <Heading as="h${level}" className="${headingClasses[level] || headingClasses[1]}">${hContent}</Heading>`;
    }

    case "text":
      return content.text || "";

    case "emailButton": {
      const attrs = content.attrs || {};
      const align = (attrs.align as string) || "left";

      // Use actual colors from attributes
      const bgClass = hexToTailwindBg(
        (attrs.backgroundColor as string) || "#5046e5"
      );
      const textClass = hexToTailwindText((attrs.color as string) || "#ffffff");
      const roundedClass = borderRadiusToTailwind(
        (attrs.borderRadius as string) || "6px"
      );

      // Parse padding
      const padding = (attrs.padding as string) || "12px 24px";
      const [py, px] = padding.split(" ").map((p) => p.trim());
      const pyValue = py || "12px";
      const pxValue = px || py || "24px";
      const pyClass = paddingToTailwind(pyValue).replace("p-", "py-");
      const pxClass = paddingToTailwind(pxValue).replace("p-", "px-");

      // Font weight
      const fontWeight = (attrs.fontWeight as string) || "600";
      const fontWeightClass =
        fontWeight === "600"
          ? "font-semibold"
          : fontWeight === "700"
            ? "font-bold"
            : fontWeight === "400"
              ? "font-normal"
              : "font-semibold";

      const alignClass =
        align === "center"
          ? "text-center"
          : align === "right"
            ? "text-right"
            : "text-left";

      const btnText =
        (content.content || [])
          .map((c) => generateReactEmailCode(c, 0))
          .join("") || "Click here";

      return `${spaces}          <div className="${alignClass}">
${spaces}            <Button
${spaces}              href="${attrs.href || "#"}"
${spaces}              className="${bgClass} ${textClass} ${pxClass} ${pyClass} ${fontWeightClass} no-underline inline-block ${roundedClass}"
${spaces}            >
${spaces}              ${btnText}
${spaces}            </Button>
${spaces}          </div>`;
    }

    case "emailSection": {
      const attrs = content.attrs || {};
      const bgClass = hexToTailwindBg(
        (attrs.backgroundColor as string) || "#ffffff"
      );
      const paddingClass = paddingToTailwind(
        (attrs.padding as string) || "24px"
      );
      const roundedClass = borderRadiusToTailwind(
        (attrs.borderRadius as string) || "0"
      );

      const sectionChildren = (content.content || [])
        .map((c) => generateReactEmailCode(c, indent + 1))
        .filter(Boolean)
        .join("\n");

      return `${spaces}          <Section className="${bgClass} ${paddingClass} ${roundedClass}">
${sectionChildren}
${spaces}          </Section>`;
    }

    case "emailImage": {
      const attrs = content.attrs || {};
      const align = (attrs.align as string) || "center";
      const alignClass =
        align === "center"
          ? "text-center"
          : align === "right"
            ? "text-right"
            : "text-left";

      const width = (attrs.width as string) || "100%";
      const height = (attrs.height as string) || "auto";

      // Build width/height classes
      let dimensionClasses = "";
      if (width === "100%") {
        dimensionClasses += "w-full ";
      } else if (width) {
        dimensionClasses += `w-[${width}] `;
      }
      if (height && height !== "auto") {
        dimensionClasses += `h-[${height}] `;
      } else {
        dimensionClasses += "h-auto ";
      }

      return `${spaces}          <div className="${alignClass}">
${spaces}            <Img
${spaces}              src="${attrs.src || ""}"
${spaces}              alt="${attrs.alt || ""}"
${spaces}              className="${dimensionClasses.trim()} max-w-full inline-block"
${spaces}            />
${spaces}          </div>`;
    }

    case "emailDivider": {
      const attrs = content.attrs || {};
      const color = (attrs.borderColor as string) || "#e5e7eb";
      const borderClass =
        color === "#e5e7eb" ? "border-gray-200" : `border-[${color}]`;
      const margin = (attrs.margin as string) || "24px";
      const marginClass = margin === "24px" ? "my-6" : `my-[${margin}]`;

      return `${spaces}          <Hr className="${borderClass} ${marginClass}" />`;
    }

    case "emailSpacer": {
      const height = (content.attrs?.height as string) || "24px";
      return `${spaces}          <div className="w-full h-[${height}]" />`;
    }

    case "variable":
      return `{props.${content.attrs?.name || "variable"}}`;

    case "bulletList": {
      const items = (content.content || [])
        .map((c) => generateReactEmailCode(c, indent))
        .join("\n");
      return `${spaces}          <ul className="pl-5 my-4 list-disc">
${items}
${spaces}          </ul>`;
    }

    case "orderedList": {
      const items = (content.content || [])
        .map((c) => generateReactEmailCode(c, indent))
        .join("\n");
      return `${spaces}          <ol className="pl-5 my-4 list-decimal">
${items}
${spaces}          </ol>`;
    }

    case "listItem": {
      const liContent = (content.content || [])
        .map((c) => {
          // For list items, render the paragraph content directly
          if (c.type === "paragraph") {
            return (c.content || [])
              .map((t) => generateReactEmailCode(t, 0))
              .join("");
          }
          return generateReactEmailCode(c, 0);
        })
        .join("");
      return `${spaces}            <li className="my-1">${liContent}</li>`;
    }

    case "blockquote": {
      const bqContent = (content.content || [])
        .map((c) => generateReactEmailCode(c, indent + 1))
        .join("\n");
      return `${spaces}          <blockquote className="border-l-4 border-gray-200 pl-4 my-4 text-gray-500 italic">
${bqContent}
${spaces}          </blockquote>`;
    }

    case "conditional": {
      const attrs = content.attrs || {};
      const condContent = (content.content || [])
        .map((c) => generateReactEmailCode(c, indent + 1))
        .join("\n");
      return `${spaces}          {props.${attrs.variable} ${getOperatorCodeString(attrs.operator as string)} ${JSON.stringify(attrs.value)} && (
${condContent}
${spaces}          )}`;
    }

    case "emailRow": {
      const attrs = content.attrs || {};
      const gap = (attrs.gap as string) || "16px";
      const gapClass = gap === "16px" ? "gap-4" : `gap-[${gap}]`;

      const rowChildren = (content.content || [])
        .map((c) => generateReactEmailCode(c, indent + 1))
        .filter(Boolean)
        .join("\n");

      return `${spaces}          <div className="flex ${gapClass}">
${rowChildren}
${spaces}          </div>`;
    }

    case "emailColumn": {
      const attrs = content.attrs || {};
      const width = (attrs.width as string) || "auto";
      const widthClass = width === "auto" ? "flex-1" : `w-[${width}]`;

      const colChildren = (content.content || [])
        .map((c) => generateReactEmailCode(c, indent + 1))
        .filter(Boolean)
        .join("\n");

      return `${spaces}            <div className="${widthClass}">
${colChildren}
${spaces}            </div>`;
    }

    case "emailPreview": {
      // Preview is handled at the doc level to ensure correct placement
      // (must be after <Head /> but before <Body> in React Email)
      return "";
    }

    case "emailAvatar": {
      const attrs = content.attrs || {};
      const size = (attrs.size as number) || 64;
      const shape = (attrs.shape as string) || "circle";
      const align = (attrs.align as string) || "center";

      const borderRadiusMap: Record<string, string> = {
        circle: "9999px",
        rounded: "8px",
        square: "0",
      };
      const borderRadius = borderRadiusMap[shape] || "9999px";

      const alignClass =
        align === "center"
          ? "text-center"
          : align === "right"
            ? "text-right"
            : "text-left";

      return `${spaces}          <div className="${alignClass}">
${spaces}            <Img
${spaces}              src="${attrs.src || ""}"
${spaces}              alt="${attrs.alt || "Avatar"}"
${spaces}              width={${size}}
${spaces}              height={${size}}
${spaces}              className="inline-block"
${spaces}              style={{ borderRadius: "${borderRadius}", objectFit: "cover" }}
${spaces}            />
${spaces}          </div>`;
    }

    case "emailCodeBlock": {
      const attrs = content.attrs || {};
      const code = (attrs.code as string) || "";
      const bgColor = (attrs.backgroundColor as string) || "#1e1e1e";
      const textColor = (attrs.textColor as string) || "#d4d4d4";
      const padding = (attrs.padding as string) || "16px";
      const borderRadius = (attrs.borderRadius as string) || "8px";
      const fontSize = (attrs.fontSize as string) || "14px";
      const fontFamily =
        (attrs.fontFamily as string) || "'Fira Code', 'Consolas', monospace";

      // Escape code for safe rendering in template
      const escapedCode = code.replace(/`/g, "\\`").replace(/\$/g, "\\$");

      return `${spaces}          <pre
${spaces}            style={{
${spaces}              backgroundColor: "${bgColor}",
${spaces}              color: "${textColor}",
${spaces}              padding: "${padding}",
${spaces}              borderRadius: "${borderRadius}",
${spaces}              fontSize: "${fontSize}",
${spaces}              fontFamily: "${fontFamily}",
${spaces}              overflow: "auto",
${spaces}              margin: "16px 0",
${spaces}            }}
${spaces}          >
${spaces}            <code>{\`${escapedCode}\`}</code>
${spaces}          </pre>`;
    }

    case "emailSocialLinks": {
      const attrs = content.attrs || {};
      const links = (attrs.links || []) as Array<{
        platform: string;
        url: string;
      }>;
      const iconColor = (attrs.iconColor as string) || "#6b7280";
      const iconSize = (attrs.iconSize as number) || 24;
      const iconSpacing = (attrs.iconSpacing as string) || "16px";
      const align = (attrs.align as string) || "center";

      const alignClass =
        align === "center"
          ? "text-center"
          : align === "right"
            ? "text-right"
            : "text-left";

      const platformLabels: Record<string, string> = {
        twitter: "Twitter",
        linkedin: "LinkedIn",
        instagram: "Instagram",
        facebook: "Facebook",
        youtube: "YouTube",
        github: "GitHub",
      };

      if (links.length === 0) {
        return `${spaces}          {/* Social Links - No links configured */}`;
      }

      const linkComponents = links
        .map((link, i) => {
          const label = platformLabels[link.platform] || link.platform;
          const marginRight = i < links.length - 1 ? iconSpacing : "0";
          return `${spaces}            <Link
${spaces}              href="${link.url || "#"}"
${spaces}              style={{
${spaces}                color: "${iconColor}",
${spaces}                fontSize: "${iconSize}px",
${spaces}                marginRight: "${marginRight}",
${spaces}                textDecoration: "none",
${spaces}              }}
${spaces}            >
${spaces}              ${label}
${spaces}            </Link>`;
        })
        .join("\n");

      return `${spaces}          <div className="${alignClass} my-4">
${linkComponents}
${spaces}          </div>`;
    }

    default:
      if (content.content) {
        return (content.content || [])
          .map((c) => generateReactEmailCode(c, indent))
          .filter(Boolean)
          .join("\n");
      }
      return "";
  }
}
