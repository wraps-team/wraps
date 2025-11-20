# Anonymous Telemetry

Wraps CLI collects **anonymous usage data** to help us improve the product. This page explains what we collect, how we use it, and how to opt-out.

## Why We Collect Telemetry

Understanding how developers use Wraps helps us:

- **Prioritize features**: Focus on the most-used commands and services
- **Improve reliability**: Identify and fix common error patterns
- **Optimize performance**: Understand typical deployment sizes and durations
- **Support the right platforms**: Know which OS, Node versions, and providers to support

## What We Collect

### ✅ Data We DO Collect

- **Command names**: Which commands you run (e.g., `email init`, `status`)
- **Command success/failure**: Whether commands complete successfully
- **Command duration**: How long commands take to execute
- **CLI version**: Which version of Wraps you're using
- **Operating system**: Your platform (macOS, Linux, Windows)
- **Node.js version**: Your Node.js runtime version
- **Service types**: Which services you use (email, SMS, etc.)
- **Configuration presets**: Which preset you choose (starter, production, enterprise)
- **Error codes**: Standardized error codes (NOT error messages)
- **Provider**: Hosting provider selection (Vercel, AWS, Railway, Other)

### ❌ Data We DON'T Collect

We **never** collect personally identifiable information or sensitive data:

- ❌ AWS account IDs or credentials
- ❌ IAM role ARNs
- ❌ Domain names or email addresses
- ❌ IP addresses
- ❌ File paths or directory structures
- ❌ Template contents
- ❌ Environment variables
- ❌ Error messages (only error codes)
- ❌ Command flag values (only presence)
- ❌ Any user input or content

### Anonymous Identification

We generate a random UUID stored locally on your machine. This ID is used **only** for aggregating usage patterns (e.g., "this user ran init, then status, then upgrade"). It cannot be linked to your identity.

**Config location**:
- macOS: `~/Library/Preferences/wraps/telemetry.json`
- Linux: `~/.config/wraps/telemetry.json`
- Windows: `%APPDATA%\wraps\Config\telemetry.json`

## How to Opt-Out

Telemetry is **enabled by default**, but you can opt-out anytime using any of these methods:

### Option 1: CLI Command

```bash
wraps telemetry disable
```

To re-enable:
```bash
wraps telemetry enable
```

To check status:
```bash
wraps telemetry status
```

### Option 2: Environment Variable (Wraps-Specific)

Disable for a single command:
```bash
WRAPS_TELEMETRY_DISABLED=1 wraps email init
```

Disable globally (add to your `~/.bashrc` or `~/.zshrc`):
```bash
export WRAPS_TELEMETRY_DISABLED=1
```

### Option 3: Universal DO_NOT_TRACK

