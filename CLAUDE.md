# CLAUDE.md - Wraps Project Context

## Workflow

Before modifying any code, read all relevant files and understand the full execution flow first. Do not start making changes while still exploring the codebase. If the task is complex, use a Task agent to explore the codebase before writing any code.

## Error Handling

When implementing new features that involve external API calls (e.g., AWS SDK, Vercel API), always wrap each API call with specific error handling that distinguishes between different error types (e.g., NotFound vs CredentialsError vs PermissionDenied). Never use generic catch-all error messages.

When implementing multi-step features (e.g., create resource -> save state -> use resource), ensure each step's side effects are persisted before proceeding to the next step. Specifically: save all critical state (IDs, external references) immediately after creation, before any subsequent operations that might fail.

## Project Overview

**Wraps** is a CLI tool, web platform, and TypeScript SDK that deploys communication infrastructure (email via AWS SES, SMS via AWS End User Messaging, CDN via S3+CloudFront) to users' AWS accounts with zero stored credentials, beautiful developer experience, and AWS pricing.

**The Wraps Model**: Deploy infrastructure to the user's AWS account (not ours). Users own their infrastructure and data, pay AWS directly at transparent pricing, no vendor lock-in. We provide tooling, dashboard, and great DX.

**TypeScript SDKs** (all under `@wraps.dev`): `@wraps.dev/email` (separate repo: `wraps-js`), `@wraps.dev/sms`

## Architecture Overview

Turborepo monorepo with pnpm 10 workspaces. Each package has its own CLAUDE.md with detailed context.

- **`apps/api`** — Elysia.js API on AWS Lambda (via SST), better-auth, Neon PostgreSQL via Drizzle ORM
- **`apps/web`** — Next.js 16 dashboard (App Router, React 19, Tailwind 4, shadcn/ui, TanStack Form/Query)
- **`apps/website`** — Next.js 16 marketing site and docs
- **`packages/cli`** — CLI (`@wraps.dev/cli`): Clack prompts, Pulumi infrastructure stacks, tsup bundler
- **`packages/db`** — Drizzle ORM schemas and migrations (Neon PostgreSQL)
- **`packages/auth`** — better-auth config with Stripe webhooks
- **`packages/core`** — Shared types, utilities, and Lambda code
- **`packages/ui`** — Shared shadcn/ui components
- **`packages/email`** — Internal email utilities (React Email templates)

Multi-service CLI architecture: `wraps <service> <command>` (email, sms, cdn, auth). See `cli-commands` skill for detailed reference.

## Critical Design Principles

1. **Non-Destructive**: Never modify existing AWS resources
2. **Namespace Everything**: All resources prefixed with `wraps-{service}-` (e.g., `wraps-email-`, `wraps-sms-`)
3. **Fail Fast**: Validate early, deploy confidently
4. **Great UX**: Beautiful output, clear errors, helpful suggestions
5. **Type-Safe**: Strict TypeScript throughout

## Banned Dependencies

Enforced by `baseline.toml` (CI will fail):
- **axios** — use native `fetch()`
- **moment** / **dayjs** — use `date-fns` or `Intl` API
- **next/router** — use `next/navigation` (App Router)
- **@radix-ui/\*** directly in `apps/` — import from `components/ui/` (shadcn wrappers)
- **react-hook-form** / **@hookform/resolvers** — use `@tanstack/react-form`

## Security Patterns

- **SSRF Validation**: Webhook URLs must call `validateWebhookUrl()` before HTTP requests
- **Timing-Safe Secrets**: Use `timingSafeEqual()` for webhook secrets, API keys, tokens — never `===`
- **Cross-Org IDOR Prevention**: All DB queries must scope by `organizationId` from `authContext` — never query by ID alone
- **Resource Ownership Validation**: Verify user-provided `awsAccountId` belongs to authenticated org before use

See package-level CLAUDE.md files for specific enforcement patterns.

## Code Style

- ESM modules only — no `require()` or `module.exports`
- Use `@ts-expect-error` instead of `@ts-ignore`
- Structured logging only — never `console.log` in production code paths
  - `apps/web`: Pino logger at `src/lib/logger.ts`
  - `apps/api`: Custom JSON logger at `src/lib/logger.ts`
- Design system: no arbitrary hex colors in `apps/web/` — use semantic theme tokens (`bg-background`, `text-foreground`)

## Environment Setup

Prerequisites: Node.js 22+, pnpm 10+, AWS CLI configured

```bash
pnpm install           # Install dependencies
pnpm build             # Build all packages
pnpm dev               # Watch mode (all packages)
pnpm sst:dev           # Run SST dev (API Lambda + linked resources)
pnpm cli email status  # Run CLI (auto-points at local API/app)
```

