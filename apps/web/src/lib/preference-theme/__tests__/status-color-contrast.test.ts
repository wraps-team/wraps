import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NEUTRAL_RAMP } from "../ramp";

/**
 * Guards the light-mode status colours, which sit at the edge of two opposing
 * limits and were retuned to clear WCAG AA (audit H5: `--warning` measured
 * 2.37:1 and `--success` 3.77:1 as text, where 1.4.3 requires 4.5:1).
 *
 * Three things can silently undo that, and each has a case below:
 *
 * 1. The binding ground is not the card, it is the tinted badge — the same
 *    hue at 15% over the card, which is always darker than the card and so
 *    always the worse of the two. Measuring against plain white passes ~1.1
 *    points earlier than reality and is how these values came to fail in the
 *    first place.
 * 2. Darkening `--warning` far enough to be comfortable as text pushes the
 *    near-black `--warning-foreground` on a solid `bg-warning` chip under the
 *    3:1 that 1.4.11 asks of non-text. It is pinned from both sides.
 * 3. `NEUTRAL_RAMP` in ramp.ts is a second, hand-maintained copy of these
 *    values for customer-authored preference centres. When globals.css moved
 *    and this copy didn't, the dashboard rendered the passing pair while a
 *    customer's public preference centre kept rendering the failing one.
 *
 * The maths is done here rather than through `contrast.ts`, which resolves
 * colours through the browser (canvas + getComputedStyle) and cannot answer
 * for an `oklch()` string under jsdom.
 */

const GLOBALS_CSS = join(__dirname, "../../../app/globals.css");

/** The `:root` block only — `.dark` is a separate, already-passing set. */
function lightThemeBlock(): string {
  const css = readFileSync(GLOBALS_CSS, "utf8");
  const start = css.indexOf(":root {");
  const end = css.indexOf(".dark {", start);
  expect(start, "globals.css has no :root block").toBeGreaterThan(-1);
  expect(end, "globals.css has no .dark block").toBeGreaterThan(start);
  return css.slice(start, end);
}

type Oklch = { l: number; c: number; h: number };

function readToken(block: string, name: string): Oklch {
  const match = block.match(
    new RegExp(`--${name}:\\s*oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\)`)
  );
  expect(match, `--${name} not found as a plain oklch() triple`).not.toBeNull();
  const [, l, c, h] = match as RegExpMatchArray;
  return { l: Number(l), c: Number(c), h: Number(h) };
}

type Rgb = [number, number, number];

/** oklch -> linear srgb -> gamma-encoded srgb, per the CSS Color 4 matrices. */
function oklchToRgb({ l: L, c: C, h: H }: Oklch): Rgb {
  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);

  const lCube = (L + 0.396_337_777_4 * a + 0.215_803_757_3 * b) ** 3;
  const mCube = (L - 0.105_561_345_8 * a - 0.063_854_172_8 * b) ** 3;
  const sCube = (L - 0.089_484_177_5 * a - 1.291_485_548 * b) ** 3;

  const encode = (v: number) =>
    v <= 0.003_130_8 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;

  return [
    encode(
      4.076_741_662_1 * lCube -
        3.307_711_591_3 * mCube +
        0.230_969_929_2 * sCube
    ),
    encode(
      -1.268_438_004_6 * lCube +
        2.609_757_401_1 * mCube -
        0.341_319_396_5 * sCube
    ),
    encode(
      -0.004_196_086_3 * lCube - 0.703_418_614_7 * mCube + 1.707_614_701 * sCube
    ),
  ];
}

/** Outside 0..1 in any channel means the browser silently clips the colour. */
function isOutOfGamut(rgb: Rgb): boolean {
  return rgb.some((v) => v < -0.001 || v > 1.001);
}

function relativeLuminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((v) => {
    const clamped = Math.min(1, Math.max(0, v));
    return clamped <= 0.039_28
      ? clamped / 12.92
      : ((clamped + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(fg: Rgb, bg: Rgb): number {
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** `bg-success/15` and friends: the fill at 15% over whatever sits behind it. */
function composite(fg: Rgb, bg: Rgb, alpha: number): Rgb {
  return [0, 1, 2].map((i) => fg[i] * alpha + bg[i] * (1 - alpha)) as Rgb;
}

const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;
const BADGE_ALPHA = 0.15;

describe("light-mode status colours", () => {
  const block = lightThemeBlock();
  const card = oklchToRgb(readToken(block, "card"));

  it.each(["success", "warning", "info"] as const)(
    "keeps --%s inside sRGB, so the browser is not silently clipping it",
    (token) => {
      expect(isOutOfGamut(oklchToRgb(readToken(block, token)))).toBe(false);
    }
  );

  it.each(["success", "warning", "info"] as const)(
    "reads --%s as AA text on its own tinted badge, not just on the card",
    (token) => {
      const fill = oklchToRgb(readToken(block, token));
      const badge = composite(fill, card, BADGE_ALPHA);

      // The card is the easy case and must pass too, but the badge is what
      // actually ships: List health figures and status pills both sit on it.
      expect(contrast(fill, card)).toBeGreaterThanOrEqual(AA_TEXT);
      expect(contrast(fill, badge)).toBeGreaterThanOrEqual(AA_TEXT);
    }
  );

  it("keeps the near-black foreground legible on a solid warning chip", () => {
    const fill = oklchToRgb(readToken(block, "warning"));
    const foreground = oklchToRgb(readToken(block, "warning-foreground"));

    // The other side of the vice: this is what fails if --warning is darkened
    // to buy more headroom on the text case above.
    expect(contrast(foreground, fill)).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  it("keeps the white foreground legible on a solid success chip", () => {
    const fill = oklchToRgb(readToken(block, "success"));
    const foreground = oklchToRgb(readToken(block, "success-foreground"));

    expect(contrast(foreground, fill)).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });
});

describe("NEUTRAL_RAMP tracks globals.css", () => {
  const block = lightThemeBlock();

  it.each(["success", "warning"] as const)(
    "carries the same light-mode lightness and chroma for %s",
    (token) => {
      const css = readToken(block, token);
      const ramp = NEUTRAL_RAMP.light[token];

      // Not cosmetic: this copy is what a customer's public preference centre
      // renders from. Letting it drift reintroduces the AA failure on a page
      // outside the dashboard, where nobody would think to look for it.
      expect(ramp).toEqual({ l: css.l, c: css.c });
    }
  );
});
