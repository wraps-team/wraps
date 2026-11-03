# Wraps API

Elysia.js API running on AWS Lambda.

## Required Reading

**Before writing any API code, read:** `/.claude/skills/wraps-api-developer/SKILL.md`

## Critical Rules

### 1. ALWAYS Await Async Operations

Lambda terminates when the handler returns. Fire-and-forget = dead code.

```typescript
// BAD - Lambda kills this
emitTopicSubscribed({ ... }).catch(console.error);

// GOOD - Awaited
await emitTopicSubscribed({ ... }).catch(console.error);

// GOOD - Parallel awaits
await Promise.all([
  emitContactCreated({ ... }),
  checkSegmentEntry({ ... }),
]).catch(console.error);
```

### 2. Always Scope by Organization

```typescript
// BAD - Security hole
const contact = await db.select().from(contact).where(eq(contact.id, id));

// GOOD - Scoped
const contact = await db.select().from(contact).where(
  and(eq(contact.id, id), eq(contact.organizationId, authContext.organizationId))
);
```

### 3. REST Semantics

- **PATCH** = Add/modify without removing existing data
- **PUT** = Replace entirely

### 4. Emit Workflow Events

| Action | Events to Emit |
|--------|----------------|
| Contact created | `emitContactCreated`, `checkSegmentEntry`, `emitTopicSubscribed` (if topics) |
| Contact updated | `emitContactUpdated`, `checkSegmentEntry`, `checkSegmentExit` |
| Topic subscribed | `emitTopicSubscribed` |
| Topic unsubscribed | `emitTopicUnsubscribed` |
| Topics replaced (PUT) | `emitTopicSubscribed` (new), `emitTopicUnsubscribed` (removed), segment checks |

## Commands

```bash
# Typecheck
pnpm --filter @wraps/api typecheck

# Run tests
pnpm --filter @wraps/api test

# Run specific test
pnpm --filter @wraps/api test:coverage src/__tests__/my-test.test.ts
```

## Auth Middleware

Two auth methods, both via `Authorization: Bearer <token>`:

1. **API Keys** (`wraps_*` prefix) — SHA256 hashed in DB, checked against `api_key` table
2. **Session Tokens** — better-auth session lookup with org membership JOIN

```typescript
type AuthContext = {
  apiKeyId: string | null;      // Set if API key auth
  organizationId: string;        // Always set
  userId: string | null;         // the session's user, or an API key's creator (null if gone); use apiKeyId to tell a key from a session
  planId: string | null;         // null if no valid subscription
};
```

Access via `ctx.auth` in authenticated routes. Use `createAuthenticatedRoutes()` to create route groups with auth middleware.

## Key Files

- `src/routes/` - API route handlers
- `src/services/workflow-events.ts` - Event emission helpers
- `src/middleware/auth.ts` - Authentication middleware
