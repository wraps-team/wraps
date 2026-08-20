import type { PreferenceCenterTheme } from "@wraps/db";
import { COLOR_TOKENS, type ThemeToken } from "./tokens";

/**
 * Accent-derived theme ramp. The theme editor exposes exactly ONE color
 * control (the accent); everything else in the 24-token palette is derived
 * from it here, so a single pick produces a coherent, contrast-coherent
 * tinted-neutral theme instead of a colored button on an otherwise gray page.
 *
 * All color math below is pure (no DOM, no getComputedStyle) so this module
 * works in plain Vitest — unlike apps/web/src/lib/preference-theme/fonts.ts,
 * which calls next/font/google at module scope and only works inside a Next
 * build/test transform. contrast.ts is the DOM-based counterpart used by the
 * editor's contrast-check dialog; it is deliberately NOT imported here.
 */

type LC = { l: number; c: number };
type Mode = "light" | "dark";

const DEFAULT_RADIUS = "0.625rem";

/**
 * Fixed lightness + chroma per color token, per mode — seeded by converting
 * this repo's own apps/web/src/app/globals.css `:root` (lines 73-117) and
 * `.dark` (lines 119-162) OKLCH values to {l, c} pairs. Text-pane tokens
 * (foreground, *-foreground except semantic ones) keep globals.css's exact
 * (achromatic, c=0) values so body copy never picks up a color cast.
 * Surface tokens (background/card/popover/secondary/muted/accent/border/
 * input/ring) carry a deliberately tiny nonzero chroma (~0.004-0.012) not
 * present in globals.css today, so a picked accent tints them warmly rather
 * than leaving them neutral gray — see buildThemeFromAccent's zero-chroma
 * test for how close that stays to the app's current look.
 *
 * `primary`/`primary-foreground` entries are placeholders: buildThemeFromAccent
 * always overwrites them (accent itself, and an auto-contrast foreground), so
 * their l/c here is never actually emitted.
 *
 * `destructive`/`success`/`warning` keep globals.css's own lightness+chroma —
 * FIXED_HUES below overrides their hue so they stay red/green/amber
 * regardless of the accent.
 *
 * That coupling is load-bearing and easy to break: when globals.css retuned
 * light-mode success/warning as text colours to clear WCAG AA (they measured
 * 2.37:1 and 3.75:1 as text on the tinted badge ground), these copies had to
 * move with them or a customer's preference centre would keep rendering the
 * failing pair while the dashboard rendered the passing one. `contrast.test.ts`
 * pins both sides now — the light values here are deliberately at the edge of
 * two opposing limits, so change them only with those numbers in hand.
 */
export const NEUTRAL_RAMP: Record<
  Mode,
  Record<Exclude<ThemeToken, "radius">, LC>
> = {
  light: {
    background: { l: 1, c: 0.004 },
    foreground: { l: 0.145, c: 0 },
    card: { l: 1, c: 0.004 },
    "card-foreground": { l: 0.145, c: 0 },
    popover: { l: 1, c: 0.004 },
    "popover-foreground": { l: 0.145, c: 0 },
    primary: { l: 0.205, c: 0 },
    "primary-foreground": { l: 0.985, c: 0 },
    secondary: { l: 0.97, c: 0.012 },
    "secondary-foreground": { l: 0.205, c: 0 },
    muted: { l: 0.97, c: 0.012 },
    "muted-foreground": { l: 0.556, c: 0 },
    accent: { l: 0.97, c: 0.012 },
    "accent-foreground": { l: 0.205, c: 0 },
    destructive: { l: 0.577, c: 0.245 },
    "destructive-foreground": { l: 0.985, c: 0 },
    success: { l: 0.5, c: 0.15 },
    "success-foreground": { l: 0.985, c: 0 },
    warning: { l: 0.52, c: 0.125 },
    "warning-foreground": { l: 0.205, c: 0 },
    border: { l: 0.922, c: 0.006 },
    input: { l: 0.922, c: 0.006 },
    ring: { l: 0.708, c: 0.006 },
  },
  dark: {
    background: { l: 0.145, c: 0.004 },
    foreground: { l: 0.985, c: 0 },
    card: { l: 0.205, c: 0.004 },
    "card-foreground": { l: 0.985, c: 0 },
    popover: { l: 0.205, c: 0.004 },
    "popover-foreground": { l: 0.985, c: 0 },
    primary: { l: 0.922, c: 0 },
    "primary-foreground": { l: 0.205, c: 0 },
    secondary: { l: 0.269, c: 0.012 },
    "secondary-foreground": { l: 0.985, c: 0 },
    muted: { l: 0.269, c: 0.012 },
    "muted-foreground": { l: 0.708, c: 0 },
    accent: { l: 0.269, c: 0.012 },
    "accent-foreground": { l: 0.985, c: 0 },
    destructive: { l: 0.704, c: 0.191 },
    "destructive-foreground": { l: 0.985, c: 0 },
    success: { l: 0.65, c: 0.2 },
    "success-foreground": { l: 0.985, c: 0 },
    warning: { l: 0.8, c: 0.18 },
    "warning-foreground": { l: 0.205, c: 0 },
    // globals.css uses translucent white (oklch(1 0 0 / 10%) / 15%) here;
    // alpha isn't modeled by this token grammar's emitted values, so we take
    // the pre-alpha L (1) and add the same tiny surface chroma as the other
    // borders/inputs.
    border: { l: 1, c: 0.006 },
    input: { l: 1, c: 0.006 },
    ring: { l: 0.556, c: 0.006 },
  },
};

