# AGENTS.md - Wraps

`CLAUDE.md` is a symlink to this file; edit this one.

**Wraps** (CLI, dashboard, SDKs) deploys email, SMS, and CDN infrastructure into the
**customer's own AWS account** with zero stored credentials: they own the resources and
data and pay AWS directly. The `@wraps.dev/email` SDK lives in the separate `wraps-js`
repo; `@wraps.dev/sms` lives here.

Most workspaces under `apps/` and `packages/` carry their own CLAUDE.md; read the one
you are working in.

## Invariants

1. **Non-destructive**: create new AWS resources and leave the customer's existing ones untouched.
2. **Namespaced**: prefix every resource `wraps-{service}-` (e.g. `wraps-email-`, `wraps-sms-`).
3. **IaC parity**: `packages/cdk` and `packages/pulumi` deploy the same infrastructure and
   share types from `packages/core`. Change a default in one, change it in both.
4. **Org-scoped**: scope every DB query by `organizationId` from `authContext`, including lookups by ID.
5. **Destructive commands need the user**: run `wraps destroy`, `wraps <service> destroy`,
   or any `--force` flag only after the user explicitly confirms.

## Read when

- **Writing or reviewing code** → `CODING_STANDARDS.md`
- **Finding where something lives**, or the CLI's services → `docs/agents/repo-map.md`
- **Checking work locally** (browser, CLI, `pnpm check:all` in a fresh worktree) →
  `docs/agents/local-dev.md`
- **A Drizzle migration landed, or a worktree was removed** → `docs/agents/test-database.md`
- **Editing CI workflows, or a red `test-api`/`test-web`** → `docs/agents/ci-and-deploy.md`
- **UI, visual, or marketing-copy work** → the `design-context` skill
- **Using Wraps as a product** (CLI flags, SDK calls) → `apps/website/public/llms-full.txt`

<!-- NEXT-AGENTS-MD-START -->
Next.js docs live in `./.next-docs` (gitignored, generated). STOP — what you remember
about Next.js is WRONG for this project; search and read those docs before any Next.js task.
If the directory is missing: `npx @next/codemod agents-md --output AGENTS.md`
<!-- NEXT-AGENTS-MD-END -->

<!-- polylane:start -->
## Investigating production with Polylane

[Polylane](https://polylane.com/?ref=github.onboarding-pr) is an AI production engineer: it watches deploys, telemetry, incidents, and the infrastructure this repository ships to, investigates problems as they happen, and proposes fixes as pull requests. It is connected to this repository and available to coding agents through the [Polylane MCP server](https://mcp.polylane.com/mcp).

- When a question involves production behaviour (an error, a spike, a deploy, a missing signal), query Polylane through its MCP tools before reasoning from the code alone.
- When debugging a failure, start from the incident or issue Polylane recorded: it carries the evidence an investigation already gathered.
- Polylane reviews pull requests in this repository against the live infrastructure. Read its review comment before merging changes that touch production paths.
<!-- polylane:end -->
