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
  Section,
  Tailwind,
  Text,
} from "@react-email/components";
import type { JSONContent } from "@tiptap/core";
import type { ReactElement } from "react";

interface BrandKitColors {
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
}

interface SerializerOptions {
  previewText?: string;
  brandKit?: BrandKitColors;
}

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

      return (
        <div className={alignClass} key={key}>
          <Img
            alt={node.attrs?.alt || ""}
            className="inline-block h-auto max-w-full"
            height={node.attrs?.height}
            src={node.attrs?.src || ""}
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
      const height = node.attrs?.height || "20px";
      return <div className={`w-full h-[${height}]`} key={key} />;
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
 * Creates the Tailwind config with brand kit colors (light and dark mode)
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
