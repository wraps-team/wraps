/**
 * Email primitives that match the marketing site.
 *
 * Each export is the email-safe translation of a real component in
 * `apps/website/src/app/landing/components`. Where a name matches (Kicker →
 * SectionKicker, Terminal → the shadcn-io Terminal, DarkCta → SectionCard's
 * footer band), the styling is deliberately a one-to-one lift so a reader who
 * clicks through from an email lands on a page that looks like it.
 *
 * Everything is inline-styled. Gmail strips <style> blocks and ignores
 * webfonts, so the type stacks in `style-guide.ts` all degrade to system
 * faces without changing the layout.
 */

import {
  Body,
  Column,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";
import { CONTAINER_WIDTH, color, font, link, text } from "./style-guide";

const WORDMARK = "https://wraps.dev/wraps-light-logo.png";

// ── Type ──────────────────────────────────────────────────────────────────

export function H1({ children }: { children: React.ReactNode }) {
  return <Text style={text.h1}>{children}</Text>;
}

export function H2({ children }: { children: React.ReactNode }) {
  return <Text style={text.h2}>{children}</Text>;
}

export function P({ children }: { children: React.ReactNode }) {
  return <Text style={text.body}>{children}</Text>;
}

export function Small({ children }: { children: React.ReactNode }) {
  return <Text style={text.small}>{children}</Text>;
}

export function A({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} style={link}>
      {children}
    </Link>
  );
}

/** Inline mono token, matching the site's `font-mono` code spans. */
export function Code({ children }: { children: string }) {
  return (
    <code
      style={{
        fontFamily: font.mono,
        fontSize: "13px",
        color: color.ink,
        backgroundColor: color.surface,
        borderRadius: "2px",
        padding: "2px 6px",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </code>
  );
}

export function Rule() {
  return (
    <Hr style={{ margin: "28px 0", borderTop: `1px solid ${color.border}` }} />
  );
}

// ── SectionKicker ─────────────────────────────────────────────────────────

/**
 * Mono uppercase label behind a short orange rule — the quiet header that
 * opens every section on the site. `section-kicker.tsx` uses `h-px w-6`, so
 * the rule is 24px wide and exactly one pixel tall.
 */
export function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <Row style={{ marginBottom: "18px" }}>
      <Column style={{ width: "24px", verticalAlign: "middle" }}>
        <div
          style={{
            width: "24px",
            height: "1px",
            fontSize: "1px",
            lineHeight: "1px",
            backgroundColor: color.orange,
          }}
        >
          &nbsp;
        </div>
      </Column>
      <Column style={{ paddingLeft: "10px", verticalAlign: "middle" }}>
        <Text
          style={{
            margin: 0,
            fontFamily: font.mono,
            fontSize: "11px",
            lineHeight: "1.2",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: color.muted,
          }}
        >
          {children}
        </Text>
      </Column>
    </Row>
  );
}

// ── Buttons ───────────────────────────────────────────────────────────────

const buttonBase = {
  display: "inline-block",
  fontFamily: font.body,
  fontSize: "15px",
  fontWeight: 500,
  lineHeight: "1",
  padding: "13px 22px",
  // `rounded-md` resolves to 0 on the site — the buttons are square.
  borderRadius: "0",
  textDecoration: "none",
} as const;

export function PrimaryButton({
  href,
  children,
}: {
  href: string;
  children: string;
}) {
  return (
    <Section style={{ margin: "26px 0" }}>
      <Link
        href={href}
        style={{
          ...buttonBase,
          backgroundColor: color.orange,
          color: color.white,
        }}
      >
        {children}
      </Link>
    </Section>
  );
}

/** The site's `variant="outline"` button. */
export function SecondaryButton({
  href,
  children,
}: {
  href: string;
  children: string;
}) {
  return (
    <Section style={{ margin: "26px 0" }}>
      <Link
        href={href}
        style={{
          ...buttonBase,
          backgroundColor: color.white,
          border: `1px solid ${color.border}`,
          color: color.ink,
        }}
      >
        {children}
      </Link>
    </Section>
  );
}

// ── Terminal ──────────────────────────────────────────────────────────────

export type TerminalLine =
  | { kind: "command"; text: string }
  | { kind: "output"; text: string }
  | { kind: "success"; text: string };

const terminalLineColor: Record<TerminalLine["kind"], string> = {
  command: color.ink,
  output: color.muted,
  success: color.green,
};

/**
 * The hero terminal. Light card, hairline border, rounded-xl, three dots in
 * the title bar — same as `components/ui/shadcn-io/terminal`, which inherits
 * `bg-background` and so reads light, not dark, on the site.
 */
