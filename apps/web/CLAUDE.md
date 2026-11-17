# Wraps Dashboard (apps/web)

Next.js 16 App Router dashboard with React 19, TanStack Form, React Email template editor, React Flow, and Drizzle ORM.

## Critical Rules

### 1. Scope Every Query by organizationId

Every database query filters by `organizationId`, lookups by ID included:
`and(eq(contact.id, id), eq(contact.organizationId, organizationId))`. A query without it
reads or writes another org's rows (invariant 4).

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
same transaction. The wrapper returns
`TResult | { success: false; error: string }`; the exact string returned for
an unauthorized org is exported as `UNAUTHORIZED` from `org-action.ts` — compare
against it instead of duplicating the literal.

Call raw `verifyOrgAccess` (`src/actions/shared/verify-org-access.ts`: checks
session + org membership, returns `null` if unauthorized) only for reads inside
a `page.tsx` server component. Mutations go through `orgAction`, because raw
`verifyOrgAccess` runs neither the permission check nor the audit write.

### 3. Revalidate by orgSlug

Dashboard pages live under `src/app/(dashboard)/[orgSlug]/`, so build revalidation
paths from the slug (`ctx.access.orgSlug`, e.g. `my-company`). A path built from
`organizationId` matches no page and revalidates nothing.

```typescript
revalidatePath(`/${ctx.access.orgSlug}/contacts`, "page");
```

### 4. Await Every Async Call

Server actions run on serverless, which may drop a promise nobody awaited, so await every
async call.

### 5. Log with Context Using Pino

`orgAction` already gives your handler `ctx.log` (a `createActionLogger`
instance scoped to the action name + `organizationId`) and logs unexpected
errors itself — manual try/catch + `createActionLogger`/`serializeError` is
only needed for code that runs outside the wrapper (e.g. route handlers,
`page.tsx` server components).

## Forms

Each form's Zod schema and TanStack `formOptions` live in `src/lib/forms/`: for example
`src/lib/forms/contact-form.ts`, which
`src/app/(dashboard)/[orgSlug]/contacts/components/contact-form-dialog.tsx` passes to
`useForm`. An `orgAction`-wrapped server action (rule 2) saves the data, e.g.
`createContact` in `src/actions/contacts.ts`.

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

## Testing

`pnpm --filter @wraps/web test` runs against a **real Postgres (Neon) database**,
not a mock. `vitest.config.ts` loads `apps/web/.env.test` (gitignored — you must
create it) and needs a working `DATABASE_URL`. Without it, tests fail with
opaque connection/query errors, not a helpful message.

- The suite runs as **two vitest projects**. `parallel` holds everything and
  runs files concurrently; `shared-fixtures` holds the thirteen files in
  `SHARED_FIXTURE_FILES` and runs serially. Any file that imports
  `src/app/api/__tests__/setup.ts`, by any path, must be listed, because that
  file's `afterAll` deletes the shared fixture rows; the other listed files are
  there for historical reasons. Isolation everywhere else
  comes from per-file fixture prefixes: `setupPermissionFixtures(filePrefix)`
  (`src/lib/permissions/__tests__/setup.ts`) builds every fixture ID from the
  file's prefix plus a per-run random suffix — **any new DB-touching test must
  namespace its fixtures the same way**, or it will collide under parallelism.
- Never run two vitest processes against the same database — check
  `ps aux | grep vitest` before blaming a flake.
- In a **linked git worktree**, `scripts/test-db/resolve-branch.mjs` gives the
  worktree its own Neon branch (`wt-<name>`) automatically, but only if
  `NEON_API_KEY` and `NEON_PROJECT_ID` are in the env that loads `.env.test`
  (the main checkout gets `wt-wraps` the same way). CI skips the resolver and
  runs on a per-run `ci-*` branch from `scripts/test-db/ci-branch.mjs`. Any
  resolver failure falls back to that base URL rather than erroring, so a
  worktree silently sharing the parent database is a real possibility.
- A `wt-*` branch expires 24h after its last test run, so reclaiming it after
  deleting a worktree is optional: `node scripts/test-db/reap-branches.mjs`.
- Default test environment is `node`; `src/components/**/*.test.{ts,tsx}` run in
  jsdom via `environmentMatchGlobs`.

## Security findings

Vercel Security Review (wraps team, Agent settings) reviews each push to this project. Findings
live in the team's Vulnerabilities dashboard, never in public PRs; read them with
`vercel security vulnerabilities`. Verify each one against the code, then fix it through a normal
plan and review. Don't use "Fix with Vercel Agent".

Each review compares the push against the previous deployment, so it covers that diff, not the
whole app. "No findings" on a push says nothing about code it did not touch.
