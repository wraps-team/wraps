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

## Dependencies

`baseline.toml` bans these and CI fails on them; use the replacement:

- **HTTP**: native `fetch()` (not axios)
- **Dates**: `date-fns` or the `Intl` API (not moment / dayjs)
- **Routing**: `next/navigation`, App Router (not `next/router`)
- **Radix primitives in `apps/`**: the shadcn wrappers in `components/ui/` (not `@radix-ui/*` directly)
- **Forms**: `@tanstack/react-form` (not react-hook-form / `@hookform/resolvers`)

## Security

- **SSRF**: pass every webhook URL through `validateWebhookUrl()` before the HTTP request.
- **Timing-safe compares**: compare webhook secrets, API keys, and tokens with `timingSafeEqual()`.
- **Org scoping (IDOR)**: scope every DB query by `organizationId` from `authContext`, including lookups by ID.
- **Resource ownership**: verify a user-provided `awsAccountId` belongs to the authenticated org before using it.
- **AWS credentials**: keep them out of storage and logs.

## Code style

- ESM only: `import` / `export`.
- `@ts-expect-error` for suppressions (it fails once the error is gone; `@ts-ignore` does not).
- Log through the structured logger in production code paths:
  - `apps/web`: Pino logger at `src/lib/logger.ts`
  - `apps/api`: custom JSON logger at `src/lib/logger.ts`

## Design system

- Colour with semantic theme tokens (`bg-background`, `text-foreground`): brand orange is
  `brand`, status colours are `success`/`warning`/`info`/`destructive`. These replace
  palette colours (`orange-500`, `green-600`) and arbitrary hex values.
- Status badges use `<Badge variant="success|warning|info">`; brand CTAs use `<Button variant="brand">`.
- After touching `className` in `apps/web`, `apps/website`, `packages/ui`, or
  `packages/console`, run `pnpm lint:design` (oxlint + `@shadcn/lint`, config in
  `.oxlintrc.json`). It is gated by per-rule ceilings in `pnpm check:design` (part of
  `check:fast` and CI); when a sweep lands, paste the lowered numbers the script prints
  into `scripts/check-design-lint.mjs`.
