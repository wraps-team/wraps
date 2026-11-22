import type { CSSProperties } from "react";

/**
 * The per-page Open Graph card drawn by `route.tsx`.
 *
 * Satori renders inline styles only and can't read CSS variables, so the design
 * tokens (design-system `tokens.css`, dark theme) are copied here as constants.
 * Layout follows `public/og-image.png`: dark ink background with a dot grid,
 * white Wraps wordmark top left, a small orange section label, a large white
 * title in Inter, and a terminal-style panel along the bottom holding the
 * page's route in mono after an orange `$`. A thin orange bar runs along the
 * top edge and an orange glow comes from the bottom-right corner.
 *
 * Bump `OG_CARD_VERSION` in `src/lib/og-card.ts` with any visual change here, in
 * the fonts or in the logo: card URLs are cached as immutable for a year.
 */

export const OG_SIZE = { width: 1200, height: 630 } as const;

// --wraps-ink-950, --wraps-ink-0, --wraps-ink-200, --wraps-ink-900, --wraps-orange-500
const INK = "#09090b";
const WHITE = "#ffffff";
const SOFT = "#e4e4e7";
const PANEL = "#18181b"; // the terminal box fill on og-image.png
const ORANGE = "#f97316";

export const OG_FONT_SANS = "Inter";
export const OG_FONT_MONO = "JetBrains Mono";

/**
 * Title size by length, so a short title is large and readable at thumbnail
 * size (about 600x315 on X and LinkedIn) and a long one still fits. `lines` is
 * the clamp: text past it is cut with an ellipsis, never drawn off the card.
 * The 200 character cap in `og-card.ts` keeps the last tier at 5 lines.
 * `balance` evens out the line lengths so a short last line ("SES") doesn't
 * orphan; the longest tier skips it because balancing narrows every line and
 * would clamp more of the title away.
 */
export function titleLayout(title: string): {
  fontSize: number;
  lines: number;
  balance: boolean;
} {
  const length = Array.from(title).length;
  if (length <= 28) {
    return { fontSize: 96, lines: 2, balance: true };
  }
  if (length <= 56) {
    return { fontSize: 80, lines: 3, balance: true };
  }
  if (length <= 100) {
    return { fontSize: 64, lines: 4, balance: true };
  }
  return { fontSize: 52, lines: 5, balance: false };
}

const GRID_STEP = 26;
const GRID_ALPHA = 0.22;

/**
 * The backdrop under the card, as an SVG image: satori ignores a repeating
 * radial-gradient background, so a dot grid has to be an image. Dots are white
 * and fade out toward the title (an elliptical mask centred on the bottom-right
 * corner), an orange glow comes from that corner, and a thin orange bar runs
 * along the top edge.
 */
function backdropSrc(): string {
  const { width, height } = OG_SIZE;
  const half = GRID_STEP / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><pattern id="d" width="${GRID_STEP}" height="${GRID_STEP}" patternUnits="userSpaceOnUse"><circle cx="${half}" cy="${half}" r="1.75" fill="#ffffff" fill-opacity="${GRID_ALPHA}"/></pattern><radialGradient id="m" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(${width} ${height}) scale(820 600)"><stop offset="0" stop-color="#fff"/><stop offset="0.35" stop-color="#fff" stop-opacity="0.9"/><stop offset="0.62" stop-color="#fff" stop-opacity="0.35"/><stop offset="0.9" stop-color="#fff" stop-opacity="0"/></radialGradient><mask id="k"><rect width="${width}" height="${height}" fill="url(#m)"/></mask><radialGradient id="g" cx="${width}" cy="${height}" r="720" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${ORANGE}" stop-opacity="0.5"/><stop offset="0.4" stop-color="${ORANGE}" stop-opacity="0.2"/><stop offset="1" stop-color="${ORANGE}" stop-opacity="0"/></radialGradient></defs><rect width="${width}" height="${height}" fill="url(#g)"/><rect width="${width}" height="${height}" fill="url(#d)" mask="url(#k)"/><rect width="${width}" height="6" fill="${ORANGE}"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

const fill: CSSProperties = {
  display: "flex",
  width: "100%",
  height: "100%",
};

export function OgCard({
  title,
  section,
  route,
  logoSrc,
}: {
  title: string;
  section: string;
  /** The page path, e.g. `/docs/guides/dkim`; shown after `wraps.dev` in the panel. */
  route: string;
  logoSrc: string;
}) {
  const { fontSize, lines, balance } = titleLayout(title);

  return (
    <div
      style={{
        ...fill,
        position: "relative",
        flexDirection: "column",
        padding: "56px 64px",
        background: INK,
        fontFamily: OG_FONT_SANS,
      }}
    >
      {/* biome-ignore lint/performance/noImgElement: next/og renders to a PNG; next/image does not apply */}
      <img
        alt=""
        height={OG_SIZE.height}
        src={backdropSrc()}
        style={{ position: "absolute", top: 0, left: 0 }}
        width={OG_SIZE.width}
      />

      {/* biome-ignore lint/performance/noImgElement: next/og renders to a PNG; next/image does not apply */}
      <img alt="Wraps" height={44} src={logoSrc} width={144} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          justifyContent: "center",
          paddingTop: 8,
        }}
      >
        {section ? (
          <div
            style={{
              display: "flex",
              marginBottom: 28,
              color: ORANGE,
              fontFamily: OG_FONT_MONO,
              fontSize: 30,
              fontWeight: 500,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            {section}
          </div>
        ) : null}
        <div
          style={{
            display: "block",
            color: WHITE,
            fontSize,
            fontWeight: 600,
            letterSpacing: "-0.03em",
            lineHeight: 1.1,
            lineClamp: lines,
            ...(balance ? { textWrap: "balance" } : {}),
          }}
        >
          {title}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: 76,
          padding: "0 28px",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.1)",
          background: PANEL,
          fontFamily: OG_FONT_MONO,
          fontSize: 30,
          fontWeight: 500,
        }}
      >
        <div style={{ display: "flex", color: ORANGE, marginRight: 18 }}>$</div>
        <div
          style={{
            display: "block",
            flex: 1,
            minWidth: 0,
            color: SOFT,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {`wraps.dev${route === "/" ? "" : route}`}
        </div>
      </div>
    </div>
  );
}
