# Wraps Auth (packages/auth)

Better-Auth configuration with Stripe billing, passkeys, 2FA, organizations, and device auth for CLI.

## Critical Rules

### 1. Stripe Plugin Is Conditionally Loaded

The Stripe plugin is only included when `STRIPE_SECRET_KEY` is set. This prevents build failures in environments without Stripe (CI, static generation).

```typescript
// How it works (in index.ts)
const stripeClient = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { ... })
  : null;

plugins: [
  // ... other plugins always loaded
  ...(stripeClient ? [stripe({ ... })] : []),  // Conditional spread
]
```

Never reference the Stripe plugin unconditionally.

### 2. Use databaseHooks, NOT Response Hooks

Better-Auth's response-level `after` hooks are **skipped for OAuth redirect responses** (Google, GitHub callbacks). Use `databaseHooks` for anything that must run on every signup path.

```typescript
// BAD - skipped for OAuth signups
hooks: {
  after: [{ matcher: (ctx) => ctx.path === "/sign-up", handler: trackSignup }]
}

// GOOD - runs for ALL signup methods
databaseHooks: {
  user: {
    create: {
      after: async (user, context) => { trackSignup(user); }
    }
  }
}
```

### 3. Never Throw from Tracking Code

Tracking/analytics failures must not break the auth flow.

```typescript
// GOOD
try {
  await trackUserSignup(user, attribution);
} catch (error) {
  console.error("Tracking failed:", error);
  // Don't re-throw
}

// ALSO GOOD
await Promise.allSettled([
  trackUserSignup(user),
  capturePostHog(user.id, "user_signed_up", props),
]);
```

### 4. PostHog Host URL Handling

`NEXT_PUBLIC_POSTHOG_HOST` may be `/ingest` (client-side proxy). Server-side code must resolve to the full URL.

```typescript
function getPostHogHost(): string {
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (!host || host.startsWith("/")) return "https://us.i.posthog.com";
  return host;
}
```

### 5. Bumping better-auth (or any @better-auth/* plugin)

The 1.7.1 bump (2026-09-14) added a required `account.issuer` field our Drizzle
schema lacked. Every signup and OAuth sign-in threw inside the adapter for nine
days: typecheck, tests and CI were green, and better-auth swallowed the error.

- `auth-schema-parity.test.ts` fails if the installed version expects any model
  or field the Drizzle schema lacks. Add the columns in `packages/db` and run
  `db:generate` — CI fails a schema change with no migration, because
  self-hosters only get columns through migrations.
- `account-schema-db`, `scim-provisioning-db` and `org-invitation-db` drive
  signup, SCIM and invites through the real adapter. Keep them green.
- Bump every `@better-auth/*` package and the `better-auth` catalog entry to the
  same version, then check `pnpm-workspace.yaml` `overrides:` for pins below
  what the new core requires (zod, `@better-fetch/fetch`, `better-call`).
- Run `pnpm --filter @wraps/web build` before pushing. A dependency ceiling
  shows up only there, never in typecheck or vitest.
- `logger.log` routes better-auth's internally caught errors to Sentry
  (`logAuthEvent`). Do not remove it.

## Architecture

### Plugins
- `nextCookies()` - Next.js cookie handling
- `haveIBeenPwned()` - Password breach detection
- `lastLoginMethod()` - Track last auth method
- `passkey()` - WebAuthn/passkey support
- `twoFactor()` - TOTP 2FA
- `organization()` - Multi-org support
- `bearer()` - Bearer token auth (API clients)
- `deviceAuthorization()` - Device flow for CLI (restricted to `wraps-cli` client)
- `stripe()` - Billing (conditional, see above)

### Database Hooks
| Hook | Purpose |
|------|---------|
| `user.create.after` | Track signup (PostHog + Platform API), parse attribution cookie |
| `session.create.before` | Auto-set `activeOrganizationId` to user's first org |
| `session.create.after` | Send login alert SMS for new devices (if enabled) |

### Key Exports
```typescript
import { auth, subscriptionPlans, stripeClient } from "@wraps/auth";
```

This package is server-only — it has no client entrypoint. Client components use
the better-auth React client in `apps/web/src/lib/auth-client.ts`.

## Subscription Plans

Three tiers: `starter`, `growth`, `scale`. Limits use `-1` for unlimited.

```typescript
{
  name: "starter",
  limits: {
    emails: -1,          // Unlimited (they pay AWS)
    awsAccounts: 1,
    aiMessages: 50,
    bulkBatchSize: 100,
    members: -1,         // Unlimited
  }
}
```

## Stripe Webhooks (stripe-webhooks.ts)

| Event | Handler | Action |
|-------|---------|--------|
| `invoice.payment_failed` | `handlePaymentFailed` | Email org admins |
| `checkout.session.completed` | `handleCheckoutCompleted` | Set annual flag, emit `subscription.activated` |
| `customer.subscription.created` | `handleSubscriptionCreated` | Set annual billing flag |
| `customer.subscription.deleted` | `handleSubscriptionDeleted` | Emit `subscription.canceled` |
| `customer.subscription.updated` | `handleSubscriptionUpdated` | Detect upgrade/downgrade, emit event |

All handlers use `getSubscriptionOrgAdmins(query)` to find the subscription, org, and admin members.

### Gotcha: Subscription Race Condition
`customer.subscription.created` fires before better-auth creates the DB record. The handler gracefully handles missing subscriptions — `checkout.session.completed` acts as a fallback.

## Attribution Tracking

Cookie `wraps_attribution` is parsed on signup:
```typescript
{ utm_source, utm_medium, utm_campaign, utm_content, utm_term, ref, referrer, landing_page, timestamp }
```

Signup method is detected from the auth callback path (`/callback/google`, `/callback/github`, etc.).

## Commands

```bash
pnpm --filter @wraps/auth test        # Run tests
pnpm --filter @wraps/auth test:watch   # Watch mode
pnpm --filter @wraps/auth dev          # Stripe webhook listener (forwards to localhost:3000)
```

## How It's Consumed

**apps/web** (API routes):
```typescript
import { auth } from "@wraps/auth";
import { toNextJsHandler } from "better-auth/next-js";
export const { GET, POST } = toNextJsHandler(auth);  // Exposes /api/auth/*
```

**apps/web** (server components/actions):
```typescript
import { auth } from "@wraps/auth";
const session = await auth.api.getSession({ headers: await headers() });
```

**apps/web** (client components) — do NOT import `@wraps/auth` here, it is
server-only. Use the shared better-auth React client:
```typescript
import { authClient } from "@/lib/auth-client";
```