| Variable | Default (via `pnpm cli`) | Production |
|---|---|---|
| `WRAPS_API_URL` | `http://localhost:3001` | `https://api.wraps.dev` |
| `WRAPS_APP_URL` | `http://localhost:3000` | `https://app.wraps.dev` |

```bash
pnpm test              # Run all tests
pnpm test:ee           # Run enterprise edition tests
pnpm check             # Lint check (ultracite + biome)
pnpm fix               # Auto-fix lint issues
pnpm check:all         # Full CI check: lint -> typecheck -> baseline -> build -> test
```

## Design Context

### Users
Developers deploying communication infrastructure (email, SMS, CDN) to their own AWS accounts. They value ownership, transparency, and control over their stack. They arrive wanting to ship quickly and leave knowing exactly what was deployed, what it costs, and how to use it. Ranges from solo devs to platform engineers at growing companies.

### Brand Personality
**Bold, Developer-first, Honest.** Wraps doesn't hide behind abstractions — it shows you your infrastructure, your pricing, your data. The voice is direct and confident without being arrogant. Technical precision over marketing fluff.

### Emotional Hierarchy
1. **Control** (brand promise) — "I own my infra, I see what's happening, nothing is hidden"
2. **Clarity** (UX principle) — "No overwhelm, clear next steps, I know where I stand"
3. **Speed** (onboarding hook) — "This just works, I'm shipping in minutes not days"
4. **Power** (assumed) — serious capability is the baseline, not the selling point

### Aesthetic Direction
- **Visual tone**: Polished monochrome with orange accent for action and energy. Premium but not precious — closer to Vercel/Linear confidence than Stripe warmth
- **References**: Vercel (polish, monochrome discipline), Linear (interaction quality), Stripe (docs clarity, product messaging), Resend (developer-first warmth)
- **Anti-references**: Overly playful/cartoon-ish cloud platforms, cluttered AWS console aesthetics, generic SaaS dashboards with gratuitous gradients
- **Theme**: Light and dark mode with full parity. OKLch color space for perceptual consistency
- **Surface treatment**: Grain textures and glassmorphism on marketing; clean flat surfaces in dashboard

### Design Principles
1. **Show, don't obscure** — Surface infrastructure state, costs, and status directly. Never hide information behind extra clicks when it fits in context.
2. **Monochrome + orange** — Grayscale carries the UI; orange is reserved for primary actions, status changes, and interactive affordances. Use it sparingly so it always means "act here."
3. **Dense but not cluttered** — Developers prefer information density. Pack data in, but use whitespace and typography hierarchy to keep it scannable.
4. **Semantic tokens only** — No arbitrary colors in components. Every color comes from the theme system so light/dark mode and future theming work automatically.
5. **Motion with purpose** — Animations serve comprehension (fade-in for progressive disclosure, transitions for state changes). Never decorative motion. Respect `prefers-reduced-motion`.

### Accessibility
- WCAG AA compliance as baseline (4.5:1 contrast for text, 3:1 for large text and UI components)
- Keyboard navigation for all interactive elements
- Screen reader support with semantic HTML and ARIA where needed
- `prefers-reduced-motion` respected — disable non-essential animations

### Design System Inventory
- **Colors**: OKLch-based CSS custom properties, grayscale primary, orange-500 accent, 5-color chart palette
- **Typography**: Space Grotesk (website headings) / Geist (dashboard headings), Inter (body), JetBrains Mono (code)
- **Components**: shadcn/ui with CVA variants, custom section components for marketing
- **Radius**: 10px base (`--radius: 0.625rem`) with sm/md/lg/xl variants
- **Animations**: fade-in-up (0.6s), fade-in-down (0.5s), shimmer, logo-scroll — all ease-out

