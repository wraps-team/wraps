/**
 * Brand Kit Extractor
 *
 * Extracts brand identity elements from a website including:
 * - Logo (from favicon, apple-touch-icon, or og:image)
 * - Colors (from theme-color, CSS custom properties)
 * - Font family (from Google Fonts links or body styles)
 * - Company name (from og:site_name or title)
 */

import { isPrivateHost } from "@/lib/ssrf-guard";

export type ExtractedBrandKit = {
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  textColor: string;
  fontFamily: string;
  companyName: string | null;
  sourceDomain: string;
};

const DEFAULT_BRAND_KIT: Omit<ExtractedBrandKit, "sourceDomain"> = {
  logoUrl: null,
  primaryColor: "#5046e5",
  secondaryColor: "#6366f1",
  backgroundColor: "#ffffff",
  textColor: "#1f2937",
  fontFamily: "system-ui, sans-serif",
  companyName: null,
};

/**
 * Extract brand kit from a domain
 * This runs on the server side to avoid CORS issues
 */
export async function extractBrandKitFromDomain(
  domain: string
): Promise<ExtractedBrandKit> {
  // Normalize domain to URL
  const url = domain.startsWith("http") ? domain : `https://${domain}`;
  let normalizedDomain: string;

  try {
    const parsed = new URL(url);
    normalizedDomain = parsed.hostname;
    if (isPrivateHost(normalizedDomain)) {
      return { ...DEFAULT_BRAND_KIT, sourceDomain: domain };
    }
  } catch {
    return { ...DEFAULT_BRAND_KIT, sourceDomain: domain };
  }

  // Create abort controller with 5 second timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; WrapsBrandExtractor/1.0; +https://wraps.dev)",
        Accept: "text/html",
      },
      redirect: "manual",
      signal: controller.signal,
    });

    if (!response.ok) {
      return { ...DEFAULT_BRAND_KIT, sourceDomain: normalizedDomain };
    }

    // Limit response size to 500KB to prevent memory issues
    const contentLength = response.headers.get("content-length");
    if (contentLength && Number.parseInt(contentLength, 10) > 500_000) {
      return { ...DEFAULT_BRAND_KIT, sourceDomain: normalizedDomain };
    }

    const html = await response.text();

    // Try to fetch ONE external stylesheet for better color extraction
    let cssContent = "";
    if (!controller.signal.aborted) {
      cssContent = await fetchFirstStylesheet(html, url, controller.signal);
    }

    // Combine HTML and CSS for color extraction
    const combinedContent = `${html}\n${cssContent}`;

    // All extraction is synchronous from here - just parsing strings
    const logoUrl = extractLogo(html, url);
    const colors = extractColors(combinedContent);
    const fontFamily = extractFontFamily(html);
    const companyName = extractCompanyName(html);

    return {
      logoUrl,
      primaryColor: colors.primary,
      secondaryColor: colors.secondary,
      backgroundColor: colors.background,
      textColor: colors.text,
      fontFamily,
      companyName,
      sourceDomain: normalizedDomain,
    };
  } catch {
    return { ...DEFAULT_BRAND_KIT, sourceDomain: normalizedDomain };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetch the first stylesheet from the HTML
 * Very conservative - only fetches ONE file with strict limits
 */
async function fetchFirstStylesheet(
  html: string,
  baseUrl: string,
  signal: AbortSignal
): Promise<string> {
  if (signal.aborted) {
    return "";
  }

  try {
    // Find all stylesheet links
    const allLinks: string[] = [];
    const linkRegex =
      /<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi;
    for (const linkMatch of html.matchAll(linkRegex)) {
      allLinks.push(linkMatch[1]);
    }

    if (allLinks.length === 0) {
      return "";
    }

    const FONT_CDN_HOSTNAMES = new Set([
      "fonts.googleapis.com",
      "use.typekit.net",
    ]);

    // Find first non-font stylesheet, skipping private/internal hosts
    let targetUrl: string | null = null;
    for (const href of allLinks) {
      const absoluteUrl = new URL(href, baseUrl).href;
      const parsedAbsolute = new URL(absoluteUrl);
      if (
        FONT_CDN_HOSTNAMES.has(parsedAbsolute.hostname) ||
        isPrivateHost(parsedAbsolute.hostname)
      ) {
        continue;
      }
      targetUrl = absoluteUrl;
      break;
    }

    if (!targetUrl) {
      return "";
    }

    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; WrapsBrandExtractor/1.0; +https://wraps.dev)",
        Accept: "text/css",
      },
      signal,
    });

    if (!response.ok) {
      return "";
    }

    // Check content length - allow up to 300KB for bundled CSS
    const contentLength = response.headers.get("content-length");
    if (contentLength && Number.parseInt(contentLength, 10) > 300_000) {
      return "";
    }

    const css = await response.text();

    // For bundled CSS, :root is often at the end - search for it
    const rootMatch = css.match(/:root\s*\{([^}]+)\}/);
    if (rootMatch) {
      return rootMatch[1];
    }

    // Fallback to first 100KB
    return css.slice(0, 100_000);
  } catch {
    return "";
  }
}

