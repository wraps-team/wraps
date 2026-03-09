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
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  pixelBasedPreset,
  Row,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";
import { pretty, render } from "@react-email/render";
import type { JSONContent } from "@tiptap/core";
import type { ReactElement } from "react";
import { getImageWithPlaceholder } from "@/lib/brand-kit/placeholders";

export type BrandKitColors = {
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

export function toBrandKitColors(
  kit:
    | {
        primaryColor: string;
        secondaryColor: string;
        backgroundColor: string;
        textColor: string;
        fontFamily: string;
        headingFontFamily: string | null;
        buttonRadius: string;
      }
    | null
    | undefined
): BrandKitColors | undefined {
  if (!kit) return;
  return {
    primaryColor: kit.primaryColor,
    secondaryColor: kit.secondaryColor,
    backgroundColor: kit.backgroundColor,
    textColor: kit.textColor,
    fontFamily: kit.fontFamily,
    headingFontFamily: kit.headingFontFamily ?? undefined,
    buttonRadius: kit.buttonRadius,
  };
}

type SerializerOptions = {
  previewText?: string;
  brandKit?: BrandKitColors;
  /** When true, variables render as {{name}} for SES substitution. When false, use fallback values. */
  keepVariablesAsPlaceholders?: boolean;
};

/**
 * Resolves a variable in the content with test data
 * @param keepAsPlaceholder - When true, return {{name}} or {{name|fallback}} for SES substitution
 */
function resolveVariable(
  name: string,
  testData: Record<string, unknown>,
  fallback?: string,
  keepAsPlaceholder?: boolean
): string {
  // For SES templates, keep as placeholder with fallback syntax for transformVariablesForSes
  if (keepAsPlaceholder) {
    // Include fallback in placeholder so transformVariablesForSes can generate proper conditionals
    if (fallback) {
      return `{{${name}|${fallback}}}`;
    }
    return `{{${name}}}`;
  }
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
  index: number,
  options: { keepVariablesAsPlaceholders?: boolean } = {}
): ReactElement | ReactElement[] | string | null {
  const key = `node-${index}`;

  switch (node.type) {
    case "doc":
      return (
        <>
          {node.content?.map((child, i) =>
            nodeToReactEmail(child, testData, i, options)
          )}
        </>
      );

    case "paragraph": {
      // Handle text alignment
      const pAlignMap: Record<string, string> = {
        left: "text-left",
        center: "text-center",
        right: "text-right",
        justify: "text-justify",
      };
      const pAlign = node.attrs?.textAlign || "left";
      const pAlignClass = pAlignMap[pAlign] || "";
      return (
        <Text
          className={`my-4 text-inherit leading-relaxed ${pAlignClass}`.trim()}
          key={key}
        >
          {node.content?.map((child, i) =>
            nodeToReactEmail(child, testData, i, options)
          )}
        </Text>
      );
    }

    case "text": {
      const text = node.text || "";

      // Collect all mark styles
      if (node.marks && node.marks.length > 0) {
        const classes: string[] = [];
        const styles: Record<string, string> = {};
        let linkHref: string | null = null;

        for (const mark of node.marks) {
          switch (mark.type) {
            case "bold":
              classes.push("font-bold");
              break;
            case "italic":
              classes.push("italic");
              break;
            case "underline":
              classes.push("underline");
              break;
            case "strike":
              classes.push("line-through");
              break;
            case "link":
              linkHref = mark.attrs?.href as string;
              // Resolve {{variable}} placeholders in link hrefs (e.g. {{unsubscribeUrl}})
              if (linkHref && !options.keepVariablesAsPlaceholders) {
                linkHref = linkHref.replace(
                  /\{\{(\w+)(?:\|([^}]*))?\}\}/g,
                  (_match, name: string, fallback?: string) =>
                    resolveVariable(name, testData, fallback)
                );
              }
              classes.push("underline");
              break;
            case "highlight":
              if (mark.attrs?.color) {
                styles.backgroundColor = mark.attrs.color as string;
              }
              break;
            case "textStyle":
              if (mark.attrs?.color) {
                styles.color = mark.attrs.color as string;
              }
              if (mark.attrs?.fontSize) {
                styles.fontSize = mark.attrs.fontSize as string;
              }
              break;
          }
        }

        const className = classes.length > 0 ? classes.join(" ") : undefined;
        const style = Object.keys(styles).length > 0 ? styles : undefined;

        // Wrap in link if present
        if (linkHref) {
          return (
            <Link className={className} href={linkHref} key={key} style={style}>
              {text}
            </Link>
          );
        }

        // Otherwise wrap in span if we have styles
        if (className || style) {
          return (
            <span className={className} key={key} style={style}>
              {text}
            </span>
          );
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
      // Handle text alignment
      const hAlignMap: Record<string, string> = {
        left: "text-left",
        center: "text-center",
        right: "text-right",
        justify: "text-justify",
      };
      const hAlign = node.attrs?.textAlign || "left";
      const hAlignClass = hAlignMap[hAlign] || "";
      return (
        <Heading
          as={HeadingTag}
          className={`${headingClasses[HeadingTag]} ${hAlignClass}`.trim()}
          key={key}
        >
          {node.content?.map((child, i) =>
            nodeToReactEmail(child, testData, i, options)
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

      // Get button content from children or fall back to attrs.text
      const buttonContent =
        node.content && node.content.length > 0
          ? node.content.map((child, i) =>
              nodeToReactEmail(child, testData, i, options)
            )
          : node.attrs?.text || "Click here";

      // Get actual colors from attributes
      const bgColor = (node.attrs?.backgroundColor as string) || "#5046e5";
      const textColor = (node.attrs?.color as string) || "#ffffff";

      return (
        <div className={alignClass} key={key}>
          <Button
            className={`inline-block px-6 py-3 font-semibold no-underline ${roundedClass}`}
            href={node.attrs?.href || "#"}
            style={{ backgroundColor: bgColor, color: textColor }}
          >
            {buttonContent}
          </Button>
        </div>
      );
    }

    case "emailSection": {
      const sectionAttrs = node.attrs || {};
      const sectionStyle: React.CSSProperties = {
        backgroundColor: (sectionAttrs.backgroundColor as string) || "#ffffff",
        padding: (sectionAttrs.padding as string) || "32px 24px",
        borderRadius: (sectionAttrs.borderRadius as string) || "0px",
        maxWidth: (sectionAttrs.maxWidth as string) || "600px",
        margin: "0 auto",
      };

      return (
        <Section key={key} style={sectionStyle}>
          {node.content?.map((child, i) =>
            nodeToReactEmail(child, testData, i, options)
          )}
        </Section>
      );
    }

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
      const href = node.attrs?.href;
      const borderRadius = node.attrs?.borderRadius || "0px";
      const objectFit = node.attrs?.objectFit || "contain";

      const imgStyle: React.CSSProperties = {
        borderRadius: borderRadius !== "0px" ? borderRadius : undefined,
        objectFit: objectFit !== "contain" ? objectFit : undefined,
      };

      const imgElement = (
        <Img
          alt={node.attrs?.alt || "Image"}
          className="inline-block h-auto max-w-full"
          height={node.attrs?.height}
          src={imgSrc}
          style={imgStyle}
          width={node.attrs?.width}
        />
      );

      return (
        <div className={alignClass} key={key}>
          {href ? (
            <Link className="inline-block" href={href}>
              {imgElement}
            </Link>
          ) : (
            imgElement
          )}
        </div>
      );
    }

    case "emailDivider":
    case "horizontalRule":
      return (
        <Hr
          className="my-6 border-brand-secondary/30 dark:border-brand-dark-secondary/40"
          key={key}
        />
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

    case "emailIcon": {
      const icon = node.attrs?.icon || "check";
      const size = node.attrs?.size || 48;
      const iconColor = node.attrs?.iconColor || "#3b82f6";
      const bgColor = node.attrs?.backgroundColor || "#dbeafe";
      const align = node.attrs?.align || "left";

      // Map icon names to Icons8 icon names
      const iconNameMap: Record<string, string> = {
        check: "checkmark",
        star: "star",
        heart: "like",
        zap: "flash-on",
        shield: "shield",
        award: "prize",
        target: "goal",
        "trending-up": "graph",
        "thumbs-up": "thumb-up",
        gift: "gift",
        clock: "clock",
        lock: "lock",
        globe: "globe",
        sparkles: "sparkling",
        rocket: "rocket",
        lightbulb: "light-on",
      };

      const icons8Name = iconNameMap[icon] || "checkmark";
      // Remove # from color for Icons8 URL
      const colorHex = iconColor.replace("#", "");

      // Calculate icon size (icon is smaller than container to leave room for background)
      const iconImgSize = Math.round(size * 0.55);

      // Icons8 PNG URL with custom color
      const iconUrl = `https://img.icons8.com/ios-filled/${iconImgSize * 2}/${colorHex}/${icons8Name}.png`;

      // Use a table with fixed dimensions to ensure perfect circle
      // The width/height must be set as attributes AND in style for email client compatibility
      return (
        <table
          align={
            align === "center" ? "center" : align === "right" ? "right" : "left"
          }
          border={0}
          cellPadding={0}
          cellSpacing={0}
          key={key}
          role="presentation"
          style={{
            borderCollapse: "collapse",
            width: size,
            height: size,
          }}
          width={size}
        >
          <tbody>
            <tr>
              <td
                align="center"
                height={size}
                style={{
                  width: size,
                  height: size,
                  minWidth: size,
                  maxWidth: size,
                  backgroundColor: bgColor,
                  borderRadius: size / 2,
                  verticalAlign: "middle",
                }}
                valign="middle"
                width={size}
              >
                <Img
                  alt={icon}
                  height={iconImgSize}
                  src={iconUrl}
                  width={iconImgSize}
                />
              </td>
            </tr>
          </tbody>
        </table>
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
      const style = (node.attrs?.style as string) || "icons";

      const alignMap: Record<string, string> = {
        left: "text-left",
        center: "text-center",
        right: "text-right",
      };

      // Platform labels for text display
      const platformLabels: Record<string, string> = {
        twitter: "Twitter",
        linkedin: "LinkedIn",
        instagram: "Instagram",
        facebook: "Facebook",
        youtube: "YouTube",
        github: "GitHub",
      };

      // Map social platforms to Icons8 icon names
      const socialIconMap: Record<string, string> = {
        twitter: "twitterx",
        linkedin: "linkedin",
        instagram: "instagram",
        facebook: "facebook",
        youtube: "youtube",
        github: "github",
      };

      // Use Icons8 PNG CDN for social icons (using ios-glyphs style)
      const getIconUrl = (
        platform: string,
        color: string,
        size: number
      ): string => {
        const icons8Name = socialIconMap[platform] || platform.toLowerCase();
        const colorHex = color.replace("#", "");
        // Request 2x size for retina displays
        return `https://img.icons8.com/ios-glyphs/${size * 2}/${colorHex}/${icons8Name}.png`;
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
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              {(style === "icons" || style === "both") && (
                <Img
                  alt={platformLabels[link.platform] || link.platform}
                  height={iconSize}
                  src={getIconUrl(link.platform, iconColor, iconSize)}
                  style={{ display: "inline-block", verticalAlign: "middle" }}
                  width={iconSize}
                />
              )}
              {(style === "text" || style === "both") &&
                (platformLabels[link.platform] || link.platform)}
            </Link>
          ))}
        </div>
      );
    }

    case "variable": {
      const variableValue = resolveVariable(
        node.attrs?.name || "",
        testData,
        node.attrs?.fallback,
        options.keepVariablesAsPlaceholders
      );
      // Wrap in span to prevent React from adding comment markers around text nodes
      return (
        <span data-variable={node.attrs?.name} key={key}>
          {variableValue}
        </span>
      );
    }

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
              nodeToReactEmail(child, testData, i, options)
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
            nodeToReactEmail(child, testData, i, options)
          )}
        </ul>
      );

    case "orderedList":
      return (
        <ol className="my-4 list-decimal pl-5" key={key}>
          {node.content?.map((child, i) =>
            nodeToReactEmail(child, testData, i, options)
          )}
        </ol>
      );

    case "listItem":
      return (
        <li className="my-1" key={key}>
          {node.content?.map((child, i) =>
            nodeToReactEmail(child, testData, i, options)
          )}
        </li>
      );

    case "blockquote":
      return (
        <blockquote
          className="my-4 border-brand-secondary/30 border-l-4 pl-4 text-brand-text/80 italic dark:border-brand-dark-secondary/40 dark:text-brand-dark-text/80"
          key={key}
        >
          {node.content?.map((child, i) =>
            nodeToReactEmail(child, testData, i, options)
          )}
        </blockquote>
      );

    case "codeBlock":
      return (
        <pre
          className="overflow-auto rounded bg-brand-secondary/10 p-4 font-mono text-sm dark:bg-brand-dark-background"
          key={key}
        >
          <code>
            {node.content?.map((child, i) =>
              nodeToReactEmail(child, testData, i, options)
            )}
          </code>
        </pre>
      );

    case "emailRow": {
      const _rowAttrs = node.attrs || {};

      return (
        <Row key={key}>
          {node.content?.map((child, i) =>
            nodeToReactEmail(child, testData, i, options)
          )}
        </Row>
      );
    }

    case "emailColumn": {
      const colAttrs = node.attrs || {};
      const padding = (colAttrs.padding as string) || "0px";
      const colVerticalAlign = (colAttrs.verticalAlign as string) || "top";
      const colBgColor = (colAttrs.backgroundColor as string) || "transparent";

      // Map verticalAlign to style
      const verticalAlignStyle =
        colVerticalAlign === "middle"
          ? "middle"
          : colVerticalAlign === "bottom"
            ? "bottom"
            : "top";

      return (
        <Column
          key={key}
          style={{
            padding,
            verticalAlign: verticalAlignStyle,
            backgroundColor:
              colBgColor !== "transparent" ? colBgColor : undefined,
          }}
        >
          {node.content?.map((child, i) =>
            nodeToReactEmail(child, testData, i, options)
          )}
        </Column>
      );
    }

    default:
      // For unknown nodes, try to render children
      if (node.content) {
        return (
          <>
            {node.content.map((child, i) =>
              nodeToReactEmail(child, testData, i, options)
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
    darkMode: "class" as const, // Use class-based dark mode (disabled by default since we don't add 'dark' class)
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
  const emailContent = nodeToReactEmail(content, testData, 0, {
    keepVariablesAsPlaceholders: options.keepVariablesAsPlaceholders,
  });
  const tailwindConfig = createTailwindConfig(options.brandKit);

  // Use wrapper classNames from doc attrs if present (persisted from code editor),
  // otherwise fall back to brand-kit defaults
  const bodyClassName =
    (content.attrs?.bodyClassName as string) ||
    "bg-brand-background font-sans text-brand-text dark:bg-brand-dark-background dark:text-brand-dark-text";
  const containerClassName =
    (content.attrs?.containerClassName as string) ||
    "mx-auto max-w-[600px] bg-brand-background p-5 dark:bg-brand-dark-background";

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
        <Body className={bodyClassName}>
          <Container className={containerClassName}>{emailContent}</Container>
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
  // Prettify the HTML output for better readability.
  // The prettifier may fail on complex/nested HTML (e.g. nested <p> tags),
  // so fall back to the raw rendered HTML which is still valid for email clients.
  try {
    return await pretty(html);
  } catch {
    return html;
  }
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
 * Extract wrapper element classNames from React Email code.
 * Used to preserve Body/Container classNames across code editing round-trips.
 */
export function extractWrapperConfig(code: string): {
  bodyClassName?: string;
  containerClassName?: string;
} {
  const bodyMatch = code.match(/<Body\s+className="([^"]*)"/);
  const containerMatch = code.match(/<Container\s+className="([^"]*)"/);
  return {
    bodyClassName: bodyMatch?.[1],
    containerClassName: containerMatch?.[1],
  };
}

/**
 * Generates React Email code as a string from TipTap JSON content
 * Uses Tailwind CSS classes for styling, preserving actual attribute values
 */
export function generateReactEmailCode(
  content: JSONContent,
  indent = 0,
  options?: {
    previewText?: string;
    bodyClassName?: string;
    containerClassName?: string;
  }
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

      // Use provided previewText option, or fall back to preview nodes in content
      const previewText =
        options?.previewText ||
        previewNodes
          .map((p) => (p.attrs?.text as string) || "")
          .filter(Boolean)
          .join(" ");

      // Generate children (excluding preview)
      const children = otherNodes
        .map((c) => generateReactEmailCode(c, indent, options))
        .filter(Boolean)
        .join("\n");

      // Preview must be placed after Head but before Body in React Email
      const previewLine = previewText
        ? `\n        <Preview>${previewText}</Preview>`
        : "";

      // Read wrapper classNames from doc attrs first (persisted), then options, then defaults
      const bodyClass =
        (content.attrs?.bodyClassName as string) ||
        options?.bodyClassName ||
        "bg-gray-100 font-sans";
      const containerClass =
        (content.attrs?.containerClassName as string) ||
        options?.containerClassName ||
        "bg-white mx-auto p-[20px] max-w-[600px]";

      return `import { Html, Head, Body, Container, Text, Button, Section, Row, Column, Img, Hr, Heading, Link, Preview, Tailwind, pixelBasedPreset } from "@react-email/components";

export default function EmailTemplate() {
  return (
    <Html>
      <Tailwind config={{ presets: [pixelBasedPreset] }}>
        <Head />${previewLine}
        <Body className="${bodyClass}">
          <Container className="${containerClass}">
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
        .map((c) => generateReactEmailCode(c, 0, options))
        .join("");
      // Handle text alignment
      const pAlignMap: Record<string, string> = {
        left: "text-left",
        center: "text-center",
        right: "text-right",
        justify: "text-justify",
      };
      const pAlign = content.attrs?.textAlign || "left";
      const pAlignClass = pAlignMap[pAlign] || "";
      const pClasses = `my-4 leading-relaxed ${pAlignClass}`.trim();
      return `${spaces}          <Text className="${pClasses}">${pContent}</Text>`;
    }

    case "heading": {
      const level = content.attrs?.level || 1;
      const hContent = (content.content || [])
        .map((c) => generateReactEmailCode(c, 0, options))
        .join("");
      const headingClasses: Record<number, string> = {
        1: "text-3xl font-bold my-4",
        2: "text-2xl font-bold my-4",
        3: "text-xl font-semibold my-3",
        4: "text-lg font-semibold my-3",
        5: "text-base font-semibold my-2",
        6: "text-sm font-semibold my-2",
      };
      // Handle text alignment
      const hAlignMap: Record<string, string> = {
        left: "text-left",
        center: "text-center",
        right: "text-right",
        justify: "text-justify",
      };
      const hAlign = content.attrs?.textAlign || "left";
      const hAlignClass = hAlignMap[hAlign] || "";
      const hClasses =
        `${headingClasses[level] || headingClasses[1]} ${hAlignClass}`.trim();
      return `${spaces}          <Heading as="h${level}" className="${hClasses}">${hContent}</Heading>`;
    }

    case "text": {
      const text = content.text || "";
      const marks = content.marks as
        | Array<{ type: string; attrs?: Record<string, unknown> }>
        | undefined;

      if (!marks || marks.length === 0) {
        return text;
      }

      // Collect all mark styles
      const classes: string[] = [];
      const styles: string[] = [];
      let linkHref: string | null = null;

      for (const mark of marks) {
        switch (mark.type) {
          case "bold":
            classes.push("font-bold");
            break;
          case "italic":
            classes.push("italic");
            break;
          case "underline":
            classes.push("underline");
            break;
          case "strike":
            classes.push("line-through");
            break;
          case "link":
            linkHref = mark.attrs?.href as string;
            classes.push("underline");
            break;
          case "highlight":
            if (mark.attrs?.color) {
              styles.push(`backgroundColor: "${mark.attrs.color}"`);
            }
            break;
          case "textStyle":
            if (mark.attrs?.color) {
              styles.push(`color: "${mark.attrs.color}"`);
            }
            if (mark.attrs?.fontSize) {
              styles.push(`fontSize: "${mark.attrs.fontSize}"`);
            }
            break;
        }
      }

      const className = classes.length > 0 ? classes.join(" ") : "";
      const styleStr = styles.length > 0 ? `{{ ${styles.join(", ")} }}` : "";

      // Generate the appropriate wrapper
      if (linkHref) {
        const attrs = [
          `href="${linkHref}"`,
          className ? `className="${className}"` : "",
          styleStr ? `style=${styleStr}` : "",
        ]
          .filter(Boolean)
          .join(" ");
        return `<Link ${attrs}>${text}</Link>`;
      }

      if (className || styleStr) {
        const attrs = [
          className ? `className="${className}"` : "",
          styleStr ? `style=${styleStr}` : "",
        ]
          .filter(Boolean)
          .join(" ");
        return `<span ${attrs}>${text}</span>`;
      }

      return text;
    }

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
      const href = attrs.href as string | undefined;

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

      const borderRadius = (attrs.borderRadius as string) || "0px";
      const objectFit = (attrs.objectFit as string) || "contain";

      // Build style object for borderRadius and objectFit
      const styleProps = [];
      if (borderRadius !== "0px") {
        styleProps.push(`borderRadius: "${borderRadius}"`);
      }
      if (objectFit !== "contain") {
        styleProps.push(`objectFit: "${objectFit}"`);
      }
      const styleAttr =
        styleProps.length > 0
          ? `\n${spaces}              style={{ ${styleProps.join(", ")} }}`
          : "";

      const imgCode = `<Img
${spaces}              src="${attrs.src || ""}"
${spaces}              alt="${attrs.alt || ""}"
${spaces}              className="${dimensionClasses.trim()} max-w-full inline-block"${styleAttr}
${spaces}            />`;

      if (href) {
        return `${spaces}          <div className="${alignClass}">
${spaces}            <Link href="${href}" className="inline-block">
${spaces}              ${imgCode}
${spaces}            </Link>
${spaces}          </div>`;
      }

      return `${spaces}          <div className="${alignClass}">
${spaces}            ${imgCode}
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
      const rowChildren = (content.content || [])
        .map((c) => generateReactEmailCode(c, indent + 1))
        .filter(Boolean)
        .join("\n");

      return `${spaces}          <Row>
${rowChildren}
${spaces}          </Row>`;
    }

    case "emailColumn": {
      const attrs = content.attrs || {};
      const padding = (attrs.padding as string) || "0px";
      const verticalAlign = (attrs.verticalAlign as string) || "top";
      const bgColor = (attrs.backgroundColor as string) || "transparent";

      const colChildren = (content.content || [])
        .map((c) => generateReactEmailCode(c, indent + 1))
        .filter(Boolean)
        .join("\n");

      // Build style object
      const styleProps = [];
      if (padding !== "0px") {
        styleProps.push(`padding: "${padding}"`);
      }
      if (verticalAlign !== "top") {
        styleProps.push(`verticalAlign: "${verticalAlign}"`);
      }
      if (bgColor !== "transparent") {
        styleProps.push(`backgroundColor: "${bgColor}"`);
      }
      const styleAttr =
        styleProps.length > 0 ? ` style={{ ${styleProps.join(", ")} }}` : "";

      return `${spaces}            <Column${styleAttr}>
${colChildren}
${spaces}            </Column>`;
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

    case "emailIcon": {
      const attrs = content.attrs || {};
      const icon = (attrs.icon as string) || "check";
      const size = (attrs.size as number) || 48;
      const iconColor = (attrs.iconColor as string) || "#3b82f6";
      const bgColor = (attrs.backgroundColor as string) || "#dbeafe";
      const align = (attrs.align as string) || "left";

      // Map icon names to Icons8 icon names
      const iconNameMap: Record<string, string> = {
        check: "checkmark",
        star: "star",
        heart: "like",
        zap: "flash-on",
        shield: "shield",
        award: "prize",
        target: "goal",
        "trending-up": "graph",
        "thumbs-up": "thumb-up",
        gift: "gift",
        clock: "clock",
        lock: "lock",
        globe: "globe",
        sparkles: "sparkling",
        rocket: "rocket",
        lightbulb: "light-on",
      };

      const icons8Name = iconNameMap[icon] || "checkmark";
      const colorHex = iconColor.replace("#", "");
      const iconImgSize = Math.round(size * 0.55);
      const iconUrl = `https://img.icons8.com/ios-filled/${iconImgSize * 2}/${colorHex}/${icons8Name}.png`;
      const tableAlign =
        align === "center" ? "center" : align === "right" ? "right" : "left";

      return `${spaces}          <table
${spaces}            align="${tableAlign}"
${spaces}            border={0}
${spaces}            cellPadding={0}
${spaces}            cellSpacing={0}
${spaces}            role="presentation"
${spaces}            width={${size}}
${spaces}            style={{ borderCollapse: "collapse", width: ${size}, height: ${size} }}
${spaces}          >
${spaces}            <tbody>
${spaces}              <tr>
${spaces}                <td
${spaces}                  align="center"
${spaces}                  valign="middle"
${spaces}                  width={${size}}
${spaces}                  height={${size}}
${spaces}                  style={{
${spaces}                    width: ${size},
${spaces}                    height: ${size},
${spaces}                    minWidth: ${size},
${spaces}                    maxWidth: ${size},
${spaces}                    backgroundColor: "${bgColor}",
${spaces}                    borderRadius: ${size / 2},
${spaces}                    verticalAlign: "middle",
${spaces}                  }}
${spaces}                >
${spaces}                  <Img
${spaces}                    src="${iconUrl}"
${spaces}                    alt="${icon}"
${spaces}                    width={${iconImgSize}}
${spaces}                    height={${iconImgSize}}
${spaces}                  />
${spaces}                </td>
${spaces}              </tr>
${spaces}            </tbody>
${spaces}          </table>`;
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
      const style = (attrs.style as string) || "icons";

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

      // Map social platforms to Icons8 icon names
      const socialIconMap: Record<string, string> = {
        twitter: "twitterx",
        linkedin: "linkedin",
        instagram: "instagram",
        facebook: "facebook",
        youtube: "youtube",
        github: "github",
      };

      // Use Icons8 PNG CDN for social icons (using ios-glyphs style)
      const getIconUrl = (
        platform: string,
        color: string,
        size: number
      ): string => {
        const icons8Name = socialIconMap[platform] || platform.toLowerCase();
        const colorHex = color.replace("#", "");
        // Request 2x size for retina displays
        return `https://img.icons8.com/ios-glyphs/${size * 2}/${colorHex}/${icons8Name}.png`;
      };

      if (links.length === 0) {
        return `${spaces}          {/* Social Links - No links configured */}`;
      }

      const linkComponents = links
        .map((link, i) => {
          const label = platformLabels[link.platform] || link.platform;
          const marginRight = i < links.length - 1 ? iconSpacing : "0";
          const iconUrl = getIconUrl(link.platform, iconColor, iconSize);
          const showIcon = style === "icons" || style === "both";
          const showText = style === "text" || style === "both";

          return `${spaces}            <Link
${spaces}              href="${link.url || "#"}"
${spaces}              style={{
${spaces}                color: "${iconColor}",
${spaces}                fontSize: "${iconSize}px",
${spaces}                marginRight: "${marginRight}",
${spaces}                textDecoration: "none",
${spaces}                display: "inline-flex",
${spaces}                alignItems: "center",
${spaces}                gap: "4px",
${spaces}              }}
${spaces}            >
${showIcon ? `${spaces}              <Img src="${iconUrl}" width={${iconSize}} height={${iconSize}} alt="${label}" style={{ display: "inline-block", verticalAlign: "middle" }} />\n` : ""}${showText ? `${spaces}              ${label}\n` : ""}${spaces}            </Link>`;
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
