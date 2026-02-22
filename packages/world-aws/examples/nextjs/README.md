# Next.js + world-aws Example

Multi-step onboarding workflow using `"use workflow"` + `"use step"` directives with AWS DynamoDB + SQS.

## Setup

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Create AWS infrastructure:
   ```bash
   npx world-aws-setup --region us-east-1
   ```

3. Copy `.env.example` to `.env.local` and fill in your values.

4. Start the dev server:
   ```bash
   pnpm dev
   ```

5. Trigger the workflow:
   ```bash
   curl -X POST http://localhost:3000/api/start \
     -H "Content-Type: application/json" \
     -d '{"email": "user@example.com"}'
   ```

## Lambda Handler

`lambda.ts` is the SQS consumer that runs alongside your Next.js app as a separate Lambda function. Wire it to the `{prefix}-workflows` and `{prefix}-steps` SQS queues so workflow steps execute in the background.

```typescript
// lambda.ts
export const handler = createSQSHandler(serve(world));
```

Deploy this file as its own Lambda (e.g. via SST, CDK, or SAM) — it is not part of the Next.js server.