/** Semantic tokens keep their own hue regardless of the picked accent, per mode. */
const FIXED_HUES: Record<
  Mode,
  Partial<Record<Exclude<ThemeToken, "radius">, number>>
> = {
  light: { destructive: 27.325, success: 145, warning: 55 },
  dark: { destructive: 22.216, success: 145, warning: 55 },
};

// ─────────────────────────────────────────────────────────────────────────
// Pure OKLab/OKLCH color math (Björn Ottosson's reference formulas).
// ─────────────────────────────────────────────────────────────────────────

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function srgbToLinear(c: number): number {
  return c <= 0.040_45 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(c: number): number {
  const clamped = clamp01(c);
  return clamped <= 0.003_130_8
    ? clamped * 12.92
    : 1.055 * clamped ** (1 / 2.4) - 0.055;
}

function linearRgbToOklab(
  r: number,
  g: number,
  b: number
): [number, number, number] {
  const l = 0.412_221_470_8 * r + 0.536_332_536_3 * g + 0.051_445_992_9 * b;
  const m = 0.211_903_498_2 * r + 0.680_699_545_1 * g + 0.107_396_956_6 * b;
  const s = 0.088_302_461_9 * r + 0.281_718_837_6 * g + 0.629_978_700_5 * b;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return [
    0.210_454_255_3 * l_ + 0.793_617_785 * m_ - 0.004_072_046_8 * s_,
    1.977_998_495_1 * l_ - 2.428_592_205 * m_ + 0.450_593_709_9 * s_,
    0.025_904_037_1 * l_ + 0.782_771_766_2 * m_ - 0.808_675_766 * s_,
  ];
}

function oklabToLinearRgb(
  L: number,
  a: number,
  b: number
): [number, number, number] {
  const l_ = L + 0.396_337_777_4 * a + 0.215_803_757_3 * b;
  const m_ = L - 0.105_561_345_8 * a - 0.063_854_172_8 * b;
  const s_ = L - 0.089_484_177_5 * a - 1.291_485_548 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  return [
    4.076_741_662_1 * l - 3.307_711_591_3 * m + 0.230_969_929_2 * s,
    -1.268_438_004_6 * l + 2.609_757_401_1 * m - 0.341_319_396_5 * s,
    -0.004_196_086_3 * l - 0.703_418_614_7 * m + 1.707_614_701 * s,
  ];
}

function oklabToOklch(
  L: number,
  a: number,
  b: number
): { l: number; c: number; h: number } {
  const c = Math.sqrt(a * a + b * b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) {
    h += 360;
  }
  return { l: L, c, h };
}

function oklchToOklab(
  l: number,
  c: number,
  h: number
): [number, number, number] {
  const rad = (h * Math.PI) / 180;
  return [l, c * Math.cos(rad), c * Math.sin(rad)];
}

function hexToRgb01(hex: string): [number, number, number] | null {
  const normalized = hex.replace("#", "");
  let r: string;
  let g: string;
  let b: string;
  if (normalized.length === 3 || normalized.length === 4) {
    r = normalized[0] + normalized[0];
    g = normalized[1] + normalized[1];
    b = normalized[2] + normalized[2];
  } else if (normalized.length === 6 || normalized.length === 8) {
    r = normalized.slice(0, 2);
    g = normalized.slice(2, 4);
    b = normalized.slice(4, 6);
  } else {
    return null;
  }
  const rn = Number.parseInt(r, 16);
  const gn = Number.parseInt(g, 16);
  const bn = Number.parseInt(b, 16);
  if ([rn, gn, bn].some((n) => Number.isNaN(n))) {
    return null;
  }
  return [rn / 255, gn / 255, bn / 255];
}

function hslToRgb01(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let [r1, g1, b1] = [0, 0, 0];
  if (hp < 1) {
    [r1, g1, b1] = [c, x, 0];
  } else if (hp < 2) {
    [r1, g1, b1] = [x, c, 0];
  } else if (hp < 3) {
    [r1, g1, b1] = [0, c, x];
  } else if (hp < 4) {
    [r1, g1, b1] = [0, x, c];
  } else if (hp < 5) {
    [r1, g1, b1] = [x, 0, c];
  } else {
    [r1, g1, b1] = [c, 0, x];
  }
  const m = l - c / 2;
  return [r1 + m, g1 + m, b1 + m];
}

/** Parse a percentage-or-plain number token, e.g. "66.2%" -> 0.662, "0.5" -> 0.5. */
function parseNumberOrPercent(token: string, percentScale: number): number {
  if (token.endsWith("%")) {
    return (Number.parseFloat(token) / 100) * percentScale;
  }
  return Number.parseFloat(token);
}

/**
 * Resolve a CSS color value (anything passing isValidColorValue) to OKLCH.
 * Pure, no DOM — a small hand-written parser rather than the browser
 * getComputedStyle path contrast.ts uses, so ramp.ts stays testable in plain
 * Vitest. Returns null for values this parser doesn't recognize (transparent,
 * currentcolor, or a grammar edge case) rather than throwing.
 */
export function parseColorToOklch(
  value: string
): { l: number; c: number; h: number } | null {
  const trimmed = value.trim();

  const oklchMatch = trimmed.match(/^oklch\(\s*([^)]+)\)$/i);
  if (oklchMatch) {
    const parts = oklchMatch[1]
      .split("/")[0]
      .trim()
      .split(/[\s,]+/);
    if (parts.length < 3) {
      return null;
    }
    const l = parseNumberOrPercent(parts[0], 1);
    const c = Number.parseFloat(parts[1]);
    const h = Number.parseFloat(parts[2]);
    if ([l, c, h].some((n) => Number.isNaN(n))) {
      return null;
    }
    return { l, c, h };
  }

  const hexMatch = trimmed.match(/^#[0-9a-fA-F]{3,8}$/);
  if (hexMatch) {
    const rgb = hexToRgb01(trimmed);
    if (!rgb) {
      return null;
    }
    const linear = rgb.map(srgbToLinear) as [number, number, number];
    const [L, a, b] = linearRgbToOklab(...linear);
    return oklabToOklch(L, a, b);
  }

  const rgbMatch = trimmed.match(/^rgba?\(\s*([^)]+)\)$/i);
  if (rgbMatch) {
    const parts = rgbMatch[1]
      .split("/")[0]
      .trim()
      .split(/[\s,]+/);
    if (parts.length < 3) {
      return null;
    }
    const rgb = parts
      .slice(0, 3)
      .map((p) => parseNumberOrPercent(p, 255) / 255) as [
      number,
      number,
      number,
    ];
    if (rgb.some((n) => Number.isNaN(n))) {
      return null;
    }
    const linear = rgb.map((n) => srgbToLinear(clamp01(n))) as [
      number,
      number,
      number,
    ];
    const [L, a, b] = linearRgbToOklab(...linear);
    return oklabToOklch(L, a, b);
  }

  const hslMatch = trimmed.match(/^hsla?\(\s*([^)]+)\)$/i);
  if (hslMatch) {
    const parts = hslMatch[1]
      .split("/")[0]
      .trim()
      .split(/[\s,]+/);
    if (parts.length < 3) {
      return null;
    }
    const h = Number.parseFloat(parts[0]);
    const s = parseNumberOrPercent(parts[1], 1);
    const l = parseNumberOrPercent(parts[2], 1);
    if ([h, s, l].some((n) => Number.isNaN(n))) {
      return null;
    }
    const rgb = hslToRgb01(h, s, l);
    const linear = rgb.map((n) => srgbToLinear(clamp01(n))) as [
      number,
      number,
      number,
    ];
    const [L, a, b] = linearRgbToOklab(...linear);
    return oklabToOklch(L, a, b);
  }

  if (trimmed.toLowerCase() === "white") {
    return { l: 1, c: 0, h: 0 };
  }
  if (trimmed.toLowerCase() === "black") {
    return { l: 0, c: 0, h: 0 };
  }

  return null;
}