<!-- NEXT-AGENTS-MD-START -->[Next.js Docs Index]|root: ./.next-docs|STOP. What you remember about Next.js is WRONG for this project. Always search docs and read before any task.|If docs missing, run this command first: npx @next/codemod agents-md --output CLAUDE.md|01-app:{glossary.mdx}|01-app/01-getting-started:{01-installation.mdx,02-project-structure.mdx,03-layouts-and-pages.mdx,04-linking-and-navigating.mdx,05-server-and-client-components.mdx,06-cache-components.mdx,07-fetching-data.mdx,08-updating-data.mdx,09-caching-and-revalidating.mdx,10-error-handling.mdx,11-css.mdx,12-images.mdx,13-fonts.mdx,14-metadata-and-og-images.mdx,15-route-handlers.mdx,16-proxy.mdx,17-deploying.mdx,18-upgrading.mdx}|01-app/02-guides:{analytics.mdx,authentication.mdx,backend-for-frontend.mdx,caching.mdx,ci-build-caching.mdx,content-security-policy.mdx,css-in-js.mdx,custom-server.mdx,data-security.mdx,debugging.mdx,draft-mode.mdx,environment-variables.mdx,forms.mdx,incremental-static-regeneration.mdx,instrumentation.mdx,internationalization.mdx,json-ld.mdx,lazy-loading.mdx,local-development.mdx,mcp.mdx,mdx.mdx,memory-usage.mdx,multi-tenant.mdx,multi-zones.mdx,open-telemetry.mdx,package-bundling.mdx,prefetching.mdx,production-checklist.mdx,progressive-web-apps.mdx,redirecting.mdx,sass.mdx,scripts.mdx,self-hosting.mdx,single-page-applications.mdx,static-exports.mdx,tailwind-v3-css.mdx,third-party-libraries.mdx,videos.mdx}|01-app/02-guides/migrating:{app-router-migration.mdx,from-create-react-app.mdx,from-vite.mdx}|01-app/02-guides/testing:{cypress.mdx,jest.mdx,playwright.mdx,vitest.mdx}|01-app/02-guides/upgrading:{codemods.mdx,version-14.mdx,version-15.mdx,version-16.mdx}|01-app/03-api-reference:{07-edge.mdx,08-turbopack.mdx}|01-app/03-api-reference/01-directives:{use-cache-private.mdx,use-cache-remote.mdx,use-cache.mdx,use-client.mdx,use-server.mdx}|01-app/03-api-reference/02-components:{font.mdx,form.mdx,image.mdx,link.mdx,script.mdx}|01-app/03-api-reference/03-file-conventions/01-metadata:{app-icons.mdx,manifest.mdx,opengraph-image.mdx,robots.mdx,sitemap.mdx}|01-app/03-api-reference/03-file-conventions:{default.mdx,dynamic-routes.mdx,error.mdx,forbidden.mdx,instrumentation-client.mdx,instrumentation.mdx,intercepting-routes.mdx,layout.mdx,loading.mdx,mdx-components.mdx,not-found.mdx,page.mdx,parallel-routes.mdx,proxy.mdx,public-folder.mdx,route-groups.mdx,route-segment-config.mdx,route.mdx,src-folder.mdx,template.mdx,unauthorized.mdx}|01-app/03-api-reference/04-functions:{after.mdx,cacheLife.mdx,cacheTag.mdx,connection.mdx,cookies.mdx,draft-mode.mdx,fetch.mdx,forbidden.mdx,generate-image-metadata.mdx,generate-metadata.mdx,generate-sitemaps.mdx,generate-static-params.mdx,generate-viewport.mdx,headers.mdx,image-response.mdx,next-request.mdx,next-response.mdx,not-found.mdx,permanentRedirect.mdx,redirect.mdx,refresh.mdx,revalidatePath.mdx,revalidateTag.mdx,unauthorized.mdx,unstable_cache.mdx,unstable_noStore.mdx,unstable_rethrow.mdx,updateTag.mdx,use-link-status.mdx,use-params.mdx,use-pathname.mdx,use-report-web-vitals.mdx,use-router.mdx,use-search-params.mdx,use-selected-layout-segment.mdx,use-selected-layout-segments.mdx,userAgent.mdx}|01-app/03-api-reference/05-config/01-next-config-js:{adapterPath.mdx,allowedDevOrigins.mdx,appDir.mdx,assetPrefix.mdx,authInterrupts.mdx,basePath.mdx,browserDebugInfoInTerminal.mdx,cacheComponents.mdx,cacheHandlers.mdx,cacheLife.mdx,compress.mdx,crossOrigin.mdx,cssChunking.mdx,devIndicators.mdx,distDir.mdx,env.mdx,expireTime.mdx,exportPathMap.mdx,generateBuildId.mdx,generateEtags.mdx,headers.mdx,htmlLimitedBots.mdx,httpAgentOptions.mdx,images.mdx,incrementalCacheHandlerPath.mdx,inlineCss.mdx,isolatedDevBuild.mdx,logging.mdx,mdxRs.mdx,onDemandEntries.mdx,optimizePackageImports.mdx,output.mdx,pageExtensions.mdx,poweredByHeader.mdx,productionBrowserSourceMaps.mdx,proxyClientMaxBodySize.mdx,reactCompiler.mdx,reactMaxHeadersLength.mdx,reactStrictMode.mdx,redirects.mdx,rewrites.mdx,sassOptions.mdx,serverActions.mdx,serverComponentsHmrCache.mdx,serverExternalPackages.mdx,staleTimes.mdx,staticGeneration.mdx,taint.mdx,trailingSlash.mdx,transpilePackages.mdx,turbopack.mdx,turbopackFileSystemCache.mdx,typedRoutes.mdx,typescript.mdx,urlImports.mdx,useLightningcss.mdx,viewTransition.mdx,webVitalsAttribution.mdx,webpack.mdx}|01-app/03-api-reference/05-config:{02-typescript.mdx,03-eslint.mdx}|01-app/03-api-reference/06-cli:{create-next-app.mdx,next.mdx}|02-pages/01-getting-started:{01-installation.mdx,02-project-structure.mdx,04-images.mdx,05-fonts.mdx,06-css.mdx,11-deploying.mdx}|02-pages/02-guides:{analytics.mdx,authentication.mdx,babel.mdx,ci-build-caching.mdx,content-security-policy.mdx,css-in-js.mdx,custom-server.mdx,debugging.mdx,draft-mode.mdx,environment-variables.mdx,forms.mdx,incremental-static-regeneration.mdx,instrumentation.mdx,internationalization.mdx,lazy-loading.mdx,mdx.mdx,multi-zones.mdx,open-telemetry.mdx,package-bundling.mdx,post-css.mdx,preview-mode.mdx,production-checklist.mdx,redirecting.mdx,sass.mdx,scripts.mdx,self-hosting.mdx,static-exports.mdx,tailwind-v3-css.mdx,third-party-libraries.mdx}|02-pages/02-guides/migrating:{app-router-migration.mdx,from-create-react-app.mdx,from-vite.mdx}|02-pages/02-guides/testing:{cypress.mdx,jest.mdx,playwright.mdx,vitest.mdx}|02-pages/02-guides/upgrading:{codemods.mdx,version-10.mdx,version-11.mdx,version-12.mdx,version-13.mdx,version-14.mdx,version-9.mdx}|02-pages/03-building-your-application/01-routing:{01-pages-and-layouts.mdx,02-dynamic-routes.mdx,03-linking-and-navigating.mdx,05-custom-app.mdx,06-custom-document.mdx,07-api-routes.mdx,08-custom-error.mdx}|02-pages/03-building-your-application/02-rendering:{01-server-side-rendering.mdx,02-static-site-generation.mdx,04-automatic-static-optimization.mdx,05-client-side-rendering.mdx}|02-pages/03-building-your-application/03-data-fetching:{01-get-static-props.mdx,02-get-static-paths.mdx,03-forms-and-mutations.mdx,03-get-server-side-props.mdx,05-client-side.mdx}|02-pages/03-building-your-application/06-configuring:{12-error-handling.mdx}|02-pages/04-api-reference:{06-edge.mdx,08-turbopack.mdx}|02-pages/04-api-reference/01-components:{font.mdx,form.mdx,head.mdx,image-legacy.mdx,image.mdx,link.mdx,script.mdx}|02-pages/04-api-reference/02-file-conventions:{instrumentation.mdx,proxy.mdx,public-folder.mdx,src-folder.mdx}|02-pages/04-api-reference/03-functions:{get-initial-props.mdx,get-server-side-props.mdx,get-static-paths.mdx,get-static-props.mdx,next-request.mdx,next-response.mdx,use-params.mdx,use-report-web-vitals.mdx,use-router.mdx,use-search-params.mdx,userAgent.mdx}|02-pages/04-api-reference/04-config/01-next-config-js:{adapterPath.mdx,allowedDevOrigins.mdx,assetPrefix.mdx,basePath.mdx,bundlePagesRouterDependencies.mdx,compress.mdx,crossOrigin.mdx,devIndicators.mdx,distDir.mdx,env.mdx,exportPathMap.mdx,generateBuildId.mdx,generateEtags.mdx,headers.mdx,httpAgentOptions.mdx,images.mdx,isolatedDevBuild.mdx,onDemandEntries.mdx,optimizePackageImports.mdx,output.mdx,pageExtensions.mdx,poweredByHeader.mdx,productionBrowserSourceMaps.mdx,proxyClientMaxBodySize.mdx,reactStrictMode.mdx,redirects.mdx,rewrites.mdx,serverExternalPackages.mdx,trailingSlash.mdx,transpilePackages.mdx,turbopack.mdx,typescript.mdx,urlImports.mdx,useLightningcss.mdx,webVitalsAttribution.mdx,webpack.mdx}|02-pages/04-api-reference/04-config:{01-typescript.mdx,02-eslint.mdx}|02-pages/04-api-reference/05-cli:{create-next-app.mdx,next.mdx}|03-architecture:{accessibility.mdx,fast-refresh.mdx,nextjs-compiler.mdx,supported-browsers.mdx}|04-community:{01-contribution-guide.mdx,02-rspack.mdx}<!-- NEXT-AGENTS-MD-END -->
