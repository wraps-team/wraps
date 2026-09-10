import TurndownService from "turndown";
// @ts-expect-error — turndown-plugin-gfm ships no types; the named export is
// a plain Turndown plugin function.
import { gfm } from "turndown-plugin-gfm";

/**
 * Markdown derived from a page's own rendered HTML.
 *
 * AGENT_CONTENT is hand-authored and covers ~20 of the site's ~130 routes.
 * Everything else is prose in JSX, not MDX, so there is no markdown source to
 * serve and no list to keep in sync — the only representation that cannot drift
 * from what a reader sees is the page's own render.
 *
 * This is the floor, not the ceiling: a hand-authored entry always wins, because
 * it can say things the HTML doesn't (pricing tables generated from config, the
 * ranked alternatives lists). Derivation exists so that the ~110 routes without
 * one answer with their actual content instead of a 404.
 */

const SITE = "https://wraps.dev";

/**
 * Sent on the self-fetch below so middleware can tell a derivation render from
 * a real visitor. Without it the render is still safe — the fetch asks for HTML
 * and carries no crawler UA, so markdown negotiation doesn't trigger — but a
 * future change to that negotiation shouldn't be able to introduce a loop.
 */
export const DERIVE_MARKER_HEADER = "x-wraps-md-derive";

/**
 * Page chrome that is navigation, not content. Dropped before conversion.
 *
 * Matched by name through a predicate rather than passed as a tag list because
 * Turndown types the list form as HTML tag names only, and `svg` is not one.
 *
 * `header` is deliberately not here. It is stripped conditionally instead — see
 * `converter` and `contentHtml` — because it means two different things
 * depending on where the content region comes from.
 */
const NON_CONTENT_ELEMENTS = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "iframe",
  "nav",
  "footer",
  "form",
]);

/**
 * Below this, the conversion produced a shell rather than a page — a layout
 * with no prose in it. Serving that is worse than admitting there's nothing:
 * an agent can act on a 404 that names the sitemap, but not on four words of
 * boilerplate it has no way to recognise as empty.
 */
const MIN_USEFUL_CHARS = 200;

/**
 * A hung render must not hold the route handler open.
 *
 * In production the page being fetched is already built, so a render is tens of
 * milliseconds and this only ever fires on something genuinely wrong. In dev it
 * is compiled on demand the first time it is asked for, which routinely takes
 * longer than any sane production budget — hence two numbers rather than one
 * loose one that would let a real production stall through.
 */
const FETCH_TIMEOUT_MS = process.env.NODE_ENV === "development" ? 30_000 : 4000;

const MAIN_ELEMENT = /<main\b[^>]*>([\s\S]*)<\/main>/i;
const HEADER_CLOSE_BEFORE_MAIN = /<\/header>\s*$/i;
const TITLE_ELEMENT = /<title\b[^>]*>([\s\S]*?)<\/title>/i;
const TITLE_SUFFIX = /\s*[|·]\s*Wraps\s*$/;

/**
 * `stripHeader` is false only when the content region already excludes the
 * site navbar by construction (see `contentHtml`) — stripping `header` there
 * would delete the page's own `<h1>` and opening paragraph along with it. When
 * there is no `<main>` to scope to, the whole document is converted and the
 * only `<header>` a rendered page has is the navbar, so it must be stripped or
 * every derived page for those routes would open with site navigation.
 */
function converter(stripHeader: boolean): TurndownService {
  const service = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });
  const strip = stripHeader
    ? new Set([...NON_CONTENT_ELEMENTS, "header"])
    : NON_CONTENT_ELEMENTS;
  service.remove((node) => strip.has(node.nodeName.toLowerCase()));
  // Tables are the whole point on the pricing and comparison pages; Turndown
  // core flattens them into unreadable runs of text without this.
  service.use(gfm);
  return service;
}

