import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import type {
  BinaryExpression,
  Expression,
  JSXAttribute,
  JSXElement,
  LogicalExpression,
  MemberExpression,
  ObjectExpression,
} from "@babel/types";
import type { JSONContent } from "@tiptap/core";

/**
 * Tailwind color palette mapping to hex values
 */
const tailwindColors: Record<string, Record<string, string>> = {
  slate: {
    50: "#f8fafc",
    100: "#f1f5f9",
    200: "#e2e8f0",
    300: "#cbd5e1",
    400: "#94a3b8",
    500: "#64748b",
    600: "#475569",
    700: "#334155",
    800: "#1e293b",
    900: "#0f172a",
    950: "#020617",
  },
  gray: {
    50: "#f9fafb",
    100: "#f3f4f6",
    200: "#e5e7eb",
    300: "#d1d5db",
    400: "#9ca3af",
    500: "#6b7280",
    600: "#4b5563",
    700: "#374151",
    800: "#1f2937",
    900: "#111827",
    950: "#030712",
  },
  zinc: {
    50: "#fafafa",
    100: "#f4f4f5",
    200: "#e4e4e7",
    300: "#d4d4d8",
    400: "#a1a1aa",
    500: "#71717a",
    600: "#52525b",
    700: "#3f3f46",
    800: "#27272a",
    900: "#18181b",
    950: "#09090b",
  },
  neutral: {
    50: "#fafafa",
    100: "#f5f5f5",
    200: "#e5e5e5",
    300: "#d4d4d4",
    400: "#a3a3a3",
    500: "#737373",
    600: "#525252",
    700: "#404040",
    800: "#262626",
    900: "#171717",
    950: "#0a0a0a",
  },
  stone: {
    50: "#fafaf9",
    100: "#f5f5f4",
    200: "#e7e5e4",
    300: "#d6d3d1",
    400: "#a8a29e",
    500: "#78716c",
    600: "#57534e",
    700: "#44403c",
    800: "#292524",
    900: "#1c1917",
    950: "#0c0a09",
  },
  red: {
    50: "#fef2f2",
    100: "#fee2e2",
    200: "#fecaca",
    300: "#fca5a5",
    400: "#f87171",
    500: "#ef4444",
    600: "#dc2626",
    700: "#b91c1c",
    800: "#991b1b",
    900: "#7f1d1d",
    950: "#450a0a",
  },
  orange: {
    50: "#fff7ed",
    100: "#ffedd5",
    200: "#fed7aa",
    300: "#fdba74",
    400: "#fb923c",
    500: "#f97316",
    600: "#ea580c",
    700: "#c2410c",
    800: "#9a3412",
    900: "#7c2d12",
    950: "#431407",
  },
  yellow: {
    50: "#fefce8",
    100: "#fef9c3",
    200: "#fef08a",
    300: "#fde047",
    400: "#facc15",
    500: "#eab308",
    600: "#ca8a04",
    700: "#a16207",
    800: "#854d0e",
    900: "#713f12",
    950: "#422006",
  },
  green: {
    50: "#f0fdf4",
    100: "#dcfce7",
    200: "#bbf7d0",
    300: "#86efac",
    400: "#4ade80",
    500: "#22c55e",
    600: "#16a34a",
    700: "#15803d",
    800: "#166534",
    900: "#14532d",
    950: "#052e16",
  },
  blue: {
    50: "#eff6ff",
    100: "#dbeafe",
    200: "#bfdbfe",
    300: "#93c5fd",
    400: "#60a5fa",
    500: "#3b82f6",
    600: "#2563eb",
    700: "#1d4ed8",
    800: "#1e40af",
    900: "#1e3a8a",
    950: "#172554",
  },
  indigo: {
    50: "#eef2ff",
    100: "#e0e7ff",
    200: "#c7d2fe",
    300: "#a5b4fc",
    400: "#818cf8",
    500: "#6366f1",
    600: "#4f46e5",
    700: "#4338ca",
    800: "#3730a3",
    900: "#312e81",
    950: "#1e1b4b",
  },
  purple: {
    50: "#faf5ff",
    100: "#f3e8ff",
    200: "#e9d5ff",
    300: "#d8b4fe",
    400: "#c084fc",
    500: "#a855f7",
    600: "#9333ea",
    700: "#7e22ce",
    800: "#6b21a8",
    900: "#581c87",
    950: "#3b0764",
  },
  pink: {
    50: "#fdf2f8",
    100: "#fce7f3",
    200: "#fbcfe8",
    300: "#f9a8d4",
    400: "#f472b6",
    500: "#ec4899",
    600: "#db2777",
    700: "#be185d",
    800: "#9d174d",
    900: "#831843",
    950: "#500724",
  },
  rose: {
    50: "#fff1f2",
    100: "#ffe4e6",
    200: "#fecdd3",
    300: "#fda4af",
    400: "#fb7185",
    500: "#f43f5e",
    600: "#e11d48",
    700: "#be123c",
    800: "#9f1239",
    900: "#881337",
    950: "#4c0519",
  },
  amber: {
    50: "#fffbeb",
    100: "#fef3c7",
    200: "#fde68a",
    300: "#fcd34d",
    400: "#fbbf24",
    500: "#f59e0b",
    600: "#d97706",
    700: "#b45309",
    800: "#92400e",
    900: "#78350f",
    950: "#451a03",
  },
  lime: {
    50: "#f7fee7",
    100: "#ecfccb",
    200: "#d9f99d",
    300: "#bef264",
    400: "#a3e635",
    500: "#84cc16",
    600: "#65a30d",
    700: "#4d7c0f",
    800: "#3f6212",
    900: "#365314",
    950: "#1a2e05",
  },
  emerald: {
    50: "#ecfdf5",
    100: "#d1fae5",
    200: "#a7f3d0",
    300: "#6ee7b7",
    400: "#34d399",
    500: "#10b981",
    600: "#059669",
    700: "#047857",
    800: "#065f46",
    900: "#064e3b",
    950: "#022c22",
  },
  teal: {
    50: "#f0fdfa",
    100: "#ccfbf1",
    200: "#99f6e4",
    300: "#5eead4",
    400: "#2dd4bf",
    500: "#14b8a6",
    600: "#0d9488",
    700: "#0f766e",
    800: "#115e59",
    900: "#134e4a",
    950: "#042f2e",
  },
  cyan: {
    50: "#ecfeff",
    100: "#cffafe",
    200: "#a5f3fc",
    300: "#67e8f9",
    400: "#22d3ee",
    500: "#06b6d4",
    600: "#0891b2",
    700: "#0e7490",
    800: "#155e75",
    900: "#164e63",
    950: "#083344",
  },
  sky: {
    50: "#f0f9ff",
    100: "#e0f2fe",
    200: "#bae6fd",
    300: "#7dd3fc",
    400: "#38bdf8",
    500: "#0ea5e9",
    600: "#0284c7",
    700: "#0369a1",
    800: "#075985",
    900: "#0c4a6e",
    950: "#082f49",
  },
  violet: {
    50: "#f5f3ff",
    100: "#ede9fe",
    200: "#ddd6fe",
    300: "#c4b5fd",
    400: "#a78bfa",
    500: "#8b5cf6",
    600: "#7c3aed",
    700: "#6d28d9",
    800: "#5b21b6",
    900: "#4c1d95",
    950: "#2e1065",
  },
  fuchsia: {
    50: "#fdf4ff",
    100: "#fae8ff",
    200: "#f5d0fe",
    300: "#f0abfc",
    400: "#e879f9",
    500: "#d946ef",
    600: "#c026d3",
    700: "#a21caf",
    800: "#86198f",
    900: "#701a75",
    950: "#4a044e",
  },
  white: { DEFAULT: "#ffffff" },
  black: { DEFAULT: "#000000" },
  transparent: { DEFAULT: "transparent" },
};

