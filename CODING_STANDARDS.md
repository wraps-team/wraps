# Coding standards

Package-level CLAUDE.md files add the patterns specific to each package. Banned
dependencies, ESM, `@ts-expect-error`, and hex colours are enforced by `baseline.toml`,
whose errors name the replacement.

## Error handling

Wrap each external API call (AWS SDK, Vercel API) with handling that distinguishes the
error types it can raise — NotFound vs CredentialsError vs PermissionDenied — and give
each its own message.

In multi-step features (create resource → save state → use resource), persist each
step's side effects before starting the next. Save critical state (IDs, external
references) immediately after creation, before any later operation that might fail.

## Security

Org scoping is an invariant in `AGENTS.md`. Alongside it:

- **SSRF**: pass every webhook URL through `validateWebhookUrl()` before the HTTP request.
- **Timing-safe compares**: compare webhook secrets, API keys, and tokens with `timingSafeEqual()`.
- **Resource ownership**: verify a user-provided `awsAccountId` belongs to the authenticated org before using it.
- **AWS credentials**: keep them out of storage and logs.

## Logging

Log through the structured logger in production code paths: `src/lib/logger.ts` in
`apps/web` (Pino) and `apps/api` (custom JSON).

## Design system

- Colour with semantic theme tokens (`bg-background`, `text-foreground`): brand orange is
  `brand`, status colours are `success`/`warning`/`info`/`destructive`. These replace
  palette colours (`orange-500`, `green-600`).
- Status badges use `<Badge variant="success|warning|info">`; brand CTAs use `<Button variant="brand">`.
- After touching `className` in `apps/web`, `apps/website`, `packages/ui`, or
  `packages/console`, run `pnpm lint:design`. `pnpm check:design` (part of `check:fast`
  and CI) gates it by per-rule ceilings; when a sweep lands, paste the lowered numbers the
  script prints into `scripts/check-design-lint.mjs`.
