# Wraps Website (apps/website)

Next.js 16 marketing site + documentation. 334 files across landing, docs, tools, blog, and product pages.

## Critical Rules

### 1. Page + Content Split Pattern

Pages handle metadata/SEO (server component), content is a separate client component:

```
docs/quickstart/email/
├── page.tsx           # export metadata + JSON-LD + <PageContent />
└── page-content.tsx   # "use client" — actual UI
```

This split exists because Next.js `metadata` exports require server components, but interactive content needs client rendering.

### 2. No MDX — Content Is TSX

All content is written as React components, not MDX. This allows full component composition, state management, and interactive elements.

### 3. Use Semantic Color Tokens

No arbitrary hex colors or raw Tailwind colors. Use theme tokens:

```tsx
// BAD
<div className="bg-gray-900 text-white" />
<div className="bg-[#1a1a2e]" />

// GOOD
<div className="bg-background text-foreground" />
<div className="bg-muted text-muted-foreground" />
```

### 4. Code Blocks Use shadcn-io Components

```tsx
import { CodeBlock, CodeBlockBody, CodeBlockContent, CodeBlockCopyButton,
         CodeBlockFilename, CodeBlockHeader } from "@/components/ui/shadcn-io/code-block";

<CodeBlock>
  <CodeBlockHeader>
    <CodeBlockFilename>email.ts</CodeBlockFilename>
  </CodeBlockHeader>
  <CodeBlockBody>
    <CodeBlockContent>{code}</CodeBlockContent>
    <CodeBlockCopyButton />
  </CodeBlockBody>
</CodeBlock>
```

For tabbed examples (multiple frameworks): use `CodeTabs` + `CodeTabItem`.

### Registering a new page (tests enforce items 2 and 3)

1. The route itself: `src/app/<path>/page.tsx`
2. `public/llms.txt` — one bullet, or `src/__tests__/agent-surface.test.ts` fails
3. `src/config/page-dates.ts` — run `pnpm --filter wraps-website sitemap:dates`
   and commit; never hand-edit. `src/__tests__/sitemap.test.ts` fails otherwise,
   on both missing AND orphaned entries.
4. Blog posts only: an entry in the `posts` array in `src/app/blog/page-content.tsx`
5. Docs pages only: a nav entry in `src/components/docs-nav.tsx`
6. `src/config/search-intent.ts` — declare the page's target query

Editing an existing page also trips (3): regenerate and commit `page-dates.ts`
in the same commit, or in the same PR (it is squash-merged). The check passes
when the newest commit on `main` touching a route's files also rewrote that
route's entry in `page-dates.ts`, so squash merges are fine: GitHub restamps the
squash commit with the merge time, but the commit still carries both the page
edit and the regenerated entry. Only when the newest commit left the entry alone
does it fall back to comparing committer dates, and a later page edit that skips
the regenerate fails it. The check is per squashed PR, not per branch commit: a
PR that regenerates and is then edited again before merge is not caught, so run
`sitemap:dates` last.

## Architecture

### Route Structure

```
src/app/
├── page.tsx                   # Landing page (sections: Hero, Pricing, FAQ, etc.)
├── landing/                   # Alternate landing page
├── docs/                      # Documentation hub
│   ├── quickstart/            # Getting started guides (email, SMS, CDN, platform)
│   ├── guides/                # Multi-page guides (domain verification, AWS setup, etc.)
│   ├── cli-reference/         # CLI command reference
│   ├── sdk-reference/         # Email SDK reference
│   ├── sms-sdk-reference/     # SMS SDK reference
│   ├── cdk-reference/         # CDK construct reference
│   ├── pulumi-reference/      # Pulumi component reference
│   └── infrastructure/        # Infrastructure guides
├── platform/                  # Hosted platform pages
├── email/ | sms/ | cli/       # Product-specific content
├── inbound/                   # Inbound email documentation
├── tools/                     # Interactive tools (SES calculator, SPF builder)
├── about/ | why-wraps/        # Marketing content
├── changelog/                 # Release notes
├── contact/                   # Contact form
├── blog/                      # Blog posts
└── privacy/ | terms/          # Legal pages
```