/**
 * The page's content region, plus whether the conversion below still needs to
 * strip `<header>`.
 *
 * Roughly half the routes render a `<main>`; the rest are converted whole and
 * rely on the element removals in `converter` to drop the surrounding chrome.
 *
 * On the two biggest content templates, the page's `<h1>` and its opening
 * paragraph live in a `<header>` that sits immediately before `<main>` — a
 * sibling, not a child, so the naive "just take `<main>`" extraction below used
 * to throw them away. That header is content and belongs in the region. The
 * site navbar also renders a bare `<header>`, but higher up the document,
 * separated from `<main>` by everything in between — it is excluded simply by
 * not being adjacent, so it never has to be recognised and named as "the
 * navbar" here.
 */
function contentHtml(html: string): { html: string; stripHeader: boolean } {
  const main = MAIN_ELEMENT.exec(html);
  if (!main || main.index === undefined) {
    return { html, stripHeader: true };
  }

  const before = html.slice(0, main.index);
  const headerClose = HEADER_CLOSE_BEFORE_MAIN.exec(before);
  const headerStart = headerClose ? before.lastIndexOf("<header") : -1;
  if (headerClose && headerStart !== -1) {
    const headerEnd = headerClose.index + "</header>".length;
    const header = before.slice(headerStart, headerEnd);
    return { html: `${header}${main[1]}`, stripHeader: false };
  }

  return { html: main[1], stripHeader: false };
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

function decodeEntities(text: string): string {
  return text.replace(
    /&(?:amp|lt|gt|quot|#39|nbsp);/g,
    (match) => ENTITIES[match] ?? match
  );
}

function pageTitle(html: string): string | undefined {
  const raw = TITLE_ELEMENT.exec(html)?.[1];
  if (raw === undefined) {
    return;
  }
  // "Domain Verification Guide | Wraps" — the suffix is site chrome, and the
  // heading already sits under a Source line naming wraps.dev.
  const title = decodeEntities(raw).replace(TITLE_SUFFIX, "").trim();
  return title.length > 0 ? title : undefined;
}

/**
 * Site-relative markdown links, absolutised.
 *
 * The HTML can afford `/docs/quickstart/email` because the reader is already on
 * wraps.dev. This markdown is read somewhere else entirely, where a root-
 * relative link resolves against whatever host the agent happens to be on — so
 * every internal link would be a dead end. Protocol-relative (`//`) and anchor
 * (`#`) targets are left alone; neither is ambiguous.
 */
const RELATIVE_LINK = /\]\((\/(?!\/)[^)\s]*)\)/g;

function absoluteLinks(markdown: string): string {
  return markdown.replace(RELATIVE_LINK, (_match, path) => `](${SITE}${path})`);
}

function normalizeHeadingText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