export function Terminal({ lines }: { lines: TerminalLine[] }) {
  return (
    <Section
      style={{
        margin: "24px 0",
        border: `1px solid ${color.border}`,
        borderRadius: "12px",
        backgroundColor: color.white,
      }}
    >
      <Row style={{ borderBottom: `1px solid ${color.border}` }}>
        <Column style={{ padding: "12px 16px" }}>
          <table cellPadding="0" cellSpacing="0" role="presentation">
            <tbody>
              <tr>
                {["#ef4444", "#eab308", "#22c55e"].map((dot) => (
                  <td key={dot} style={{ paddingRight: "6px" }}>
                    <div
                      style={{
                        width: "8px",
                        height: "8px",
                        fontSize: "1px",
                        lineHeight: "1px",
                        borderRadius: "50%",
                        backgroundColor: dot,
                      }}
                    >
                      &nbsp;
                    </div>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </Column>
      </Row>
      <Row>
        <Column style={{ padding: "16px" }}>
          {lines.map((line) => (
            <Text
              key={line.text}
              style={{
                margin: "0 0 6px",
                fontFamily: font.mono,
                fontSize: "13px",
                lineHeight: "1.5",
                letterSpacing: "-0.01em",
                color: terminalLineColor[line.kind],
              }}
            >
              {line.kind === "command" ? `$ ${line.text}` : line.text}
            </Text>
          ))}
        </Column>
      </Row>
    </Section>
  );
}

// ── Stat grid ─────────────────────────────────────────────────────────────

/**
 * The hero's proof stats: mono numeral over a small muted label, separated by
 * hairlines. Two or three entries — four is too narrow at 600px.
 */
export function StatGrid({
  stats,
}: {
  stats: { value: string; label: string }[];
}) {
  const width = `${(100 / stats.length).toFixed(2)}%`;
  return (
    <Section
      style={{
        margin: "24px 0",
        borderTop: `1px solid ${color.border}`,
        borderBottom: `1px solid ${color.border}`,
        tableLayout: "fixed",
      }}
    >
      <Row style={{ tableLayout: "fixed" }}>
        {stats.map((stat, i) => (
          <Column
            key={stat.label}
            style={{
              width,
              verticalAlign: "top",
              borderLeft: i === 0 ? undefined : `1px solid ${color.border}`,
            }}
          >
            {/* Padding lives on an inner block: on a <td> it would add to the
                percentage width and push the last column past the container. */}
            <div style={{ padding: i === 0 ? "14px 14px 14px 0" : "14px" }}>
              <Text
                style={{
                  margin: "0 0 2px",
                  fontFamily: font.mono,
                  fontSize: "19px",
                  fontWeight: 600,
                  lineHeight: "1.2",
                  letterSpacing: "-0.01em",
                  color: color.ink,
                }}
              >
                {stat.value}
              </Text>
              <Text
                style={{
                  margin: 0,
                  fontFamily: font.body,
                  fontSize: "12px",
                  lineHeight: "1.4",
                  color: color.muted,
                }}
              >
                {stat.label}
              </Text>
            </div>
          </Column>
        ))}
      </Row>
    </Section>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────

/** A bordered box on the muted ground — the site's SectionCard body. */
export function Panel({
  label,
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <Section
      style={{
        margin: "24px 0",
        border: `1px solid ${color.border}`,
        backgroundColor: color.surface,
        padding: "18px 20px 4px",
      }}
    >
      {label ? (
        <Text
          style={{
            margin: "0 0 6px",
            fontFamily: font.mono,
            fontSize: "11px",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: color.muted,
          }}
        >
          {label}
        </Text>
      ) : null}
      {children}
    </Section>
  );
}

// ── Figure ────────────────────────────────────────────────────────────────

/**
 * An image inside the message, with an optional caption.
 *
 * Assets are rendered in `wraps-private` (`scripts/render-email.zsh`) and
 * served from `apps/website/public/email/`, so the website has to be deployed
 * before the send — a message already in someone's inbox cannot be repointed.
 *
 * Four rules the markup encodes, all of them things that break in a real client
 * rather than in a preview:
 *
 *   - `width` is 552, the Shell's content box. Anything wider is scaled down by
 *     the client at whatever quality it feels like.
 *   - `width`/`height` are HTML attributes, not just CSS. Outlook needs the
 *     attribute, and without a height the message reflows as images load.
 *   - `alt` is required and reads as a sentence. Outlook blocks remote images
 *     by default, so for a real share of the list the alt text IS the figure.
 *   - No webp and no mp4. Outlook renders neither. PNG, JPG, or GIF only.
 */
export function Figure({
  src,
  alt,
  height,
  caption,
  href,
  width = 552,
}: {
  src: string;
  alt: string;
  /** Displayed height in px — the rendered file's height halved, at 2x. */
  height: number;
  caption?: string;
  /** Wraps the figure in a link. Worth it when the image shows a page. */
  href?: string;
  width?: number;
}) {
  const image = (
    <Img
      alt={alt}
      height={height}
      src={src}
      style={{
        display: "block",
        width: "100%",
        maxWidth: `${width}px`,
        height: "auto",
        border: `1px solid ${color.border}`,
        /* Alt text lands on the client's own background when images are off;
           the border alone reads as an empty box without this. */
        backgroundColor: color.surface,
      }}
      width={width}
    />
  );

  return (
    <Section style={{ margin: "24px 0" }}>
      {href ? (
        <Link href={href} style={{ textDecoration: "none" }}>
          {image}
        </Link>
      ) : (
        image
      )}
      {caption ? (
        <Text
          style={{
            margin: "8px 0 0",
            fontFamily: font.mono,
            fontSize: "12px",
            lineHeight: "1.5",
            color: color.muted,
          }}
        >
          {caption}
        </Text>
      ) : null}
    </Section>
  );
}

// ── Dark CTA band ─────────────────────────────────────────────────────────

/**
 * `bg-foreground text-background` — the inverted band that closes SectionCard
 * on the site. One per email, at the bottom, or it stops meaning anything.
 */
export function DarkCta({
  title,
  description,
  ctaText,
  ctaHref,
}: {
  title: string;
  description: string;
  ctaText: string;
  ctaHref: string;
}) {
  return (
    <Section
      style={{
        margin: "32px 0 22px",
        backgroundColor: color.ink,
        padding: "24px",
      }}
    >
      <Text
        style={{
          margin: "0 0 6px",
          fontFamily: font.heading,
          fontSize: "17px",
          fontWeight: 600,
          letterSpacing: "-0.02em",
          color: color.white,
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          margin: "0 0 18px",
          fontFamily: font.body,
          fontSize: "14px",
          lineHeight: "1.55",
          color: "#a3a3a3",
        }}
      >
        {description}
      </Text>
      <Link
        href={ctaHref}
        style={{
          ...buttonBase,
          backgroundColor: color.white,
          color: color.ink,
        }}
      >
        {ctaText}
      </Link>
    </Section>
  );
}

// ── Steps ─────────────────────────────────────────────────────────────────

/** Mono ordinal in an orange-bordered square, matching the site's IconBox. */
export function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Row style={{ marginBottom: "18px" }}>
      <Column style={{ width: "36px", verticalAlign: "top" }}>
        <div
          style={{
            width: "26px",
            height: "26px",
            border: `1px solid ${color.orange}`,
            fontFamily: font.mono,
            fontSize: "12px",
            fontWeight: 600,
            lineHeight: "26px",
            textAlign: "center",
            color: color.orange,
          }}
        >
          {number}
        </div>
      </Column>
      <Column style={{ verticalAlign: "top" }}>
        <Text
          style={{
            margin: "0 0 4px",
            fontFamily: font.heading,
            fontSize: "15px",
            fontWeight: 600,
            letterSpacing: "-0.01em",
            color: color.ink,
          }}
        >
          {title}
        </Text>
        <Text style={{ ...text.body, margin: 0 }}>{children}</Text>
      </Column>
    </Row>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────

/**
 * Page chrome: wordmark, hairline rule, content, footer. The site opens every
 * page with the wordmark over a `border-b` and closes it with muted mono
 * links, so the emails do too.
 */
export function Shell({
  preview,
  unsubscribeUrl,
  preferencesUrl,
  children,
}: {
  preview: string;
  unsubscribeUrl: string;
  preferencesUrl?: string;
  children: React.ReactNode;
}) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          margin: 0,
          padding: 0,
          backgroundColor: color.white,
          fontFamily: font.body,
        }}
      >
        <Container
          style={{
            width: "100%",
            maxWidth: CONTAINER_WIDTH,
            margin: "0 auto",
            padding: "36px 24px 24px",
          }}
        >
          <Section style={{ paddingBottom: "22px" }}>
            <Img
              alt="Wraps"
              height="33"
              src={WORDMARK}
              style={{ display: "block" }}
              width="108"
            />
          </Section>

          <Hr
            style={{
              margin: "0 0 30px",
              borderTop: `1px solid ${color.border}`,
            }}
          />

          {children}

          <Hr
            style={{
              margin: "36px 0 18px",
              borderTop: `1px solid ${color.border}`,
            }}
          />

          <Section>
            <Text
              style={{
                margin: "0 0 8px",
                fontFamily: font.mono,
                fontSize: "11px",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: color.muted,
              }}
            >
              Wraps &middot; Boulder, CO
            </Text>
            <Text
              style={{
                margin: 0,
                fontFamily: font.body,
                fontSize: "12px",
                lineHeight: "1.6",
                color: color.muted,
              }}
            >
              <Link
                href="https://wraps.dev/docs"
                style={{ color: color.muted, textDecoration: "underline" }}
              >
                Docs
              </Link>
              {" · "}
              <Link
                href="https://github.com/wraps-team/wraps"
                style={{ color: color.muted, textDecoration: "underline" }}
              >
                GitHub
              </Link>
              {preferencesUrl ? (
                <>
                  {" · "}
                  <Link
                    href={preferencesUrl}
                    style={{ color: color.muted, textDecoration: "underline" }}
                  >
                    Email preferences
                  </Link>
                </>
              ) : null}
              {" · "}
              <Link
                href={unsubscribeUrl}
                style={{ color: color.muted, textDecoration: "underline" }}
              >
                Unsubscribe
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
