/* oxlint-disable shadcn/no-inline-styles -- next/og (satori) renders inline styles only; .oxlintrc.json ignores opengraph-image.tsx for the same reason */
import type { CSSProperties } from "react";

/**
 * The per-page Open Graph card drawn by `route.tsx`.
 *
 * Satori renders inline styles only and can't read CSS variables, so the design
 * tokens (design-system `tokens.css`, dark theme) are copied here as constants.
 * Layout and type follow `public/og-image.png`: dark ink background, white
 * Wraps wordmark top left, white title in Inter, orange used once (the section
 * label), `wraps.dev` in mono bottom right.
 */

export const OG_SIZE = { width: 1200, height: 630 } as const;

// --wraps-ink-950, --wraps-ink-0, --wraps-ink-400, --wraps-orange-500
const INK = "#09090b";
const WHITE = "#ffffff";
const MUTED = "#a1a1aa";
const ORANGE = "#f97316";

export const OG_FONT_SANS = "Inter";
export const OG_FONT_MONO = "JetBrains Mono";

/**
 * Title size by length, so a short title is large and readable at thumbnail
 * size (about 600x315 on X and LinkedIn) and a long one still fits. `lines` is
 * the clamp: text past it is cut with an ellipsis, never drawn off the card.
 * The 200 character cap in `og-card.ts` keeps the last tier at 5 lines.
 */
export function titleLayout(title: string): {
  fontSize: number;
  lines: number;
} {
  const length = Array.from(title).length;
  if (length <= 28) {
    return { fontSize: 96, lines: 2 };
  }
  if (length <= 56) {
    return { fontSize: 80, lines: 3 };
  }
  if (length <= 100) {
    return { fontSize: 64, lines: 4 };
  }
  return { fontSize: 52, lines: 5 };
}

const fill: CSSProperties = {
  display: "flex",
  width: "100%",
  height: "100%",
};

export function OgCard({
  title,
  section,
  logoSrc,
}: {
  title: string;
  section: string;
  logoSrc: string;
}) {
  const { fontSize, lines } = titleLayout(title);

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
      {/* Dot grid, as on og-image.png */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundImage:
            "radial-gradient(circle at 2px 2px, rgba(255,255,255,0.07) 1px, transparent 0)",
          backgroundSize: "28px 28px",
        }}
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
          }}
        >
          {title}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          color: MUTED,
          fontFamily: OG_FONT_MONO,
          fontSize: 28,
          fontWeight: 500,
        }}
      >
        wraps.dev
      </div>
    </div>
  );
}