### Layout Hierarchy

- **Root layout** (`src/app/layout.tsx`): Theme provider, analytics (Vercel + PostHog), fonts
- **BaseLayout** (`src/components/layouts/base-layout.tsx`): Sidebar + header + footer (app pages)
- **DocsLayout** (`src/components/docs-layout.tsx`): Docs sidebar nav + search (doc pages)

Docs pages use DocsLayout, NOT BaseLayout.

### Landing Page Architecture

Section-based composition — each section is a standalone component:

```tsx
// app/page.tsx
<Navbar />
<HeroSection />
<CredibilitySection />
<ProductTabbedSection />
<PricingSection />
<FAQSection />        // Includes JSON-LD schema
<Footer />
```

### Navigation

1. **Landing navbar**: Logo, nav links, mega menu for products, CTA buttons
2. **Docs sidebar** (`components/docs-nav.tsx`): Recursive tree with collapsible sections
3. **Site header**: Cmd-K search, mode toggle, app/GitHub links
4. **Cmd-K search** (`components/command-search.tsx`): Client-side command palette

### Docs Sidebar Navigation Structure

```typescript
type NavItem = {
  title: string;
  href: string;
  icon?: Icon;
  disabled?: boolean;
  children?: NavItem[];
};
```

### Key Directories

| Path | Purpose |
|------|---------|
| `components/landing/` | Landing page sections (hero, pricing, FAQ, etc.) |
| `components/docs/` | Docs navigation, layout, section headings |
| `components/ui/` | shadcn/ui primitives |
| `components/ui/shadcn-io/` | Code showcase (CodeBlock, CodeTabs, Terminal, Snippet) |
| `contexts/` | Sidebar context, theme context |
| `hooks/` | useTheme, useMobile, useSidebarConfig, useSharedInView |
| `config/` | Theme tokens, customizer constants |

## Copy, prices and shape

- Claims: before writing or changing any page copy, metadata or JSON-LD, check it against the
  `wraps-tone` skill's "Standing decisions" and the BANNED CLAIMS list it points to. When an
  edit touches a block, fix any banned wording in that block too, not only the line you
  changed.
- Prices: never type a price or a cost figure. Read plan prices from `src/config/pricing.ts`,
  competitor figures from `src/config/competitor-contact-pricing.ts`, and compute AWS costs
  with `estimateCost` (`src/lib/ses-cost.ts`), including in JSON-LD, FAQ schema, llms.txt and
  the markdown served to crawlers (`lib/agent-content.ts`).
- Shape: the marketing site has square corners (`globals.css` zeroes `--radius-2xl` to
  `--radius-4xl`). Use no `rounded-*` except on real dots. The dashboard keeps its radii.

## SEO Patterns

### Page Metadata

Every page builds its `metadata` with `pageMetadata()` (`src/lib/page-metadata.ts`). Never write
`openGraph` or `twitter` by hand: Next.js merges metadata shallowly, so a page-level `openGraph`
replaces the root's whole object and drops the image, site, locale and card type.
`src/__tests__/page-metadata.test.ts` fails when a file other than the helper and the root layout
writes either key.

```typescript
export const metadata: Metadata = pageMetadata({
  title: "Email Infrastructure", // bare: <title>, og:title and twitter:title all become "Email Infrastructure | Wraps"
  description: "Deploy production-ready email...",
  path: "/email", // canonical and og:url
  // image, type: "article", publishedTime, authors, social: { title, description } are optional
});
```

Pass a bare `title` (the helper throws on a trailing "| Wraps"). With no `image`, the page gets
its own signed `/og` title card (see "Share cards" below); pass `{ url, width, height, alt }` for a bespoke one. Use `social` only when the
share copy genuinely differs from the page title or description. Generated versus, glossary and SES
pages go through their `*Metadata()` builders, which call the helper.

