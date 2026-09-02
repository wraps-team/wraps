# Wraps Dashboard (apps/web)

Next.js 16 App Router dashboard with React 19, TanStack Form, React Email template editor, React Flow, and Drizzle ORM.

## Critical Rules

### 1. Always Scope Queries by organizationId

Every database query MUST filter by `organizationId`. Omitting this is a cross-org data leak.

```typescript
// BAD - security hole
const contacts = await db.query.contact.findMany({
  where: eq(contact.name, "John"),
});

// GOOD - scoped
const contacts = await db.query.contact.findMany({
  where: and(
    eq(contact.organizationId, organizationId),
    eq(contact.name, "John"),
  ),
});
```

### 2. Wrap Every Org-Scoped Server Action in `orgAction`

`orgAction` (`src/actions/shared/org-action.ts`) is the canonical wrapper. It
runs, in order: `verifyOrgAccess` (session + membership) → `checkPermission`
(RBAC) → optional `checkFeatureAccess` (plan gate) → your handler, with error
handling + Pino logging built in. Writing an action without it silently skips
the permission check and the in-transaction audit-log write.

```typescript
"use server";
import { orgAction } from "@/actions/shared/org-action";

export const createContact = orgAction(
  {
    name: "createContact",
    resource: "contacts",          // a ResourceName from @wraps/auth/access
    permission: ["write"],
    orgId: (organizationId: string) => organizationId,
    onError: "Failed to create contact",
    // feature: "someFeature",     // optional plan-gate
  },
  async (ctx, organizationId: string, data: Input) => {
    // ctx.access.{orgSlug,userId,userEmail,role}; ctx.log; ctx.audited
    const inserted = await ctx.audited(
      async (tx) => { /* ...insert within tx... */ return row; },
      (row) => ({ action: "contact.created", resource: "contacts", resourceId: row.id })
    );
    revalidatePath(`/${ctx.access.orgSlug}/contacts`, "page");
    return { success: true };
  }
);
```

`ctx.audited(fn, fields)` runs `fn(tx)` and writes the audit-log row in the
same transaction — see the `audit-coverage` skill. The wrapper returns
`TResult | { success: false; error: string }`; the exact string returned for
an unauthorized org is exported as `UNAUTHORIZED` from `org-action.ts` — compare
against it instead of duplicating the literal.

Use raw `verifyOrgAccess` (`src/actions/shared/verify-org-access.ts`, checks
session + org membership, returns `null` if unauthorized) ONLY for reads
inside a `page.tsx` server component, not for mutations.

### 3. Revalidate with orgSlug, Not organizationId

```typescript
// BAD - orgSlug is a slug like "my-company", not a UUID
revalidatePath(`/${organizationId}/contacts`, "page");

// GOOD
revalidatePath(`/${access.orgSlug}/contacts`, "page");
```

### 4. Await All Async Operations

Server actions run in Node.js serverless contexts. Fire-and-forget promises may not complete.

```typescript
// BAD
trackEvent(data); // no await = may not execute

// GOOD
await trackEvent(data);
```

### 5. Log with Context Using Pino

`orgAction` already gives your handler `ctx.log` (a `createActionLogger`
instance scoped to the action name + `organizationId`) and logs unexpected
errors itself — manual try/catch + `createActionLogger`/`serializeError` is
only needed for code that runs outside the wrapper (e.g. route handlers,
`page.tsx` server components).

## Server Action Pattern

The full pattern for form submissions:

**1. Schema** (`lib/forms/contact.ts`):
```typescript
import { z } from "zod";
import { formOptions } from "@tanstack/react-form";

export const createContactSchema = z.object({
  email: z.string().email().optional(),
  firstName: z.string().optional(),
});

export const createContactFormOpts = formOptions({
  defaultValues: { email: "", firstName: "" },
});
```

**2. Server action** (`actions/contacts.ts`):
```typescript
"use server";
import { orgAction } from "@/actions/shared/org-action";

export const createContact = orgAction(
  {
    name: "createContact",
    resource: "contacts",
    permission: ["write"],
    orgId: (organizationId: string) => organizationId,
    onError: "Failed to create contact",
  },
  async (ctx, organizationId: string, data: Input) => {
    // validate → check limits → insert (ctx.audited for the write) → revalidate → return
  }
);
```

