/**
 * Wraps email style guide — lifted from the marketing site.
 *
 * Source of truth is `apps/website`. The values below are the resolved,
 * email-safe form of the site's design tokens:
 *
 *   - Colors are the hex equivalents of the OKLch neutrals in
 *     `apps/website/src/app/globals.css` (shadcn's neutral ramp), plus
 *     orange-500/600, the only accent the site uses.
 *   - `--radius` on the site is 0.125rem, and shadcn's `rounded-md` resolves
 *     to `calc(var(--radius) - 2px)` = 0. Buttons and chips are square; only
 *     the terminal card is rounded, matching the site's Terminal component.
 *   - Fonts mirror `@theme inline`: Space Grotesk headings, Inter body,
 *     JetBrains Mono for the kicker, stats, and code. Every stack falls back
 *     to system faces because Gmail ignores webfonts.
 *
 * Email clients only reliably honor inline styles, so these are plain style
 * objects rather than Tailwind classes.
 */

export const color = {
  /** --foreground / neutral-950 */
  ink: "#0a0a0a",
  /** --primary / neutral-900 */
  inkSoft: "#171717",
  /** body copy — neutral-700, a step darker than the site's muted for email */
  body: "#404040",
  /** --muted-foreground / neutral-500 */
  muted: "#737373",
  /** --border / neutral-200 */
  border: "#e5e5e5",
  /** --muted / neutral-100 */
  surface: "#f5f5f5",
  /** --background */
  white: "#ffffff",
  /** the site's single accent */
  orange: "#f97316",
  orangeDark: "#ea580c",
  /** terminal success lines */
  green: "#16a34a",
} as const;

export const font = {
  heading:
    "'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  body: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
} as const;

/** Container width. The site's prose columns cap around 46ch; 600px is the
 *  widest an email can go before Outlook starts scrolling horizontally. */
export const CONTAINER_WIDTH = "600px";

export const text = {
  /** Hero h1 — font-heading, semibold, tight tracking, per hero-section.tsx */
  h1: {
    margin: "0 0 16px",
    fontFamily: font.heading,
    fontSize: "30px",
    fontWeight: 600,
    lineHeight: "1.12",
    letterSpacing: "-0.03em",
    color: color.ink,
  },
  h2: {
    margin: "0 0 10px",
    fontFamily: font.heading,
    fontSize: "18px",
    fontWeight: 600,
    lineHeight: "1.25",
    letterSpacing: "-0.02em",
    color: color.ink,
  },
  body: {
    margin: "0 0 16px",
    fontFamily: font.body,
    fontSize: "15px",
    lineHeight: "1.6",
    color: color.body,
  },
  small: {
    margin: "0 0 12px",
    fontFamily: font.body,
    fontSize: "13px",
    lineHeight: "1.55",
    color: color.muted,
  },
} as const;

/** Gmail's desktop webmail drops `text-underline-offset`, so links stay with
 *  the plain underline the site uses on inline prose links. */
export const link = {
  color: color.ink,
  textDecoration: "underline",
} as const;
