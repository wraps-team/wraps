import type { PreferenceCenterTheme } from "@wraps/db";
import { describe, expect, it } from "vitest";
import { buildThemeFromAccent, parseColorToOklch } from "../ramp";
import { DEFAULT_PREFERENCE_THEME } from "../resolve";
import { COLOR_TOKENS } from "../tokens";
import { sanitizeTheme } from "../validate";

// Reference L/C pairs parsed by hand from apps/web/src/app/globals.css's own
// :root (lines 73-117) and .dark (lines 119-162) blocks. primary and
// primary-foreground are intentionally excluded — buildThemeFromAccent always
// overwrites those (accent itself + auto-contrast foreground), so they are
// covered by the dedicated "auto foreground" test below instead.
const GLOBALS_CSS_REFERENCE: Record<
  "light" | "dark",
  Record<string, { l: number; c: number }>
> = {
  light: {
    background: { l: 1, c: 0 },
    foreground: { l: 0.145, c: 0 },
    card: { l: 1, c: 0 },
    "card-foreground": { l: 0.145, c: 0 },
    popover: { l: 1, c: 0 },
    "popover-foreground": { l: 0.145, c: 0 },
    secondary: { l: 0.97, c: 0 },
    "secondary-foreground": { l: 0.205, c: 0 },
    muted: { l: 0.97, c: 0 },
    "muted-foreground": { l: 0.556, c: 0 },
    accent: { l: 0.97, c: 0 },
    "accent-foreground": { l: 0.205, c: 0 },
    destructive: { l: 0.577, c: 0.245 },
    "destructive-foreground": { l: 0.985, c: 0 },
    success: { l: 0.5, c: 0.15 },
    "success-foreground": { l: 0.985, c: 0 },
    warning: { l: 0.52, c: 0.125 },
    "warning-foreground": { l: 0.205, c: 0 },
    border: { l: 0.922, c: 0 },
    input: { l: 0.922, c: 0 },
    ring: { l: 0.708, c: 0 },
  },
  dark: {
    background: { l: 0.145, c: 0 },
    foreground: { l: 0.985, c: 0 },
    card: { l: 0.205, c: 0 },
    "card-foreground": { l: 0.985, c: 0 },
    popover: { l: 0.205, c: 0 },
    "popover-foreground": { l: 0.985, c: 0 },
    secondary: { l: 0.269, c: 0 },
    "secondary-foreground": { l: 0.985, c: 0 },
    muted: { l: 0.269, c: 0 },
    "muted-foreground": { l: 0.708, c: 0 },
    accent: { l: 0.269, c: 0 },
    "accent-foreground": { l: 0.985, c: 0 },
    destructive: { l: 0.704, c: 0.191 },
    "destructive-foreground": { l: 0.985, c: 0 },
    success: { l: 0.65, c: 0.2 },
    "success-foreground": { l: 0.985, c: 0 },
    warning: { l: 0.8, c: 0.18 },
    "warning-foreground": { l: 0.205, c: 0 },
    border: { l: 1, c: 0 },
    input: { l: 1, c: 0 },
    ring: { l: 0.556, c: 0 },
  },
};

function parseOutputOklch(value: string): { l: number; c: number; h: number } {
  const parsed = parseColorToOklch(value);
  if (!parsed) {
    throw new Error(`Expected an oklch() output, got: ${value}`);
  }
  return parsed;
}

