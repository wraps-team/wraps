import type { JSONContent } from "@tiptap/core";
import { PLACEHOLDER_IMAGES } from "./placeholders";

/**
 * Brand kit values that can be applied to content
 */
export type BrandKitValues = {
  primaryColor?: string | null;
  secondaryColor?: string | null;
  backgroundColor?: string | null;
  textColor?: string | null;
  fontFamily?: string | null;
  headingFontFamily?: string | null;
  buttonStyle?: string | null;
  buttonRadius?: string | null;
  companyName?: string | null;
  logoUrl?: string | null;
  socialLinks?: Array<{ platform: string; url: string }> | null;
};

/**
 * Default colors used in block examples that should be replaced
 */
const DEFAULT_COLORS = {
  primary: "#5046e5",
  secondary: "#6366f1",
  background: "#ffffff",
  text: "#1f2937",
  textMuted: "#6b7280",
  textLight: "#9ca3af",
};

/**
 * Recursively applies brand kit values to TipTap JSON content.
 * Replaces default colors with brand kit colors and substitutes
 * variables like {{logoUrl}} and {{companyName}} with actual values.
 */
export function applyBrandKitToContent(
  content: JSONContent,
  brandKit: BrandKitValues
): JSONContent {
  // Deep clone to avoid mutating original
  const result = JSON.parse(JSON.stringify(content)) as JSONContent;
  return transformNode(result, brandKit);
}

function transformNode(
  node: JSONContent,
  brandKit: BrandKitValues
): JSONContent {
  // Transform attributes
  if (node.attrs) {
    node.attrs = transformAttributes(node.attrs, brandKit, node.type);
  }

  // Transform marks (for text styling)
  if (node.marks) {
    node.marks = node.marks.map((mark) => transformMark(mark, brandKit));
  }

  // Transform text content (replace variables)
  if (node.type === "text" && typeof node.text === "string") {
    node.text = replaceVariables(node.text, brandKit);
  }

  // Recursively transform children
  if (node.content) {
    node.content = node.content.map((child) => transformNode(child, brandKit));
  }

  return node;
}

function transformAttributes(
  attrs: Record<string, unknown>,
  brandKit: BrandKitValues,
  nodeType?: string
): Record<string, unknown> {
  const result = { ...attrs };

  // Color attributes
  const colorAttrs = [
    "backgroundColor",
    "color",
    "textColor",
    "iconColor",
    "borderColor",
  ];

  for (const attr of colorAttrs) {
    if (typeof result[attr] === "string") {
      result[attr] = transformColor(result[attr] as string, brandKit);
    }
  }

  // Button-specific transformations
  if (nodeType === "emailButton") {
    // Apply button radius from brand kit
    if (brandKit.buttonRadius && !result.borderRadius) {
      result.borderRadius = brandKit.buttonRadius;
    } else if (
      brandKit.buttonStyle &&
      typeof result.borderRadius === "string"
    ) {
      // Apply button style (rounded, square, pill)
      const radiusMap: Record<string, string> = {
        square: "0px",
        rounded: brandKit.buttonRadius || "4px",
        pill: "9999px",
      };
      if (radiusMap[brandKit.buttonStyle]) {
        result.borderRadius = radiusMap[brandKit.buttonStyle];
      }
    }
  }

  // Replace variable placeholders in string attributes
  for (const [key, value] of Object.entries(result)) {
    if (typeof value === "string") {
      result[key] = replaceVariables(value, brandKit);
    }
  }

  return result;
}

function transformMark(
  mark: { type: string; attrs?: Record<string, unknown> },
  brandKit: BrandKitValues
): { type: string; attrs?: Record<string, unknown> } {
  if (!mark.attrs) return mark;

  const result = { ...mark, attrs: { ...mark.attrs } };

  // Transform textStyle color
  if (mark.type === "textStyle" && typeof result.attrs.color === "string") {
    result.attrs.color = transformColor(result.attrs.color, brandKit);
  }

  return result;
}

function transformColor(color: string, brandKit: BrandKitValues): string {
  const colorLower = color.toLowerCase();

  // Map default colors to brand kit colors
  if (colorLower === DEFAULT_COLORS.primary && brandKit.primaryColor) {
    return brandKit.primaryColor;
  }
  if (colorLower === DEFAULT_COLORS.secondary && brandKit.secondaryColor) {
    return brandKit.secondaryColor;
  }
  if (colorLower === DEFAULT_COLORS.background && brandKit.backgroundColor) {
    return brandKit.backgroundColor;
  }
  if (colorLower === DEFAULT_COLORS.text && brandKit.textColor) {
    return brandKit.textColor;
  }

  // Also handle common muted text colors - map to a lighter version of text color
  // For now, keep muted colors as-is since they're design-specific

  return color;
}

function replaceVariables(text: string, brandKit: BrandKitValues): string {
  let result = text;

  // Replace common variables with brand kit values (or placeholders)
  result = result.replace(
    /\{\{logoUrl\}\}/g,
    brandKit.logoUrl || PLACEHOLDER_IMAGES.logo
  );

  if (brandKit.companyName) {
    result = result.replace(/\{\{companyName\}\}/g, brandKit.companyName);
  } else {
    // Replace with generic company name placeholder
    result = result.replace(/\{\{companyName\}\}/g, "Your Company");
  }

  return result;
}

/**
 * Creates a brand kit values object from a database brand kit record
 */
export function brandKitToValues(
  brandKit: {
    primaryColor?: string | null;
    secondaryColor?: string | null;
    backgroundColor?: string | null;
    textColor?: string | null;
    fontFamily?: string | null;
    headingFontFamily?: string | null;
    buttonStyle?: string | null;
    buttonRadius?: string | null;
    companyName?: string | null;
    logoUrl?: string | null;
    socialLinks?: Array<{ platform: string; url: string }> | null;
  } | null
): BrandKitValues | null {
  if (!brandKit) return null;
  return brandKit;
}