function relativeLuminance(l: number, c: number, h: number): number {
  const [L, a, b] = oklchToOklab(l, c, h);
  const [r, g, bl] = oklabToLinearRgb(L, a, b);
  return 0.2126 * clamp01(r) + 0.7152 * clamp01(g) + 0.0722 * clamp01(bl);
}

function contrastRatioOklch(
  fg: { l: number; c: number; h: number },
  bg: { l: number; c: number; h: number }
): number {
  const lFg = relativeLuminance(fg.l, fg.c, fg.h);
  const lBg = relativeLuminance(bg.l, bg.c, bg.h);
  const [hi, lo] = lFg >= lBg ? [lFg, lBg] : [lBg, lFg];
  return (hi + 0.05) / (lo + 0.05);
}

function formatOklch(l: number, c: number, h: number): string {
  const normalizedHue = ((h % 360) + 360) % 360;
  return `oklch(${round(l, 4)} ${round(c, 4)} ${round(normalizedHue, 2)})`;
}

function round(n: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}

const WHITE_FOREGROUND = "oklch(0.985 0 0)";
const BLACK_FOREGROUND = "oklch(0.205 0 0)";
const WHITE_OKLCH = { l: 0.985, c: 0, h: 0 };
const BLACK_OKLCH = { l: 0.205, c: 0, h: 0 };

