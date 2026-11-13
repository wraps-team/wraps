# CLI Package Context

## Command Pattern

Every command is an async function that takes a typed options object:

```typescript
export async function commandName(options: CommandOptions): Promise<void> {
  const progress = new DeploymentProgress();
  // ...
}
```

- Export a single async function per command file
- No class wrappers — pure functions
- Errors bubble to `handleCLIError()` in `cli.ts`
- All imports are explicit path imports (no barrel re-exports from index.ts)

## CLI Router (`src/cli.ts`)

1. Parse args with `parseCliArgs(process.argv)` (mri-backed) → `{ flags, sub }`
2. Check global flags (`--help`, `--version`, `--json`) before routing
3. Interactive menu if no command provided
4. Route by service: `if (primaryCommand === "email") { switch(subCommand) { ... } }`
5. Track command execution with `trackCommand()` (duration, success, service)
6. Call `telemetry.shutdown()` before exit

## Output & Spinners

Use `DeploymentProgress` from `utils/shared/output.ts` for all user-facing output:

- `progress.execute(message, fn)` — run async fn with spinner
- `progress.succeed/fail/info/step(message)` — manual output
- Auto-suppresses visual output in JSON mode (`--json` flag)

For interactive prompts, use `@clack/prompts`:

- `clack.select()` — radio button selection
- `clack.confirm()` — yes/no
- `clack.text()` — text input
- Always check `clack.isCancel()` after each prompt

Use `pc` (picocolors) for text formatting: `pc.bold()`, `pc.cyan()`, `pc.dim()`.

## JSON Output Mode

- `setJsonMode(flags.json)` early in cli.ts
- `isJsonMode()` returns current state
- Use `jsonSuccess()` / `jsonError()` for structured responses
- DeploymentProgress auto-suppresses in JSON mode

## Error Handling

Use `WrapsError` from `utils/shared/errors.ts`:

```typescript
throw errors.noAWSCredentials(); // Factory function with code, message, suggestion, docsUrl
```

- Include error code (for telemetry), message (for user), suggestion (for fixing)
- Use `isAWSError()`, `isAWSNotFoundError()`, `isPulumiError()` for type detection
- Use `sanitizeErrorMessage()` before logging (removes account IDs, domains, emails)
- Never swallow errors — handle specifically with instanceof guards

## Metadata Persistence

Stored at `~/.wraps/connections/{accountId}-{region}.json`:

- Versioned format (v1.0.0), auto-migrating on load
- Multi-service: `services.email`, `services.sms`, `services.cdn`
- Key functions: `loadConnectionMetadata()`, `saveConnectionMetadata()`, `findConnectionsWithService()`
- To add a migration: bump `CURRENT_VERSION`, write migration fn, add to chain, test in `metadata.test.ts`

## Pulumi Integration

Inline Pulumi programs via `pulumi.automation.LocalWorkspace`:

- Stack name format: `wraps-{accountId}-{region}`
- Stack state stored in `~/.wraps/` (passphrase-encrypted, empty passphrase)
- One AWS resource per file in `infrastructure/resources/`
- Tag all resources: `ManagedBy: 'wraps-cli'`
- Lambda functions bundled on-the-fly with esbuild

## Two IAM Roles: Customer Runtime vs. Wraps Console Access

Two IAM roles are easy to conflate but serve opposite trust directions. This
absence in the docs is what let an earlier design spec name the wrong role
for the platform-webhook trust boundary.

| | `wraps-email-role` | `wraps-console-access-role` |
|---|---|---|
| Created by | `wraps email init` (also `sms`/`cdn` equivalents: `wraps-sms-role`, `wraps-cdn-role`) | `wraps platform connect` |
| Source | `createServiceIAMRole()` (`src/infrastructure/shared/iam.ts:129`), called from `resources/iam.ts` via `email-stack.ts` | `commands/platform/connect.ts`, using `CONSOLE_ACCESS_ROLE_NAME` from `@wraps/core` (`packages/core/src/constants.ts:88`) |
| Trust principal | The customer's own compute: Vercel via OIDC, or an AWS-native instance/execution role | The Wraps Platform account (`905130073023`), gated by an `sts:ExternalId` condition |
| Who assumes it | The customer's own app/SDK, to call SES/CloudWatch directly | Wraps' backend, cross-account, to power the hosted dashboard |
| Purpose | Runtime sending + dashboard-adjacent read access from the customer's own infrastructure | Lets `app.wraps.dev` read/manage the customer's Wraps resources without the customer ever sharing credentials |