const FIRST_HEADING = /^(#{1,6}) (.+)$/m;

/**
 * The deriver prepends `# {title}` from `<title>`, and turndown separately
 * converts the page's own visible `<h1>` — which the header fix above now
 * keeps. When both name the same page, that is a duplicate top-level heading,
 * not two facts. `<title>` carries an SEO suffix the visible `<h1>` doesn't
 * (e.g. "Resend vs Wraps" vs. "Resend vs Wraps - Compare Email Infrastructure
 * Approaches"), so a prefix match counts as the same heading, and the fuller
 * `<title>`-derived line is the one kept.
 */
function dropDuplicateH1(body: string, title: string | undefined): string {
  if (title === undefined) {
    return body;
  }

  const firstHeading = FIRST_HEADING.exec(body);
  if (!firstHeading || firstHeading[1] !== "#") {
    return body;
  }

  const heading = normalizeHeadingText(firstHeading[2]);
  const normalizedTitle = normalizeHeadingText(title);
  const isDuplicate =
    heading === normalizedTitle ||
    heading.startsWith(normalizedTitle) ||
    normalizedTitle.startsWith(heading);
  if (!isDuplicate) {
    return body;
  }

  const start = firstHeading.index;
  const end = start + firstHeading[0].length;
  return `${body.slice(0, start)}${body.slice(end)}`
    .replace(COLLAPSED_BLANK_LINES, "\n\n")
    .trim();
}

const COLLAPSED_BLANK_LINES = /\n{3,}/g;
const STRUCTURAL_LEADING_LINE = /^(#{1,6}\s|[-*+]\s|\d+\.\s|\|.*\||```)/;
const WHITESPACE = /\s+/;
const LEADING_BLANK_LINES = /^\n+/;

/**
 * Some templates open with a short eyebrow label above the real heading —
 * "Alternatives", "What you're building", "23%" — that reads fine in the
 * page's own visual hierarchy but carries no meaning once it is the first
 * line of a markdown document with no title already stated above it. Dropped
 * conservatively: at most one line, and only when real content follows it, so
 * a page that genuinely opens with a short sentence is left alone.
 */
function dropLeadingChromeFragment(body: string): string {
  const lines = body.split("\n");
  const firstIndex = lines.findIndex((line) => line.trim().length > 0);
  if (firstIndex === -1) {
    return body;
  }

  const first = lines[firstIndex].trim();
  const isStructural = STRUCTURAL_LEADING_LINE.test(first);
  const isShort = first.split(WHITESPACE).length <= 3;
  if (isStructural || !isShort) {
    return body;
  }

  const hasFollowingContent = lines
    .slice(firstIndex + 1)
    .some((line) => line.trim().length > 0);
  if (!hasFollowingContent) {
    return body;
  }

  return lines
    .filter((_line, index) => index !== firstIndex)
    .join("\n")
    .replace(LEADING_BLANK_LINES, "");
}

/**
 * Convert one page's HTML to markdown. Returns undefined when the result is too
 * thin to be worth serving — see MIN_USEFUL_CHARS.
 *
 * Exported separately from the fetch so it can be tested against fixture HTML
 * without a network round trip.
 */
export function deriveMarkdownFromHtml(
  html: string,
  pagePath: string
): string | undefined {
  const { html: region, stripHeader } = contentHtml(html);
  let body = absoluteLinks(converter(stripHeader).turndown(region)).trim();
  if (body.length < MIN_USEFUL_CHARS) {
    return;
  }

  const title = pageTitle(html);
  body = dropLeadingChromeFragment(dropDuplicateH1(body, title));

  const heading = title === undefined ? "" : `# ${title}\n\n`;
  return `${heading}Source: ${SITE}${pagePath}\n\n${body}\n`;
}

/**
 * Warm-instance memo. The route already sets a one-hour Cache-Control, so this
 * only saves the repeat renders a single instance would otherwise do before the
 * CDN entry is populated. Cleared wholesale rather than evicted per-entry: the
 * cap exists to bound memory, and an exact LRU would cost more than the misses.
 */
const MEMO_LIMIT = 200;
const memo = new Map<string, string>();

/**
 * Fetch a page from this same deployment and convert it. Returns undefined for
 * every "there is no markdown here" outcome, leaving the caller to answer with
 * its own 404 body.
 */
export async function fetchDerivedMarkdown(
  pagePath: string,
  origin: string
): Promise<string | undefined> {
  const cached = memo.get(pagePath);
  if (cached !== undefined) {
    return cached;
  }

  let response: Response;
  try {
    response = await fetch(new URL(pagePath, origin), {
      headers: { [DERIVE_MARKER_HEADER]: "1", accept: "text/html" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      // Next's data cache has a smaller entry ceiling than a rendered page; the
      // response headers on the markdown are what should be doing the caching.
      cache: "no-store",
    });
  } catch (error) {
    // A timeout and a transport failure both end here, but they mean different
    // things when this shows up in logs, so say which one happened.
    const reason =
      error instanceof Error && error.name === "TimeoutError"
        ? `timed out after ${FETCH_TIMEOUT_MS}ms`
        : `failed: ${error instanceof Error ? error.message : String(error)}`;
    console.warn(`[api/md] derivation render for ${pagePath} ${reason}`);
    return;
  }

  if (!response.ok) {
    // The ordinary case for a URL that is not a page at all. Not worth a log
    // line — /api/md is a guessable path and agents probe it.
    return;
  }

  const markdown = deriveMarkdownFromHtml(await response.text(), pagePath);
  if (markdown === undefined) {
    return;
  }

  if (memo.size >= MEMO_LIMIT) {
    memo.clear();
  }
  memo.set(pagePath, markdown);
  return markdown;
}