/**
 * Parse Tailwind CSS classes into a style-like object
 */
function parseTailwindClasses(className: string): Record<string, string> {
  const styles: Record<string, string> = {};
  const classes = className.split(/\s+/).filter(Boolean);

  for (const cls of classes) {
    // Background colors with bracket syntax: bg-[#hex] or bg-[rgb(...)]
    const bgBracketMatch = cls.match(/^bg-\[([^\]]+)\]$/);
    if (bgBracketMatch) {
      styles.backgroundColor = bgBracketMatch[1];
      continue;
    }

    // Background colors: bg-{color}-{shade}
    const bgMatch = cls.match(/^bg-(\w+)(?:-(\d+))?$/);
    if (bgMatch) {
      const [, color, shade] = bgMatch;
      const hex = getTailwindColor(color, shade || "DEFAULT");
      if (hex) {
        styles.backgroundColor = hex;
      }
      continue;
    }

    // Text colors with bracket syntax: text-[#hex] or text-[rgb(...)]
    const textBracketMatch = cls.match(/^text-\[([^\]]+)\]$/);
    if (textBracketMatch) {
      styles.color = textBracketMatch[1];
      continue;
    }

    // Text colors: text-{color}-{shade}
    const textColorMatch = cls.match(
      /^text-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-(\d+))?$/
    );
    if (textColorMatch) {
      const [, color, shade] = textColorMatch;
      const hex = getTailwindColor(color, shade || "DEFAULT");
      if (hex) {
        styles.color = hex;
      }
      continue;
    }

    // Font sizes with bracket syntax: text-[14px]
    const textSizeBracketMatch = cls.match(/^text-\[(\d+(?:px|rem|em))\]$/);
    if (textSizeBracketMatch) {
      styles.fontSize = textSizeBracketMatch[1];
      continue;
    }

    // Font sizes: text-{size}
    const textSizeMatch = cls.match(
      /^text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)$/
    );
    if (textSizeMatch) {
      const sizeMap: Record<string, string> = {
        xs: "12px",
        sm: "14px",
        base: "16px",
        lg: "18px",
        xl: "20px",
        "2xl": "24px",
        "3xl": "30px",
        "4xl": "36px",
        "5xl": "48px",
        "6xl": "60px",
        "7xl": "72px",
        "8xl": "96px",
        "9xl": "128px",
      };
      styles.fontSize = sizeMap[textSizeMatch[1]];
      continue;
    }

    // Padding: p-{n}, px-{n}, py-{n}
    const paddingMatch = cls.match(/^p([xy])?-(\d+(?:\.\d+)?|\[\d+px\])$/);
    if (paddingMatch) {
      const [, axis, value] = paddingMatch;
      const px = value.startsWith("[")
        ? value.slice(1, -1)
        : `${Number.parseFloat(value) * 4}px`;
      if (axis === "x") {
        styles.paddingLeft = px;
        styles.paddingRight = px;
      } else if (axis === "y") {
        styles.paddingTop = px;
        styles.paddingBottom = px;
      } else {
        styles.padding = px;
      }
      continue;
    }

    // Individual padding: pt-{n}, pr-{n}, pb-{n}, pl-{n}
    const individualPaddingMatch = cls.match(
      /^p([trbl])-(\d+(?:\.\d+)?|\[\d+px\])$/
    );
    if (individualPaddingMatch) {
      const [, side, value] = individualPaddingMatch;
      const px = value.startsWith("[")
        ? value.slice(1, -1)
        : `${Number.parseFloat(value) * 4}px`;
      const sideMap: Record<string, string> = {
        t: "paddingTop",
        r: "paddingRight",
        b: "paddingBottom",
        l: "paddingLeft",
      };
      styles[sideMap[side]] = px;
      continue;
    }

    // Margin: m-{n}, mx-{n}, my-{n}
    const marginMatch = cls.match(/^m([xy])?-(\d+(?:\.\d+)?|\[\d+px\])$/);
    if (marginMatch) {
      const [, axis, value] = marginMatch;
      const px = value.startsWith("[")
        ? value.slice(1, -1)
        : `${Number.parseFloat(value) * 4}px`;
      if (axis === "x") {
        styles.marginLeft = px;
        styles.marginRight = px;
      } else if (axis === "y") {
        styles.marginTop = px;
        styles.marginBottom = px;
      } else {
        styles.margin = px;
      }
      continue;
    }

    // Individual margin: mt-{n}, mr-{n}, mb-{n}, ml-{n}
    const individualMarginMatch = cls.match(
      /^m([trbl])-(\d+(?:\.\d+)?|\[\d+px\])$/
    );
    if (individualMarginMatch) {
      const [, side, value] = individualMarginMatch;
      const px = value.startsWith("[")
        ? value.slice(1, -1)
        : `${Number.parseFloat(value) * 4}px`;
      const sideMap: Record<string, string> = {
        t: "marginTop",
        r: "marginRight",
        b: "marginBottom",
        l: "marginLeft",
      };
      styles[sideMap[side]] = px;
      continue;
    }

    // Border radius with bracket syntax: rounded-[Npx]
    const roundedBracketMatch = cls.match(/^rounded-\[([^\]]+)\]$/);
    if (roundedBracketMatch) {
      styles.borderRadius = roundedBracketMatch[1];
      continue;
    }

    // Border radius
    const roundedMatch = cls.match(
      /^rounded(?:-(none|sm|md|lg|xl|2xl|3xl|full))?$/
    );
    if (roundedMatch) {
      const radiusMap: Record<string, string> = {
        none: "0px",
        sm: "2px",
        DEFAULT: "4px",
        md: "6px",
        lg: "8px",
        xl: "12px",
        "2xl": "16px",
        "3xl": "24px",
        full: "9999px",
      };
      styles.borderRadius = radiusMap[roundedMatch[1] || "DEFAULT"];
      continue;
    }

    // Font weight
    const fontWeightMatch = cls.match(
      /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/
    );
    if (fontWeightMatch) {
      const weightMap: Record<string, string> = {
        thin: "100",
        extralight: "200",
        light: "300",
        normal: "400",
        medium: "500",
        semibold: "600",
        bold: "700",
        extrabold: "800",
        black: "900",
      };
      styles.fontWeight = weightMap[fontWeightMatch[1]];
      continue;
    }

    // Text alignment
    if (cls === "text-left") {
      styles.textAlign = "left";
    } else if (cls === "text-center") {
      styles.textAlign = "center";
    } else if (cls === "text-right") {
      styles.textAlign = "right";
    }

    // Width with arbitrary values: w-[600px], w-full, etc.
    const widthMatch = cls.match(/^w-(\[.+\]|full|auto|\d+)$/);
    if (widthMatch) {
      const val = widthMatch[1];
      if (val.startsWith("[") && val.endsWith("]")) {
        styles.width = val.slice(1, -1);
      } else if (val === "full") {
        styles.width = "100%";
      } else if (val === "auto") {
        styles.width = "auto";
      } else {
        styles.width = `${Number.parseFloat(val) * 4}px`;
      }
      continue;
    }

    // Height with arbitrary values: h-[24px], h-auto, etc.
    const heightMatch = cls.match(/^h-(\[.+\]|full|auto|\d+)$/);
    if (heightMatch) {
      const val = heightMatch[1];
      if (val.startsWith("[") && val.endsWith("]")) {
        styles.height = val.slice(1, -1);
      } else if (val === "full") {
        styles.height = "100%";
      } else if (val === "auto") {
        styles.height = "auto";
      } else {
        styles.height = `${Number.parseFloat(val) * 4}px`;
      }
      continue;
    }

    // Max width: max-w-[600px]
    const maxWidthMatch = cls.match(/^max-w-(\[.+\])$/);
    if (maxWidthMatch) {
      styles.maxWidth = maxWidthMatch[1].slice(1, -1);
      continue;
    }

    // Gap with bracket syntax: gap-[Npx]
    const gapBracketMatch = cls.match(/^gap-\[([^\]]+)\]$/);
    if (gapBracketMatch) {
      styles.gap = gapBracketMatch[1];
      continue;
    }

    // Gap: gap-{n}
    const gapMatch = cls.match(/^gap-(\d+)$/);
    if (gapMatch) {
      styles.gap = `${Number.parseFloat(gapMatch[1]) * 4}px`;
      continue;
    }

    // Border color with bracket syntax: border-[#hex]
    const borderColorBracketMatch = cls.match(/^border-\[([^\]]+)\]$/);
    if (borderColorBracketMatch) {
      styles.borderColor = borderColorBracketMatch[1];
      continue;
    }

    // Border color
    const borderColorMatch = cls.match(/^border-(\w+)(?:-(\d+))?$/);
    if (
      borderColorMatch &&
      borderColorMatch[1] !== "t" &&
      borderColorMatch[1] !== "b" &&
      borderColorMatch[1] !== "l" &&
      borderColorMatch[1] !== "r" &&
      !/^\d+$/.test(borderColorMatch[1]) // Not a border width like border-2
    ) {
      const [, color, shade] = borderColorMatch;
      const hex = getTailwindColor(color, shade || "500");
      if (hex) {
        styles.borderColor = hex;
      }
      continue;
    }

    // Border width: border, border-0, border-2, border-4, border-8
    if (cls === "border") {
      styles.borderWidth = "1px";
      continue;
    }
    const borderWidthMatch = cls.match(/^border-(\d+)$/);
    if (borderWidthMatch) {
      styles.borderWidth = `${borderWidthMatch[1]}px`;
      continue;
    }

    // Line height: leading-{size}
    const lineHeightMatch = cls.match(
      /^leading-(none|tight|snug|normal|relaxed|loose|\d+|\[.+\])$/
    );
    if (lineHeightMatch) {
      const lineHeightMap: Record<string, string> = {
        none: "1",
        tight: "1.25",
        snug: "1.375",
        normal: "1.5",
        relaxed: "1.625",
        loose: "2",
      };
      const val = lineHeightMatch[1];
      if (val.startsWith("[") && val.endsWith("]")) {
        styles.lineHeight = val.slice(1, -1);
      } else if (lineHeightMap[val]) {
        styles.lineHeight = lineHeightMap[val];
      } else {
        // Numeric value like leading-6 = 1.5rem = 24px
        styles.lineHeight = `${Number.parseFloat(val) * 4}px`;
      }
      continue;
    }

    // Text decoration: underline, no-underline, line-through
    if (cls === "underline") {
      styles.textDecoration = "underline";
      continue;
    }
    if (cls === "no-underline") {
      styles.textDecoration = "none";
      continue;
    }
    if (cls === "line-through") {
      styles.textDecoration = "line-through";
      continue;
    }

    // Text transform: uppercase, lowercase, capitalize, normal-case
    if (cls === "uppercase") {
      styles.textTransform = "uppercase";
      continue;
    }
    if (cls === "lowercase") {
      styles.textTransform = "lowercase";
      continue;
    }
    if (cls === "capitalize") {
      styles.textTransform = "capitalize";
      continue;
    }
    if (cls === "normal-case") {
      styles.textTransform = "none";
      continue;
    }

    // Max width presets: max-w-xs, max-w-sm, max-w-md, etc.
    const maxWidthPresetMatch = cls.match(
      /^max-w-(xs|sm|md|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|full|min|max|fit|prose|screen-sm|screen-md|screen-lg|screen-xl|screen-2xl)$/
    );
    if (maxWidthPresetMatch) {
      const maxWidthMap: Record<string, string> = {
        xs: "320px",
        sm: "384px",
        md: "448px",
        lg: "512px",
        xl: "576px",
        "2xl": "672px",
        "3xl": "768px",
        "4xl": "896px",
        "5xl": "1024px",
        "6xl": "1152px",
        "7xl": "1280px",
        full: "100%",
        min: "min-content",
        max: "max-content",
        fit: "fit-content",
        prose: "65ch",
        "screen-sm": "640px",
        "screen-md": "768px",
        "screen-lg": "1024px",
        "screen-xl": "1280px",
        "screen-2xl": "1536px",
      };
      styles.maxWidth = maxWidthMap[maxWidthPresetMatch[1]];
      continue;
    }

    // Opacity: opacity-{value}
    const opacityMatch = cls.match(/^opacity-(\d+)$/);
    if (opacityMatch) {
      styles.opacity = String(Number.parseInt(opacityMatch[1], 10) / 100);
      continue;
    }

    // Letter spacing: tracking-{size}
    const letterSpacingMatch = cls.match(
      /^tracking-(tighter|tight|normal|wide|wider|widest)$/
    );
    if (letterSpacingMatch) {
      const letterSpacingMap: Record<string, string> = {
        tighter: "-0.05em",
        tight: "-0.025em",
        normal: "0em",
        wide: "0.025em",
        wider: "0.05em",
        widest: "0.1em",
      };
      styles.letterSpacing = letterSpacingMap[letterSpacingMatch[1]];
      continue;
    }

    // Display utilities
    if (cls === "block") {
      styles.display = "block";
      continue;
    }
    if (cls === "inline-block") {
      styles.display = "inline-block";
      continue;
    }
    if (cls === "inline") {
      styles.display = "inline";
      continue;
    }
    if (cls === "flex") {
      styles.display = "flex";
      continue;
    }
    if (cls === "hidden") {
      styles.display = "none";
      continue;
    }

    // Flex direction
    if (cls === "flex-row") {
      styles.flexDirection = "row";
      continue;
    }
    if (cls === "flex-col") {
      styles.flexDirection = "column";
      continue;
    }

    // Align items
    const alignItemsMatch = cls.match(
      /^items-(start|end|center|baseline|stretch)$/
    );
    if (alignItemsMatch) {
      const alignMap: Record<string, string> = {
        start: "flex-start",
        end: "flex-end",
        center: "center",
        baseline: "baseline",
        stretch: "stretch",
      };
      styles.alignItems = alignMap[alignItemsMatch[1]];
      continue;
    }

    // Justify content
    const justifyMatch = cls.match(
      /^justify-(start|end|center|between|around|evenly)$/
    );
    if (justifyMatch) {
      const justifyMap: Record<string, string> = {
        start: "flex-start",
        end: "flex-end",
        center: "center",
        between: "space-between",
        around: "space-around",
        evenly: "space-evenly",
      };
      styles.justifyContent = justifyMap[justifyMatch[1]];
      continue;
    }

    // Vertical align (useful for email)
    const verticalAlignMatch = cls.match(
      /^align-(baseline|top|middle|bottom|text-top|text-bottom)$/
    );
    if (verticalAlignMatch) {
      styles.verticalAlign = verticalAlignMatch[1];
    }
  }

  return styles;
}