/**
 * Extract logo URL from HTML (synchronous - no fetching)
 */
function extractLogo(html: string, baseUrl: string): string | null {
  const patterns = [
    /<link[^>]+rel=["']apple-touch-icon["'][^>]*href=["']([^"']+)["']/i,
    /<link[^>]+rel=["']icon["'][^>]*sizes=["'](?:192x192|180x180|152x152|144x144)["'][^>]*href=["']([^"']+)["']/i,
    /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["']/i,
    /<link[^>]+rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      try {
        return new URL(match[1], baseUrl).href;
      } catch {}
    }
  }

  return null;
}

/**
 * Extract colors from inline styles and meta tags (synchronous)
 */
function extractColors(html: string): {
  primary: string;
  secondary: string;
  background: string;
  text: string;
} {
  let primary: string | null = null;
  let secondary: string | null = null;
  let background: string | null = null;
  let text: string | null = null;

  // 1. Try theme-color meta tag (highest priority for primary)
  const themeColorMatch = html.match(
    /<meta[^>]+name=["']theme-color["'][^>]*content=["']([^"']+)["']/i
  );
  if (themeColorMatch?.[1]) {
    const normalized = normalizeColor(themeColorMatch[1]);
    if (normalized) {
      primary = normalized;
    }
  }

  // 2. Try msapplication-TileColor
  if (!primary) {
    const tileColorMatch = html.match(
      /<meta[^>]+name=["']msapplication-TileColor["'][^>]*content=["']([^"']+)["']/i
    );
    if (tileColorMatch?.[1]) {
      const normalized = normalizeColor(tileColorMatch[1]);
      if (normalized) {
        primary = normalized;
      }
    }
  }

  // 3. Try CSS custom properties - check multiple patterns from popular frameworks
  // Primary color patterns:
  // - shadcn/ui: --primary
  // - Bootstrap: --bs-primary
  // - Tailwind: --color-primary, --tw-color-primary
  // - Material: --md-sys-color-primary
  // - Generic: --brand, --accent, --theme
  const primaryPatterns = [
    /--primary(?:-color)?:\s*([^;}\n]+)/i,
    /--color-primary:\s*([^;}\n]+)/i,
    /--bs-primary:\s*([^;}\n]+)/i,
    /--tw-color-primary:\s*([^;}\n]+)/i,
    /--md-sys-color-primary:\s*([^;}\n]+)/i,
    /--brand(?:-color)?:\s*([^;}\n]+)/i,
    /--accent(?:-color)?:\s*([^;}\n]+)/i,
    /--theme(?:-color)?:\s*([^;}\n]+)/i,
    /--main(?:-color)?:\s*([^;}\n]+)/i,
  ];

  if (!primary) {
    for (const pattern of primaryPatterns) {
      const match = html.match(pattern);
      if (match?.[1]) {
        const normalized = normalizeColor(match[1].trim());
        // Accept the color even if neutral - some brands are monochrome
        if (normalized) {
          primary = normalized;
          break;
        }
      }
    }
  }

  // Secondary color patterns
  const secondaryPatterns = [
    /--secondary(?:-color)?:\s*([^;}\n]+)/i,
    /--color-secondary:\s*([^;}\n]+)/i,
    /--bs-secondary:\s*([^;}\n]+)/i,
    /--tw-color-secondary:\s*([^;}\n]+)/i,
    /--md-sys-color-secondary:\s*([^;}\n]+)/i,
    /--accent(?:-color)?:\s*([^;}\n]+)/i,
  ];

  for (const pattern of secondaryPatterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      const normalized = normalizeColor(match[1].trim());
      if (normalized && normalized !== primary) {
        secondary = normalized;
        break;
      }
    }
  }

  // Background color patterns
  const bgPatterns = [
    /--background(?:-color)?:\s*([^;}\n]+)/i,
    /--bg(?:-color)?:\s*([^;}\n]+)/i,
    /--color-background:\s*([^;}\n]+)/i,
    /--bs-body-bg:\s*([^;}\n]+)/i,
    /--md-sys-color-background:\s*([^;}\n]+)/i,
  ];

  for (const pattern of bgPatterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      const normalized = normalizeColor(match[1].trim());
      if (normalized) {
        background = normalized;
        break;
      }
    }
  }

  // Text/foreground color patterns
  const textPatterns = [
    /--foreground(?:-color)?:\s*([^;}\n]+)/i,
    /--text(?:-color)?:\s*([^;}\n]+)/i,
    /--color-text:\s*([^;}\n]+)/i,
    /--color-foreground:\s*([^;}\n]+)/i,
    /--bs-body-color:\s*([^;}\n]+)/i,
    /--md-sys-color-on-background:\s*([^;}\n]+)/i,
  ];

  for (const pattern of textPatterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      const normalized = normalizeColor(match[1].trim());
      if (normalized) {
        text = normalized;
        break;
      }
    }
  }

  const finalPrimary = primary || "#5046e5";
  const finalSecondary = secondary || adjustColor(finalPrimary, 15);

  return {
    primary: finalPrimary,
    secondary: finalSecondary,
    background: background || "#ffffff",
    text: text || "#1f2937",
  };
}