- `image: null`: for a route with its own `opengraph-image.tsx` file. On Next 16.4.3 an explicit
  `images` array overrides that file, so the route keeps its card only by emitting none.
- `social.titleSuffix` (a string, or `null` for none) and `social.twitterCopy`: only to preserve share
  copy a page already had (an editorial og title without "| Wraps", a shorter X description). Don't
  reach for them on new pages.
- `absoluteTitle`: the homepage only, whose `<title>` is the root's `title.default`.

After a build, `pnpm --filter wraps-website metadata:audit` checks the rendered HTML of every page.

### JSON-LD Schema

Docs/guides include breadcrumb schema. Landing page includes FAQ + Organization schema. Render
JSON-LD with the `JsonLd` component (`src/components/json-ld.tsx`), never with
`dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}`: `JsonLd` serializes through
`serializeJsonLd`, which escapes `<`, `>`, `&` and U+2028/U+2029 so no string can break out of the tag.

```tsx
import { JsonLd } from "@/components/json-ld";

<JsonLd data={schema} />
```

### Share cards (`/og`)

A page that passes no `image` to `pageMetadata` gets a card drawn by `src/app/og/route.tsx` (the
homepage keeps `/og-image.png`). The card shows a dot grid, the section label, the title and a
terminal-style panel with the page's route (`$ wraps.dev/docs/guides/dkim`), with an orange glow
and a top bar. The URL is minted by `ogCardPath` (`src/lib/og-card.ts`) as
`/og?d=<base64url {v, t: title, s: section, r: route}>&sig=<hmac>`, signed with `OG_IMAGE_SECRET`.
The route draws only that exact query string and serves the generic `/og-image.png` for anything
else (bad or missing `sig`, extra or reordered params, a payload over the caps).

- `OG_CARD_VERSION` (in `og-card.ts`) is in the signed payload. Bump it with any visual change to
  `card.tsx`, the fonts or the logo: every card URL changes and the year-long cache is bypassed.
- A page keeps `/og-image.png`, with no card, when its title has a glyph the title font lacks, its
  path is not a plain route (letters, digits, `.`, `_`, `-`, `/`, up to 120 characters) or
  `OG_IMAGE_SECRET` is unset at build. A missing env var never breaks images.
- Titles of up to 100 characters are balanced (`textWrap: "balance"`); longer ones are not.
- `next/og` reads ttf, not woff2: the card's fonts are static ttf in `src/app/og/fonts/`, rebuilt
  from `public/fonts/subset` by `build-fonts.py` in that folder. Satori ignores repeating gradient
  backgrounds, so the dot grid is an SVG image under the card.
- `/og` is excluded from the middleware matcher (an immutable image must not get the attribution
  cookie or a markdown rewrite). Preview a card with `OG_IMAGE_SECRET=<anything> pnpm dev` and
  open a page's `og:image` URL.

### Sitemap & Robots

Generated at `src/app/sitemap.ts` and `src/app/robots.txt/route.ts`.

## Key Dependencies

- `shiki` — Syntax highlighting for code blocks
- `next-themes` — Dark mode
- `motion` — Animations
- `recharts` — Charts/visualizations
- `cmdk` — Command palette search
- `posthog-js` — Analytics (reverse-proxied via `/ingest`)

## Commands

```bash
pnpm --filter wraps-website dev         # Dev server
pnpm --filter wraps-website build       # Production build
pnpm --filter wraps-website typecheck   # Type check
```

## Security findings

Vercel Security Review (wraps team, Agent settings) reviews each push to this project. Findings
live in the team's Vulnerabilities dashboard, never in public PRs; read them with
`vercel security vulnerabilities`. Verify each one against the code, then fix it through a normal
plan and review. Don't use "Fix with Vercel Agent".

Each review compares the push against the previous deployment, so it covers that diff, not the
whole app. "No findings" on a push says nothing about code it did not touch.