function buildColorMap(
  mode: Mode,
  hue: number,
  baseRadius: string | undefined
): Record<string, string> {
  const ramp = NEUTRAL_RAMP[mode];
  const fixedHues = FIXED_HUES[mode];
  const out: Record<string, string> = {};
  for (const token of COLOR_TOKENS) {
    const { l, c } = ramp[token];
    const tokenHue = fixedHues[token] ?? hue;
    out[token] = formatOklch(l, c, tokenHue);
  }
  out.radius = baseRadius ?? DEFAULT_RADIUS;
  return out;
}

/**
 * Build a full 24-token theme from one accent color. `base` supplies the
 * fields the ramp never touches (radius per-mode if already set, fonts,
 * colorScheme) — everything else is derived here. `accent` may be any value
 * that passes isValidColorValue (hex, oklch(), hsl(), rgb()); if it can't be
 * resolved, `base` is returned unchanged rather than throwing.
 */
export function buildThemeFromAccent(
  accent: string,
  base: PreferenceCenterTheme
): PreferenceCenterTheme {
  const resolved = parseColorToOklch(accent);
  if (!resolved) {
    return base;
  }

  const light = buildColorMap("light", resolved.h, base.light.radius);
  const dark = buildColorMap("dark", resolved.h, base.dark.radius);

  // Overwrite primary with the accent's own literal value in BOTH modes —
  // mirrors resolve.ts's existing back-compat precedent (same brandColor for
  // light and dark), and keeps exactly what the user picked rather than a
  // ramp-derived approximation of it.
  light.primary = accent;
  dark.primary = accent;

  // Auto foreground: pick whichever of near-white/near-black gives higher
  // contrast against the resolved accent, so a light accent never silently
  // produces white-on-yellow buttons.
  const primaryForeground =
    contrastRatioOklch(WHITE_OKLCH, resolved) >=
    contrastRatioOklch(BLACK_OKLCH, resolved)
      ? WHITE_FOREGROUND
      : BLACK_FOREGROUND;
  light["primary-foreground"] = primaryForeground;
  dark["primary-foreground"] = primaryForeground;

  return {
    ...base,
    light,
    dark,
  };
}
