# Wraps Dashboard (apps/web)

Next.js 16 App Router dashboard with React 19, TanStack Form, TipTap editor, React Flow, and Drizzle ORM.

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

### 2. Always Call verifyOrgAccess First

Every server action must verify the user has access to the organization before doing anything.

```typescript
"use server";

export async function myAction(organizationId: string, data: Input) {
  const access = await verifyOrgAccess(organizationId);
  if (!access) return { success: false, error: "No access" };

  // access.userId, access.orgSlug, access.role are now available
  // ... do work ...

  revalidatePath(`/${access.orgSlug}/contacts`, "page");
  return { success: true };
}
```

`verifyOrgAccess` is in `src/lib/auth.ts`. It checks session + org membership. Returns `null` if unauthorized.

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

```typescript
import { createActionLogger, serializeError } from "@/lib/logger";

export async function myAction(organizationId: string) {
  const log = createActionLogger("myAction", { organizationId });
  try {
    // ...
    log.info({ contactId }, "Contact created");
    return { success: true };
  } catch (error) {
    log.error({ err: serializeError(error) }, "Failed to create contact");
    return { success: false, error: "Internal error" };
  }
}
```

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
export async function createContact(organizationId: string, data: Input) {
  const access = await verifyOrgAccess(organizationId);
  if (!access) return { success: false, error: "No access" };
  // validate → check limits → insert → revalidate → return
}
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
| `src/components/(ee)/automation-builder/` | Automation builder (React Flow + Zustand) |
| `src/components/template-editor/` | Email template editor (TipTap + React Email) |
| `src/hooks/` | Custom hooks (template queries, org context, etc.) |
| `src/lib/` | Utilities (auth, logger, contacts, validation, serializers) |
| `src/lib/forms/` | Zod schemas + TanStack Form options |

## Template Editor

- TipTap editor with custom extensions for email-safe HTML
- `tiptapToReactEmail(content, testData, options)` converts to React Email JSX
- Variables: `{{variableName}}` or `{{variableName|fallback}}` for SES substitution
- `transformVariablesForSes(html)` flattens nested vars: `{{contact.email}}` to `{{contactEmail}}`
- SMS templates are separate — no SES publishing needed

## Workflow Builder

- `@xyflow/react` (React Flow v12) for visual canvas
- Zustand store in `use-automation-store.ts` manages all state
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