/**
 * Get hex color from Tailwind color name and shade
 */
function getTailwindColor(color: string, shade: string): string | null {
  const colorPalette = tailwindColors[color];
  if (!colorPalette) {
    return null;
  }
  return colorPalette[shade] || colorPalette.DEFAULT || null;
}

/**
 * Merge inline styles with parsed Tailwind classes
 * Inline styles take precedence
 */
function mergeStyles(
  inlineStyle: Record<string, string>,
  tailwindStyle: Record<string, string>
): Record<string, string> {
  return { ...tailwindStyle, ...inlineStyle };
}

/**
 * Parse a conditional expression from JSX like {props.x === "y" && (<Content />)}
 * Returns the conditional node or null if not a conditional pattern
 */
function parseConditionalExpression(
  expr: LogicalExpression
): JSONContent | null {
  // Must be && operator
  if (expr.operator !== "&&") {
    return null;
  }

  const left = expr.left;
  const right = expr.right;

  let variable = "";
  let operator = "exists";
  let value = "";

  // Parse the left side (condition)
  if (left.type === "BinaryExpression") {
    // Pattern: props.variableName === "value"
    const binExpr = left as BinaryExpression;

    // Get variable name from left side of binary expression
    if (binExpr.left.type === "MemberExpression") {
      const memberExpr = binExpr.left as MemberExpression;
      if (
        memberExpr.object.type === "Identifier" &&
        memberExpr.object.name === "props" &&
        memberExpr.property.type === "Identifier"
      ) {
        variable = memberExpr.property.name;
      }
    }

    // Map JS operators to our operator types
    switch (binExpr.operator) {
      case "===":
      case "==":
        operator = "equals";
        break;
      case "!==":
      case "!=":
        operator = "notEquals";
        break;
      case ">":
        operator = "greaterThan";
        break;
      case "<":
        operator = "lessThan";
        break;
    }

    // Get comparison value
    if (binExpr.right.type === "StringLiteral") {
      value = binExpr.right.value;
    } else if (binExpr.right.type === "NumericLiteral") {
      value = String(binExpr.right.value);
    } else if (binExpr.right.type === "BooleanLiteral") {
      value = String(binExpr.right.value);
    }
  } else if (left.type === "MemberExpression") {
    // Pattern: props.variableName && ... (exists check)
    const memberExpr = left as MemberExpression;
    if (
      memberExpr.object.type === "Identifier" &&
      memberExpr.object.name === "props" &&
      memberExpr.property.type === "Identifier"
    ) {
      variable = memberExpr.property.name;
      operator = "exists";
    }
  } else if (left.type === "UnaryExpression" && left.operator === "!") {
    // Pattern: !props.variableName && ... (notExists check)
    const arg = left.argument;
    if (arg.type === "MemberExpression") {
      const memberExpr = arg as MemberExpression;
      if (
        memberExpr.object.type === "Identifier" &&
        memberExpr.object.name === "props" &&
        memberExpr.property.type === "Identifier"
      ) {
        variable = memberExpr.property.name;
        operator = "notExists";
      }
    }
  } else if (
    left.type === "CallExpression" &&
    left.callee.type === "MemberExpression"
  ) {
    // Pattern: props.variableName.includes("value") (contains check)
    const callee = left.callee as MemberExpression;
    if (
      callee.property.type === "Identifier" &&
      callee.property.name === "includes" &&
      callee.object.type === "MemberExpression"
    ) {
      const innerMember = callee.object as MemberExpression;
      if (
        innerMember.object.type === "Identifier" &&
        innerMember.object.name === "props" &&
        innerMember.property.type === "Identifier"
      ) {
        variable = innerMember.property.name;
        operator = "contains";
        // Get the argument to includes()
        if (left.arguments[0]?.type === "StringLiteral") {
          value = left.arguments[0].value;
        }
      }
    }
  }

  if (!variable) {
    return null;
  }

  // Parse the right side (content)
  const content: JSONContent[] = [];

  // The right side could be a JSXElement or wrapped in parentheses
  const contentExpr =
    right.type === "ParenthesizedExpression"
      ? (right as unknown as { expression: Expression }).expression
      : right;

  if (contentExpr.type === "JSXElement") {
    const parsed = parseJSXElement(contentExpr as unknown as JSXElement);
    if (parsed) {
      if (Array.isArray(parsed)) {
        content.push(...parsed);
      } else {
        content.push(parsed);
      }
    }
  } else if (contentExpr.type === "JSXFragment") {
    // Handle fragments - iterate through children
    const fragment = contentExpr as unknown as { children: unknown[] };
    for (const child of fragment.children) {
      if ((child as { type: string }).type === "JSXElement") {
        const parsed = parseJSXElement(child as JSXElement);
        if (parsed) {
          if (Array.isArray(parsed)) {
            content.push(...parsed);
          } else {
            content.push(parsed);
          }
        }
      }
    }
  }

  return {
    type: "conditional",
    attrs: {
      variable,
      operator,
      value,
    },
    content: content.length > 0 ? content : [{ type: "paragraph" }],
  };
}

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
        // 5. But NOT nested inside other JSX elements (except fragments)
        const parentType = path.parent.type;
        const isTopLevel =
          parentType === "Program" ||
          parentType === "ReturnStatement" ||
          parentType === "ExpressionStatement" ||
          parentType === "ArrowFunctionExpression" ||
          parentType === "BlockStatement" ||
          parentType === "JSXFragment" || // Children of fragments should be processed
          parentType === "JSXExpressionContainer"; // For expressions like {condition && <Element/>}

        // Skip if this element is a child of another JSX element (but not fragment)
        const isNestedJSX = parentType === "JSXElement";

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
      // Handle {variable} expressions and conditionals
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
      } else if (expr.type === "LogicalExpression") {
        // Handle conditional expressions like {props.x === "y" && (<Content />)}
        const conditional = parseConditionalExpression(
          expr as LogicalExpression
        );
        if (conditional) {
          children.push(conditional);
        }
      } else if (expr.type === "MemberExpression") {
        // Handle {props.variableName} expressions
        const memberExpr = expr as MemberExpression;
        if (
          memberExpr.object.type === "Identifier" &&
          memberExpr.object.name === "props" &&
          memberExpr.property.type === "Identifier"
        ) {
          children.push({
            type: "variable",
            attrs: {
              name: memberExpr.property.name,
              label: memberExpr.property.name,
              fallback: "",
              format: null,
            },
          });
        }
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

    // div - often used as wrapper for alignment, extract block children directly
    case "div": {
      const className = (props.className as string) || "";
      const inlineStyle = (props.style as Record<string, string>) || {};

      // Detect spacer pattern: <div className="w-full h-[Npx]" /> or style={{ height: "Npx" }}
      if (children.length === 0) {
        const tailwindStyle = parseTailwindClasses(className);
        const height = inlineStyle.height || tailwindStyle.height;

        if (
          height &&
          (className.includes("w-full") || tailwindStyle.width === "100%")
        ) {
          // Parse height value (e.g., "24px" -> 24)
          const heightMatch = height.match(/^(\d+)(?:px)?$/);
          const heightValue = heightMatch
            ? Number.parseInt(heightMatch[1], 10)
            : 24;

          return {
            type: "emailSpacer",
            attrs: {
              height: heightValue,
            },
          };
        }
        return null;
      }

      // Block-level node types that should not be wrapped in paragraphs
      const blockTypes = new Set([
        "emailButton",
        "emailSection",
        "emailRow",
        "emailColumn",
        "emailImage",
        "emailDivider",
        "emailSpacer",
        "heading",
        "paragraph",
        "bulletList",
        "orderedList",
        "blockquote",
      ]);

      // Separate block and inline children
      const blockChildren = children.filter(
        (child) => child.type && blockTypes.has(child.type)
      );
      const inlineChildren = children.filter(
        (child) => child.type === "text" || child.type === "variable"
      );

      // If we have block children, return them directly
      if (blockChildren.length > 0) {
        if (inlineChildren.length > 0) {
          return [
            ...blockChildren,
            { type: "paragraph", content: inlineChildren },
          ];
        }
        return blockChildren;
      }

      // Only inline content - wrap in paragraph
      if (inlineChildren.length > 0) {
        return {
          type: "paragraph",
          content: inlineChildren,
        };
      }
      return null;
    }

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

    // Preview text - convert to emailPreview node
    case "Preview":
      return createPreview(children);

    // Tailwind component - extract children
    case "Tailwind":
      return children;

    // Default - handle unknown components
    default: {
      if (children.length === 0) {
        return null;
      }

      // Block-level node types that should not be wrapped in paragraphs
      const blockTypes = new Set([
        "emailButton",
        "emailSection",
        "emailRow",
        "emailColumn",
        "emailImage",
        "emailDivider",
        "emailSpacer",
        "heading",
        "paragraph",
        "bulletList",
        "orderedList",
        "blockquote",
      ]);

      // Separate block and inline children
      const blockChildren = children.filter(
        (child) => child.type && blockTypes.has(child.type)
      );
      const inlineChildren = children.filter(
        (child) => child.type === "text" || child.type === "variable"
      );

      // If we have block children, return them directly
      if (blockChildren.length > 0) {
        // If there are also inline children, wrap those in a paragraph
        if (inlineChildren.length > 0) {
          return [
            ...blockChildren,
            { type: "paragraph", content: inlineChildren },
          ];
        }
        return blockChildren;
      }

      // Only inline content - wrap in paragraph
      if (inlineChildren.length > 0) {
        return {
          type: "paragraph",
          content: inlineChildren,
        };
      }

      return null;
    }
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
  const inlineStyle = (props.style as Record<string, string>) || {};
  const tailwindStyle = props.className
    ? parseTailwindClasses(props.className as string)
    : {};
  const style = mergeStyles(inlineStyle, tailwindStyle);

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
  const inlineStyle = (props.style as Record<string, string>) || {};
  const tailwindStyle = props.className
    ? parseTailwindClasses(props.className as string)
    : {};
  const style = mergeStyles(inlineStyle, tailwindStyle);

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
  const inlineStyle = (props.style as Record<string, string>) || {};
  const tailwindStyle = props.className
    ? parseTailwindClasses(props.className as string)
    : {};
  const style = mergeStyles(inlineStyle, tailwindStyle);

  return {
    type: "emailColumn",
    attrs: {
      width: style.width || (props.width as string) || "auto",
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
  const inlineStyle = (props.style as Record<string, string>) || {};
  const tailwindStyle = props.className
    ? parseTailwindClasses(props.className as string)
    : {};
  const style = mergeStyles(inlineStyle, tailwindStyle);

  // Extract button text string from children
  const buttonText =
    children
      .filter((c): c is JSONContent & { text: string } => c.type === "text")
      .map((c) => c.text)
      .join("") || "Click here";

  // Compute padding from individual values if not set directly
  let padding = style.padding;
  if (!padding && (style.paddingLeft || style.paddingTop)) {
    const py = style.paddingTop || style.paddingBottom || "12px";
    const px = style.paddingLeft || style.paddingRight || "24px";
    padding = `${py} ${px}`;
  }

  return {
    type: "emailButton",
    attrs: {
      href: (props.href as string) || "#",
      backgroundColor: style.backgroundColor || style.background || "#5046e5",
      color: style.color || "#ffffff",
      padding: padding || "12px 24px",
      borderRadius: style.borderRadius || "6px",
      fontSize: style.fontSize || "16px",
      fontWeight: style.fontWeight || "600",
      align: (style.textAlign as "left" | "center" | "right") || "left",
    },
    content: [{ type: "text", text: buttonText }],
  };
}

function createText(
  props: Record<string, unknown>,
  children: JSONContent[]
): JSONContent {
  const tailwindStyle = props.className
    ? parseTailwindClasses(props.className as string)
    : {};

  // Apply text marks based on styles
  const processedChildren = children.map((child) => {
    if (child.type === "text" && child.text) {
      const marks: Array<{ type: string; attrs?: Record<string, unknown> }> =
        [];

      if (
        tailwindStyle.fontWeight === "700" ||
        tailwindStyle.fontWeight === "800" ||
        tailwindStyle.fontWeight === "900"
      ) {
        marks.push({ type: "bold" });
      }

      if (marks.length > 0) {
        return { ...child, marks };
      }
    }
    return child;
  });

  return {
    type: "paragraph",
    content: processedChildren.length > 0 ? processedChildren : undefined,
  };
}

function createHeading(
  props: Record<string, unknown>,
  children: JSONContent[]
): JSONContent {
  const as = props.as as string;
  const tailwindStyle = props.className
    ? parseTailwindClasses(props.className as string)
    : {};

  let level = 2;

  if (as?.match(/^h[1-6]$/)) {
    level = Number.parseInt(as[1], 10);
  } else if (tailwindStyle.fontSize) {
    // Infer heading level from font size
    const fontSize = tailwindStyle.fontSize;
    if (fontSize === "30px" || fontSize === "36px") {
      level = 1;
    } else if (fontSize === "24px") {
      level = 2;
    } else if (fontSize === "20px") {
      level = 3;
    } else if (fontSize === "18px") {
      level = 4;
    }
  }

  return {
    type: "heading",
    attrs: { level },
    content:
      children.length > 0 ? children : [{ type: "text", text: "Heading" }],
  };
}

function createImage(props: Record<string, unknown>): JSONContent {
  const tailwindStyle = props.className
    ? parseTailwindClasses(props.className as string)
    : {};

  return {
    type: "emailImage",
    attrs: {
      src: (props.src as string) || "",
      alt: (props.alt as string) || "",
      width:
        tailwindStyle.width ||
        tailwindStyle.maxWidth ||
        (props.width as string) ||
        "100%",
      height: tailwindStyle.height || (props.height as string) || "auto",
    },
  };
}

function createDivider(props: Record<string, unknown>): JSONContent {
  const inlineStyle = (props.style as Record<string, string>) || {};
  const tailwindStyle = props.className
    ? parseTailwindClasses(props.className as string)
    : {};
  const style = mergeStyles(inlineStyle, tailwindStyle);

  return {
    type: "emailDivider",
    attrs: {
      color: style.borderColor || "#e5e7eb",
      thickness: style.borderWidth || "1px",
      margin: style.margin || style.marginTop || "24px",
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

function createPreview(children: JSONContent[]): JSONContent {
  // Extract text content from children
  const previewText = children
    .filter((c): c is JSONContent & { text: string } => c.type === "text")
    .map((c) => c.text)
    .join("");

  return {
    type: "emailPreview",
    attrs: {
      text: previewText || "Preview text",
    },
  };
}
