# Coding standards

Rules for code written in this repo. Package-level CLAUDE.md files add the enforcement
patterns specific to each package.

## Error handling

Wrap each external API call (AWS SDK, Vercel API) with handling that distinguishes the
error types it can raise — NotFound vs CredentialsError vs PermissionDenied — and give
each its own message.

In multi-step features (create resource → save state → use resource), persist each
step's side effects before starting the next. Save critical state (IDs, external
references) immediately after creation, before any later operation that might fail.

## Banned dependencies

Enforced by `baseline.toml` (CI will fail):
- **axios** — use native `fetch()`
- **moment** / **dayjs** — use `date-fns` or `Intl` API
- **next/router** — use `next/navigation` (App Router)
- **@radix-ui/\*** directly in `apps/` — import from `components/ui/` (shadcn wrappers)
- **react-hook-form** / **@hookform/resolvers** — use `@tanstack/react-form`

## Security patterns

- **SSRF Validation**: Webhook URLs must call `validateWebhookUrl()` before HTTP requests
- **Timing-Safe Secrets**: Use `timingSafeEqual()` for webhook secrets, API keys, tokens — never `===`
- **Cross-Org IDOR Prevention**: All DB queries must scope by `organizationId` from `authContext` — never query by ID alone
- **Resource Ownership Validation**: Verify user-provided `awsAccountId` belongs to authenticated org before use
- **AWS credentials**: keep them out of storage and logs

## Code style

- ESM modules only — no `require()` or `module.exports`
- Use `@ts-expect-error` instead of `@ts-ignore`
- Structured logging only — never `console.log` in production code paths
  - `apps/web`: Pino logger at `src/lib/logger.ts`
  - `apps/api`: Custom JSON logger at `src/lib/logger.ts`

## Design system

- No arbitrary hex colors in `apps/web/` — use semantic theme tokens (`bg-background`, `text-foreground`)
- Brand orange is `brand`, status colours are `success`/`warning`/`info`/`destructive`;
  write these tokens, not palette colours (`orange-500`, `green-600`). Status badges use
  `<Badge variant="success|warning|info">`, brand CTAs use `<Button variant="brand">`.
- After touching `className` in `apps/web`, `apps/website`, `packages/ui`, or
  `packages/console`, run `pnpm lint:design` (oxlint + `@shadcn/lint`, config in
  `.oxlintrc.json`). It is gated by per-rule ceilings in `pnpm check:design` (part of
  `check:fast` and CI); when a sweep lands, paste the lowered numbers the script prints
  into `scripts/check-design-lint.mjs`.