Self-hosted control planes use a third, parallel role (`wraps-selfhost-console-access-role`,
trusting the customer's own account instead of Wraps') — see the Selfhost Surface
table below for that split.

## Wraps Receives the Full SES Event Stream, Not a Filtered One

Once `platform connect` has run, the webhook target it adds delivers **every**
SES event the customer's configuration set emits — not just bounces/complaints.
The EventBridge rule (`wraps-email-events-to-sqs`, `resources/eventbridge.ts`)
matches `{ source: ["aws.ses"] }` with no `detail-type` filter, and the webhook
target added by `platform connect` sits on that same rule alongside the
customer's own SQS target — it does not narrow what SES publishes.

What SES publishes is controlled separately, by `matchingEventTypes` on the SES
configuration set (`resources/ses.ts`, `ALL_EVENT_TYPES` constant — all ten
types by default, customer-configurable via `eventTracking.events`). So "Wraps
only handles bounces and complaints" is wrong on both counts: SES emits all ten
types by default, and none of them are filtered out before reaching Wraps.

## Selfhost Surface

Customers can run the control plane in their own AWS account. There is exactly one way to deploy it: `pnpm selfhost:deploy` from a fork, driven by `infra/selfhost.config.ts` + `scripts/selfhost/*` (SST). It deploys the full platform — API Lambda, dashboard on CloudFront, DynamoDB rate limit, SQS batch/workflow queues + DLQ consumers, scheduler group, alarms.

A second, Pulumi-based API-only variant (`wraps selfhost deploy`, `infrastructure/selfhost-stack.ts`) shipped alongside it and was **deleted 2026-07-31** — no customer ever deployed it, and it had diverged: its Lambda multiplexer crashed on every SQS batch invocation and its batch DLQ had no consumer, so broadcasts stalled permanently. Do not reintroduce a second deploy path. `wraps selfhost` keeps only the commands that operate on an existing deployment: `login`, `logout`, `status`, `logs`, `env`, `connect`, `update-role`.

Deploying over an existing deployment fails partway with `EntityAlreadyExists`, because the stack creates the account-global `wraps-selfhost-scheduler-role` and `wraps-selfhost-schedulers` group. `deploy`/`upgrade` fail fast on that with `hasExistingSelfhostResources(region)` (`utils/selfhost/existing-deployment.ts`) before writing `.env.selfhost` — whose existence would otherwise lock the customer out of the deploy path forever.

`scripts/selfhost/` lives at the repo root, not in this package, and imports `packages/cli/src/**` through relative paths. It is not part of the tsup bundle and customers run it from a clone — so it must build against workspace deps (`pnpm selfhost:build-deps`), never against `dist/`.

### Two control planes, doubled resources

`selfhost connect` and `selfhost update-role` route into `commands/platform/connect.ts` and `update-role.ts` with `selfhosted: true`. Everything below forks on that flag. Nothing may key off the *presence* of selfhost metadata — an ordinary SaaS connect from a machine that had ever deployed selfhost silently revoked platform access that way.

| | Platform | Self-hosted |
|---|---|---|
| Console role | `wraps-console-access-role` | `wraps-selfhost-console-access-role` |
| Trust principal | `WRAPS_PLATFORM_ACCOUNT_ID` | the customer's own `metadata.accountId` |
| Identity in metadata | `platform.{externalId,connectionId}` | `selfhostPlatform.{externalId,connectionId}` |
| SES event target | `wraps-webhook-destination` | `wraps-selfhost-webhook-destination` |

Both sides of every row can exist at once and each flow must leave the other's alone. The separate `selfhostPlatform` key exists because the two planes issue *different* externalIds; writing one into `platform.externalId` breaks the other plane's `AssumeRole`.

**The load-bearing omission:** the self-hosted branch passes `selfhostWebhook` to `buildEmailStackConfig` and **no `webhook` key at all**. That makes the builder reconstruct the platform webhook from metadata, which is what keeps app.wraps.dev receiving events. An explicit `webhook: undefined` means "delete the platform target" and is the coexistence regression. See `deployEventBridge()` in `platform/connect.ts` and `resources/eventbridge-selfhost-webhook.ts`.

`--reroute-events` (a flag on `pnpm selfhost:deploy`/`:upgrade`, not on the CLI) is the legacy path that repointed the single platform target instead of adding a second one. It still works, but `selfhost connect` migrates an account off it and warns — two targets on one API deliver every event twice. The EventBridge rule caps at 5 targets (AWS hard quota), so count targets rather than assuming room for another.