**3. Client form** — uses `useActionState` + `useForm` from TanStack Form + `mergeForm`/`useTransform` for server state sync.

## Route Groups

| Group | Purpose | Providers |
|-------|---------|-----------|
| `(auth)` | Sign in, sign up, password reset | None (centered card layout) |
| `(dashboard)` | Main app — templates, contacts, workflows, settings | `OrganizationProvider`, `SidebarProvider`, `QueryProvider` |
| `(onboarding)` | Step-by-step setup wizard | None (header + footer) |
| `(public)` | Unsubscribe, preference centers (from email links) | None, `robots: "noindex"` |
| `(subscription)` | Upgrade, billing | Org membership check only |

## Key Directories

| Path | Purpose |
|------|---------|
| `src/actions/` | Server actions (contacts, templates, workflows, orgs, etc.) |
| `src/app/(dashboard)/[orgSlug]/` | Dashboard pages |
| `src/components/(ee)/workflow-builder/` | Workflow builder (React Flow + Zustand) |
| `src/components/template-editor/` | Email template editor (React Email TSX + AI chat) |
| `src/hooks/` | Custom hooks (template queries, org context, etc.) |
| `src/lib/` | Utilities (auth, logger, contacts, validation, serializers) |
| `src/lib/forms/` | Zod schemas + TanStack Form options |

## Template Editor

- React Email TSX source edited in Monaco, with an AI chat panel that writes the source
- Source compiles to `compiledHtml` / `compiledText` on save (`lib/compile-template.ts`)
- Variables: `{{variableName}}` or `{{variableName|fallback}}` for SES substitution
- `transformVariablesForSes(html)` flattens nested vars: `{{contact.email}}` to `{{contactEmail}}`
- SMS templates are separate — no SES publishing needed

## Workflow Builder

- `@xyflow/react` (React Flow v12) for visual canvas
- Zustand store in `use-workflow-store.ts` manages all state
- `validateWorkflow(steps, transitions)` returns `{ isValid, errors, errorsByNodeId }`
- **Cascade nodes**: Single UI node that expands to multiple primitives (send + condition + wait) on save

## Data Fetching

- **Server components**: Direct Drizzle queries in `page.tsx` files
- **Client components**: `@tanstack/react-query` with server action query functions
- **Mutations**: Always via server actions (never direct API calls from client)

## AWS Credential Pattern

Never stores customer AWS credentials. Instead:
1. Customer deploys IAM role via CLI
2. Backend calls STS `AssumeRole` with external ID
3. Gets 1-hour temporary credentials, cached for 50 minutes

## Commands

```bash
pnpm --filter @wraps/web dev         # Dev server on :3000
pnpm --filter @wraps/web test        # Run tests
pnpm --filter @wraps/web test:ee     # Enterprise tests only
pnpm --filter @wraps/web typecheck   # Type check
```

## Testing

`pnpm --filter @wraps/web test` runs against a **real Postgres (Neon) database**,
not a mock. `vitest.config.ts` loads `apps/web/.env.test` (gitignored — you must
create it) and needs a working `DATABASE_URL`. Without it, tests fail with
opaque connection/query errors, not a helpful message.

- The suite runs **serially** (`fileParallelism: false`) because tests share one
  database and clean up in `afterEach`. Never run two vitest processes against
  the same database — check `ps aux | grep vitest` before blaming a flake.
- In a **linked git worktree**, `scripts/test-db/resolve-branch.mjs` gives the
  worktree its own Neon branch (`wt-<name>`) automatically, but only if
  `NEON_API_KEY` and `NEON_PROJECT_ID` are in the env that loads `.env.test`.
  The main checkout and CI always use `.env.test`'s `DATABASE_URL` as-is. Any
  resolver failure falls back to that base URL rather than erroring, so a
  worktree silently sharing the main branch is a real possibility.
- After deleting a worktree, reclaim its branch:
  `node scripts/test-db/reap-branches.mjs`.
- Default test environment is `node`; `src/components/**/*.test.{ts,tsx}` run in
  jsdom via `environmentMatchGlobs`.