/**
 * Normalize any color format to hex
 */
export function normalizeColor(color: string): string | null {
  const trimmed = color.trim().toLowerCase();

  // Skip CSS variable references
  if (trimmed.startsWith("var(")) {
    return null;
  }

  // Already hex - ensure lowercase
  if (trimmed.startsWith("#")) {
    if (/^#[0-9a-f]{6}$/i.test(trimmed)) {
      return trimmed.toLowerCase();
    }
    if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
      return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`.toLowerCase();
    }
    return null;
  }

  // RGB/RGBA - comma-separated (legacy)
  const rgbMatch = trimmed.match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*[\d.]+)?\s*\)/
  );
  if (rgbMatch) {
    const r = Math.min(255, Number.parseInt(rgbMatch[1], 10));
    const g = Math.min(255, Number.parseInt(rgbMatch[2], 10));
    const b = Math.min(255, Number.parseInt(rgbMatch[3], 10));
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }

  // RGB/RGBA - space-separated (CSS Color Level 4)
  // Format: rgb(r g b) or rgb(r g b / a)
  const rgbModernMatch = trimmed.match(
    /rgba?\(\s*(\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*[\d.]+%?)?\s*\)/
  );
  if (rgbModernMatch) {
    const r = Math.min(255, Number.parseInt(rgbModernMatch[1], 10));
    const g = Math.min(255, Number.parseInt(rgbModernMatch[2], 10));
    const b = Math.min(255, Number.parseInt(rgbModernMatch[3], 10));
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }

  // HSL/HSLA - comma-separated (legacy)
  const hslMatch = trimmed.match(
    /hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%(?:\s*,\s*[\d.]+)?\s*\)/
  );
  if (hslMatch) {
    const h = Number.parseFloat(hslMatch[1]) / 360;
    const s = Number.parseFloat(hslMatch[2]) / 100;
    const l = Number.parseFloat(hslMatch[3]) / 100;
    return hslToHex(h, s, l);
  }

  // HSL/HSLA - space-separated (CSS Color Level 4)
  // Format: hsl(h s% l%) or hsl(h s% l% / a)
  const hslModernMatch = trimmed.match(
    /hsla?\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%(?:\s*\/\s*[\d.]+%?)?\s*\)/
  );
  if (hslModernMatch) {
    const h = Number.parseFloat(hslModernMatch[1]) / 360;
    const s = Number.parseFloat(hslModernMatch[2]) / 100;
    const l = Number.parseFloat(hslModernMatch[3]) / 100;
    return hslToHex(h, s, l);
  }

  // OKLCH - convert to hex (modern color format used by Tailwind v4, shadcn/ui)
  // Format: oklch(lightness% chroma hue) or oklch(lightness chroma hue)
  const oklchMatch = trimmed.match(
    /oklch\(\s*([\d.]+)%?\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*[\d.]+%?)?\s*\)/
  );
  if (oklchMatch) {
    const lRaw = Number.parseFloat(oklchMatch[1]);
    // If lightness > 1, it's a percentage; otherwise it's already normalized
    const l = lRaw > 1 ? lRaw / 100 : lRaw;
    const c = Number.parseFloat(oklchMatch[2]);
    const h = Number.parseFloat(oklchMatch[3]);
    return oklchToHex(l, c, h);
  }

  // OKLab - convert to hex
  // Format: oklab(lightness% a b) or oklab(lightness a b)
  const oklabMatch = trimmed.match(
    /oklab\(\s*([\d.]+)%?\s+([-\d.]+)\s+([-\d.]+)(?:\s*\/\s*[\d.]+%?)?\s*\)/
  );
  if (oklabMatch) {
    const lRaw = Number.parseFloat(oklabMatch[1]);
    const l = lRaw > 1 ? lRaw / 100 : lRaw;
    const a = Number.parseFloat(oklabMatch[2]);
    const b = Number.parseFloat(oklabMatch[3]);
    return oklabToHex(l, a, b);
  }

  // Named colors
  const namedColors: Record<string, string> = {
    red: "#ff0000",
    green: "#008000",
    blue: "#0000ff",
    yellow: "#ffff00",
    orange: "#ffa500",
    purple: "#800080",
    pink: "#ffc0cb",
    black: "#000000",
    white: "#ffffff",
  };

  return namedColors[trimmed] || null;
}

/**
 * Convert OKLab to hex (shared conversion logic)
 */
function oklabToHex(l: number, a: number, b: number): string {
  // Convert OKLab to linear sRGB via LMS
  const l_ = l + 0.396_337_777_4 * a + 0.215_803_757_3 * b;
  const m_ = l - 0.105_561_345_8 * a - 0.063_854_172_8 * b;
  const s_ = l - 0.089_484_177_5 * a - 1.291_485_548 * b;

  const l3 = l_ * l_ * l_;
  const m3 = m_ * m_ * m_;
  const s3 = s_ * s_ * s_;

  const rLinear =
    4.076_741_662_1 * l3 - 3.307_711_591_3 * m3 + 0.230_969_929_2 * s3;
  const gLinear =
    -1.268_438_004_6 * l3 + 2.609_757_401_1 * m3 - 0.341_319_396_5 * s3;
  const bLinear =
    -0.004_196_086_3 * l3 - 0.703_418_614_7 * m3 + 1.707_614_701 * s3;

  // Convert linear sRGB to sRGB (gamma correction)
  const toSrgb = (x: number) => {
    if (x <= 0) {
      return 0;
    }
    if (x >= 1) {
      return 255;
    }
    return Math.round(
      (x <= 0.003_130_8 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055) * 255
    );
  };

  const rInt = toSrgb(rLinear);
  const gInt = toSrgb(gLinear);
  const bInt = toSrgb(bLinear);

  return `#${rInt.toString(16).padStart(2, "0")}${gInt.toString(16).padStart(2, "0")}${bInt.toString(16).padStart(2, "0")}`;
}

/**
 * Convert OKLCH to hex
 * OKLCH is a perceptually uniform color space used by Tailwind v4, shadcn/ui
 */
function oklchToHex(l: number, c: number, h: number): string {
  // Convert OKLCH to OKLab (polar to rectangular)
  const hRad = (h * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);
  return oklabToHex(l, a, b);
}

/**
 * Convert HSL to hex
 */
function hslToHex(h: number, s: number, l: number): string {
  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, tInput: number) => {
      let t = tInput;
      if (t < 0) {
        t += 1;
      }
      if (t > 1) {
        t -= 1;
      }
      if (t < 1 / 6) {
        return p + (q - p) * 6 * t;
      }
      if (t < 1 / 2) {
        return q;
      }
      if (t < 2 / 3) {
        return p + (q - p) * (2 / 3 - t) * 6;
      }
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  const toHex = (x: number) =>
    Math.round(x * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Extract font family from Google Fonts or inline styles (synchronous)
 */
function extractFontFamily(html: string): string {
  // Look for Google Fonts link
  const googleFontMatch = html.match(
    /<link[^>]+href=["']https:\/\/fonts\.googleapis\.com\/css2?\?family=([^"'&]+)/i
  );
  if (googleFontMatch?.[1]) {
    const fontName = decodeURIComponent(googleFontMatch[1])
      .split(":")[0]
      .replace(/\+/g, " ");
    return `"${fontName}", sans-serif`;
  }

  // Try body font-family in inline style
  const bodyFontMatch = html.match(
    /(?:body|html)[^{]*\{[^}]*font-family:\s*([^;}"]+)/i
  );
  if (bodyFontMatch?.[1]) {
    const font = bodyFontMatch[1].trim();
    if (font && !font.startsWith("var(")) {
      return font;
    }
  }

  return "system-ui, -apple-system, sans-serif";
}

/**
 * Extract company name from meta tags or title (synchronous)
 */
function extractCompanyName(html: string): string | null {
  // Try og:site_name
  const ogMatch = html.match(
    /<meta[^>]+property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i
  );
  if (ogMatch?.[1]) {
    return ogMatch[1].trim();
  }

  // Try application-name
  const appMatch = html.match(
    /<meta[^>]+name=["']application-name["'][^>]*content=["']([^"']+)["']/i
  );
  if (appMatch?.[1]) {
    return appMatch[1].trim();
  }

  // Try title tag
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch?.[1]) {
    const title = titleMatch[1].trim();
    const separators = [" | ", " - ", " – ", " — "];
    for (const sep of separators) {
      if (title.includes(sep)) {
        const name = title.split(sep).pop()?.trim();
        if (name && name.length > 1 && name.length < 50) {
          return name;
        }
      }
    }
    if (title.length > 1 && title.length < 50) {
      return title;
    }
  }

  return null;
}

function adjustColor(hex: string, percent: number): string {
  const fullHex =
    hex.length === 4
      ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
      : hex;

  const num = Number.parseInt(fullHex.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);

  // biome-ignore lint/suspicious/noBitwiseOperators: Standard RGB color manipulation
  const R = Math.max(0, Math.min(255, (num >> 16) + amt));
  // biome-ignore lint/suspicious/noBitwiseOperators: Standard RGB color manipulation
  const G = Math.max(0, Math.min(255, ((num >> 8) & 0x00_ff) + amt));
  // biome-ignore lint/suspicious/noBitwiseOperators: Standard RGB color manipulation
  const B = Math.max(0, Math.min(255, (num & 0x00_00_ff) + amt));

  // biome-ignore lint/suspicious/noBitwiseOperators: Standard RGB color manipulation
  return `#${((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1)}`;
}
