# Wraps API

Elysia.js API running on AWS Lambda.

## Required Reading

**Before writing any API code, read:** `/.claude/skills/wraps-api-developer.md`

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

## Key Files

- `src/routes/` - API route handlers
- `src/services/automation-events.ts` - Event emission helpers
- `src/middleware/auth.ts` - Authentication middleware