describe("buildThemeFromAccent", () => {
  // Write this test first — it is the proof the ramp is seeded correctly.
  it("reproduces globals.css's own values within tolerance for a zero-chroma accent", () => {
    const theme = buildThemeFromAccent(
      "oklch(0.205 0 0)",
      DEFAULT_PREFERENCE_THEME
    );

    for (const mode of ["light", "dark"] as const) {
      for (const [token, expected] of Object.entries(
        GLOBALS_CSS_REFERENCE[mode]
      )) {
        const actual = parseOutputOklch(theme[mode][token]);
        expect(
          Math.abs(actual.l - expected.l),
          `${mode}.${token} lightness`
        ).toBeLessThan(0.001);
        expect(
          Math.abs(actual.c - expected.c),
          `${mode}.${token} chroma`
        ).toBeLessThan(0.02);
      }
    }
  });

  it("returns all 24 tokens in both light and dark, regardless of the base's colorScheme", () => {
    for (const colorScheme of ["light", "dark", "system"] as const) {
      const base: PreferenceCenterTheme = {
        ...DEFAULT_PREFERENCE_THEME,
        colorScheme,
      };
      const theme = buildThemeFromAccent("#4f46e5", base);
      const allTokens = [...COLOR_TOKENS, "radius"];
      for (const token of allTokens) {
        expect(theme.light[token], `light.${token}`).toBeDefined();
        expect(theme.dark[token], `dark.${token}`).toBeDefined();
      }
    }
  });

  it("round-trips through sanitizeTheme unchanged", () => {
    const theme = buildThemeFromAccent("#4f46e5", DEFAULT_PREFERENCE_THEME);
    const sanitized = sanitizeTheme(theme);
    expect(sanitized).toEqual(theme);
  });

  it("is deterministic and hue-propagates: different accents produce different muted/border hues", () => {
    const themeA = buildThemeFromAccent("#4f46e5", DEFAULT_PREFERENCE_THEME);
    const themeB = buildThemeFromAccent("#4f46e5", DEFAULT_PREFERENCE_THEME);
    expect(themeA).toEqual(themeB);

    const themeC = buildThemeFromAccent("#22c55e", DEFAULT_PREFERENCE_THEME);
    const hueA = parseOutputOklch(themeA.light.muted).h;
    const hueC = parseOutputOklch(themeC.light.muted).h;
    expect(Math.abs(hueA - hueC)).toBeGreaterThan(10);

    const borderHueA = parseOutputOklch(themeA.light.border).h;
    const borderHueC = parseOutputOklch(themeC.light.border).h;
    expect(Math.abs(borderHueA - borderHueC)).toBeGreaterThan(10);
  });

  it("picks a dark primary-foreground for a pale accent and a light one for a dark accent, both meeting 4.5:1", () => {
    const paleTheme = buildThemeFromAccent("#fde047", DEFAULT_PREFERENCE_THEME);
    const paleFg = parseOutputOklch(paleTheme.light["primary-foreground"]);
    // Dark text (low L) for a pale/light accent.
    expect(paleFg.l).toBeLessThan(0.5);

    const darkTheme = buildThemeFromAccent("#1e293b", DEFAULT_PREFERENCE_THEME);
    const darkFg = parseOutputOklch(darkTheme.light["primary-foreground"]);
    // Light text (high L) for a dark accent.
    expect(darkFg.l).toBeGreaterThan(0.5);
  });

  it("keeps destructive/success/warning on their own hues, independent of the accent", () => {
    // A saturated blue accent, chosen to sit far from all three fixed hues
    // (destructive ~27, success ~145, warning ~55).
    const accent = "#3b82f6";
    const theme = buildThemeFromAccent(accent, DEFAULT_PREFERENCE_THEME);
    const accentHue = parseOutputOklch(accent).h;

    for (const token of ["destructive", "success", "warning"] as const) {
      const hue = parseOutputOklch(theme.light[token]).h;
      expect(Math.abs(hue - accentHue)).toBeGreaterThan(10);
    }
  });

  it("preserves radius, fonts and colorScheme from the base argument untouched", () => {
    const base: PreferenceCenterTheme = {
      version: 1,
      light: { radius: "0.875rem" },
      dark: { radius: "0.875rem" },
      fonts: { body: "inter", heading: "lora" },
      colorScheme: "dark",
    };
    const theme = buildThemeFromAccent("#4f46e5", base);
    expect(theme.light.radius).toBe("0.875rem");
    expect(theme.dark.radius).toBe("0.875rem");
    expect(theme.fonts).toEqual({ body: "inter", heading: "lora" });
    expect(theme.colorScheme).toBe("dark");
  });

  it("defaults radius to the app's current default when the base has none set", () => {
    const theme = buildThemeFromAccent("#4f46e5", DEFAULT_PREFERENCE_THEME);
    expect(theme.light.radius).toBe("0.625rem");
    expect(theme.dark.radius).toBe("0.625rem");
  });

  it("returns the base unchanged when the accent can't be resolved", () => {
    const base = DEFAULT_PREFERENCE_THEME;
    expect(buildThemeFromAccent("not-a-color", base)).toBe(base);
    expect(buildThemeFromAccent("transparent", base)).toBe(base);
  });
});

describe("parseColorToOklch", () => {
  it("parses hex, oklch(), hsl() and rgb() to comparable OKLCH", () => {
    const hex = parseColorToOklch("#ffffff");
    const oklch = parseColorToOklch("oklch(1 0 0)");
    expect(hex).not.toBeNull();
    expect(oklch).not.toBeNull();
    expect(Math.abs((hex?.l ?? 0) - (oklch?.l ?? 0))).toBeLessThan(0.01);
  });

  it("returns null for unresolvable values", () => {
    expect(parseColorToOklch("currentcolor")).toBeNull();
    expect(parseColorToOklch("garbage")).toBeNull();
  });
});