`resources/iam-agent-user.ts` grants `lambda:InvokeFunction` on the agent enforcer to **every** console role that exists, each gated by its own existence probe — not to a hardcoded role name. A missing role is skipped with a warning rather than failing the stack, so a grant aimed at the wrong role name deploys clean and only surfaces later as an IAM denial in the agent approval flow. The platform grant keeps its Pulumi logical name `wraps-agent-invoke` so deployed stacks do not replace the policy; the self-hosted grant has its own.

### Which control plane a command talks to

Any command that calls the control-plane API must get its base URL **and** its token from `resolveApiTarget()` (`utils/shared/api-target.ts`), then narrow with `checkApiTarget()`. Never pair `getApiBaseUrl()` with `resolveTokenAsync()` by hand: `resolveTokenAsync` reads only the SaaS slot, so a customer signed in with `selfhost login` was told "No API token — run wraps auth login", and a token found that way would have been POSTed to api.wraps.dev.

The target follows `config.activeInstance` — a pointer set by `selfhost login`, cleared by `auth login` and by `selfhost logout` of that instance. Whichever login ran last wins, which is how the two planes coexist in one config. An explicit `WRAPS_API_URL` outranks the pointer; `--token`/`WRAPS_API_KEY` override the credential but never switch planes. When the pointer is absent (sessions predating it), a lone self-hosted session with no SaaS session is adopted; anything ambiguous stays on the SaaS.

`platform connect` is the exception and keeps its own resolution — the SaaS and self-hosted flows are separate subcommands there, and `selfhost connect` already reads the per-instance session directly.

### Region and URL resolution

- Region is `SELFHOST_AWS_REGION`, written to `.env.selfhost` on first deploy from `--region`. On upgrade, read it back from the env file — **never** fall back to ambient `AWS_REGION`, which would target a different region than the deployed stack.
- Always store the API URL through `normalizeApiUrl()` (`utils/selfhost/api-url.ts`). The raw Lambda Function URL's trailing slash produces a double slash in webhook paths that the API will not route.
- SST names resources `{app}-{stage}-{logical}-{suffix}`, so nothing can be fetched by exact name — recovering the API URL is a paginated Lambda scan, not a lookup.
- The API reads `WRAPS_LICENSE_KEY`, not the `LICENSE_KEY` that `.env.selfhost` stores. `infra/selfhost.config.ts` maps one to the other; a bare `LICENSE_KEY` on the function is an unlicensed deployment.

Deployment tests for all of this are `tests/deployment/selfhost-sst/` and `coexistence/` — see `tests/deployment/README.md`. They need real AWS and are kept out of CI.

## Tests

- Unit tests never see the real home directory. `vitest.config.ts` runs them in forked
  workers (`pool: "forks"`) whose `HOME`, `USERPROFILE`, `XDG_*` and `PULUMI_HOME` point
  into one temp dir per vitest run, created and removed by
  `src/__tests__/setup/fake-home-global.ts`. A fork's real `os.homedir()` follows
  `HOME`, so `node_modules` code (conf, Pulumi automation) and child processes are
  covered. `no-real-network.ts` fails any real socket. Never point a test at the real
  `~/.wraps`. Under the old `threads` pool, setting `HOME` inside a test had no effect
  on `os.homedir()`, so don't switch the pool back. A test file that mocks `node:os`
  itself gets whatever path it returns, so give it a temp dir.
- Tests run with `NO_COLOR=1`. `CI` alone turns picocolors on, and CI also sets
  `FORCE_COLOR`; picocolors (and `@clack/prompts`, which uses it) honour `NO_COLOR` over
  both, so a local run sees no colour codes. Node's own colour detection does not honour
  it. `NO_COLOR` covers colour only: `CI` still changes `isInteractive()` and telemetry,
  so run with `CI=true` when touching those.

## Key Directories

- `src/commands/` — Command implementations (by service)
- `src/infrastructure/` — Pulumi stacks and resource definitions
- `src/utils/shared/` — Cross-service utilities (errors, config, metadata, output)
- `src/utils/email/` — Email-specific utilities
- `src/utils/sms/` — SMS-specific utilities
- `src/utils/selfhost/` — Existing-deployment probe, API URL resolution/normalization, Neon provisioning
- `src/types/` — Shared TypeScript types
- `lambda/` — Lambda function source (bundled by esbuild into deployments)

Outside this package but part of its surface: `scripts/selfhost/` (the deploy/upgrade/destroy entry points) and `infra/selfhost.config.ts`, both at the repo root.

## Build

- Bundler: tsup (CLI + console bundle)
- Lambda: esbuild (bundled at deploy time, not build time)
- Entry: `cli.ts` → `dist/cli.js` (bin.wraps in package.json)