Wraps respects the [universal DO_NOT_TRACK standard](https://consoledonottrack.com/):

```bash
DO_NOT_TRACK=1 wraps email init
```

Or globally:
```bash
export DO_NOT_TRACK=1
```

### Option 4: CI/CD Environments

Telemetry is **automatically disabled** in CI environments. We detect common CI providers including:

- GitHub Actions
- GitLab CI
- CircleCI
- Travis CI
- Jenkins
- Buildkite
- AWS CodeBuild
- Vercel
- Netlify
- And many more

## Debug Mode

Want to see **exactly** what would be sent before enabling telemetry? Use debug mode:

```bash
WRAPS_TELEMETRY_DEBUG=1 wraps email init
```

This will:
- Print telemetry events to your console
- **NOT** send events to our servers
- Show the full event payload with all properties

Example output:
```json
[Telemetry Debug] Event: {
  "event": "command:email:init",
  "properties": {
    "success": true,
    "duration_ms": 1500,
    "cli_version": "1.2.0",
    "os": "darwin",
    "node_version": "v20.10.0",
    "ci": false
  },
  "anonymousId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

## Technical Details

### Architecture

```
CLI → Vercel API Endpoint → PostHog Cloud → Analytics Dashboard
```

1. **CLI**: Batches events locally, sends via HTTPS
2. **Vercel API**: Validates events, sanitizes PII, rate limits
3. **PostHog**: Open-source analytics platform
4. **Dashboard**: Internal analytics (not public)

### Privacy & Security

- **Transport**: HTTPS-only (encrypted in transit)
- **Storage**: Events stored for 90 days, then deleted
- **Access**: Only Wraps team members can access aggregate data
- **No tracking pixels**: No web tracking or cookies
- **No cross-tool tracking**: Only Wraps CLI events

### Non-Blocking Implementation

Telemetry is designed to **never** slow down or break your workflow:

- **2-second timeout**: Events that take >2s are dropped
- **Fire-and-forget**: Runs asynchronously, doesn't block commands
- **Silent failure**: Network errors are silently ignored
- **Batch sending**: Multiple events sent in single request
- **Graceful degradation**: Continues if telemetry server is down

### Rate Limiting

To prevent abuse, we rate limit to **1000 events per hour** per anonymousId. This is far above normal usage and shouldn't affect legitimate use.

## Opt-Out Priority

If multiple opt-out methods are configured, they're checked in this order:

1. `DO_NOT_TRACK=1` (highest priority)
2. `WRAPS_TELEMETRY_DISABLED=1`
3. CI environment detection
4. Config file setting (lowest priority)

## Data Retention

- **Raw events**: 90 days
- **Aggregate statistics**: Indefinite (no PII)
- **Vercel logs**: 7 days

## GDPR Compliance

Wraps telemetry is GDPR-compliant:

- **Consent**: Opt-out model with first-run notification
- **Data minimization**: Only anonymous, necessary data collected
- **Right to access**: `wraps telemetry status` shows configuration
- **Right to erasure**: `wraps telemetry disable` stops all collection
- **Transparency**: Full documentation of what's collected
- **No PII**: Anonymous UUID only, cannot identify individuals

## Example Events

Here are examples of events we collect:

### Command Execution

```typescript
{
  event: "command:email:init",
  properties: {
    success: true,
    duration_ms: 45000,
    preset: "production",
    provider: "vercel",
    cli_version: "1.2.0",
    os: "darwin",
    node_version: "v20.10.0",
    ci: false
  }
}
```

### Error Tracking

```typescript
{
  event: "error:occurred",
  properties: {
    error_code: "AWS_CREDENTIALS_INVALID",
    command: "email:init",
    cli_version: "1.2.0",
    os: "linux"
  }
}
```

### Service Deployment

```typescript
{
  event: "service:deployed",
  properties: {
    service: "email",
    duration_ms: 120000,
    features: ["tracking", "history"],
    preset: "production"
  }
}
```

## Questions?

### Can I see the telemetry source code?

Yes! Wraps is open source. View the telemetry implementation:
- CLI client: `packages/cli/src/telemetry/`
- API endpoint: `apps/website/api/telemetry.ts`

### Do you sell telemetry data?

**No.** We never sell, rent, or share telemetry data with third parties. It's used solely to improve Wraps.

### Can you identify me from the anonymous ID?

**No.** The UUID is randomly generated on your machine and stored locally. We have no way to link it to your identity, email, or AWS account.

### What if I found a bug where PII was sent?

Please report it immediately to:
- GitHub Issues: https://github.com/wraps-team/wraps/issues
- Security email: security@wraps.dev

We'll fix it and purge any affected data.

### How do I verify telemetry is disabled?

Run `wraps telemetry status` to check:

```bash
wraps telemetry status
```

Output:
```
Telemetry Status:
  Status: Disabled
  Config file: ~/.config/wraps/telemetry.json

How to opt-in:
  wraps telemetry enable
```

## Resources

- **Privacy Policy**: https://wraps.dev/privacy
- **PostHog (our analytics provider)**: https://posthog.com
- **DO_NOT_TRACK standard**: https://consoledonottrack.com
- **Source Code**: https://github.com/wraps-team/wraps
- **Report Issues**: https://github.com/wraps-team/wraps/issues

---

**Last Updated**: 2025-01-15
**Applies to**: Wraps CLI v1.2.0+
