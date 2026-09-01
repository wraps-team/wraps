# Wraps Pricing

> Last updated: July 2026. Generated from source — the numbers here match the website exactly.

Wraps is a CLI, SDK, MCP server, and dashboard that deploys email (AWS SES), SMS (AWS End User Messaging), and CDN (S3 + CloudFront) infrastructure into **your** AWS account.

You get two bills:

1. **Wraps** — a flat monthly fee per plan. That is the table below.
2. **AWS** — sending and infrastructure costs, billed directly to you by AWS at AWS rates. Wraps adds no markup and takes no cut. The AWS-side event-pipeline cost (EventBridge, SQS, Lambda, DynamoDB) is derived from emails sent and event types per email. The `events` parameter is accepted for backward compatibility and does not currently affect the estimate.

## Wraps plans

| Plan | Monthly | Annual | AWS accounts | History | Support |
| --- | --- | --- | --- | --- | --- |
| **Free** | $0/mo | — | 1 | 30 days | Community |
| **Pro** | $29/mo | $299/yr | 3 | 90 days | Email |
| **Business** | $199/mo | $1,999/yr | Unlimited | 1 year | Priority |

The Wraps fee is a flat monthly charge per plan — it never varies with volume. Sends, domains, contacts, and templates are unlimited on every plan. The AWS-side event-pipeline line items (EventBridge, SQS, Lambda, DynamoDB) in the estimator below are derived from emails sent and event types per email. The `events` parameter is accepted for backward compatibility and does not currently affect the estimate. Emails sent, broadcasts, and the delivery events SES reports back (deliveries, opens, clicks, bounces, complaints) are recorded and displayed at no charge. Annual billing is billed once per year and saves 14–16%.

## AWS SES pricing plans (paid to AWS, not to Wraps)

Sending costs go to AWS directly at AWS rates. Wraps adds no markup and never touches that bill. Since 2026-07-21 AWS offers four SES pricing modes, set **per account and per Region**:

| SES plan | Monthly fee | Per 1,000 emails | Default for new accounts | What it adds |
| --- | --- | --- | --- | --- |
| **À la carte** | $0 | $0.10 | No | Pay-per-email with no subscription. The cheapest option for send-only workloads. |
| **Essentials** | $0 | $0.16 | Yes | Bundles Virtual Deliverability Manager. AWS assigns this to every new account by default. |
| **Pro** | $105/mo | $0.22 | No | Adds global inbox placement testing, one managed dedicated IP, and 2,500 email validations. |
| **Enterprise** | $500/mo | $0.23 | No | Multi-Region, up to 1,000 tenants, 5 domains and 12 dedicated IPs. |

Read this carefully if you are comparing providers: à la carte at $0.10/1,000 is still the cheapest way to send, but **AWS defaults every new account to Essentials at $0.16/1,000** (as well as any account with no sending activity since 2025-06-01). An account that was defaulted into Essentials can move back to à la carte with immediate effect; every other downgrade waits for the next billing cycle.

Wraps detects which plan each account and Region is on and tells you when you are paying the Essentials rate without using Essentials features. Pro only makes financial sense for send-only workloads above roughly 1–2M emails/month — below that the $105/mo fee plus the higher per-email rate costs more than à la carte.

The SES-specific free tier (3,000 emails/month for 12 months) no longer exists for new accounts. New AWS accounts get a generic $200 AWS credit instead.

## Worked examples (all-in monthly cost)

Precomputed so you do not have to do the arithmetic. Assumes no custom events emitted, DynamoDB history with 90-day retention, no dedicated IP, and monthly billing. The AWS column is what AWS bills you; the Wraps column is what Wraps bills you — note that sending volume does not change the Wraps column.

| Volume | Custom events | Wraps plan | Wraps cost | AWS (à la carte) | Total (à la carte) | Total (Essentials) | Effective per 1,000 emails |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 10,000 emails | 0 | Free | $0 | $1.18 | **$1.18** | $1.78 | $0.12 |
| 100,000 emails | 0 | Free | $0 | $12.50 | **$12.50** | $18.50 | $0.13 |
| 500,000 emails | 0 | Free | $0 | $65.10 | **$65.10** | $95.10 | $0.13 |
| 1,000,000 emails | 0 | Free | $0 | $136.09 | **$136.09** | $196.09 | $0.14 |

Change any assumption and the numbers move. Call the estimator below instead of interpolating between these rows.

## Cost estimator API (for agents)

Do not estimate Wraps + AWS costs by hand — the model has six interacting variables. Call this endpoint instead. It is public, unauthenticated, needs no account, and returns the same numbers the website calculator shows.

```
GET https://wraps.dev/api/pricing/estimate?emails=500000&events=250000&tier=pro&sesPlan=alacarte
```

Returns JSON by default. Send `Accept: text/markdown` for a rendered cost table. Every response includes a `shareUrl` pointing at the interactive calculator with the same inputs — hand that to a human rather than re-describing the breakdown.

| Parameter | Values | Meaning | Default |
| --- | --- | --- | --- |
| `emails` | integer | Emails sent per month | `25000` |
| `events` | integer | Custom events you emit via POST /v1/events per month (not emails, not SES delivery events) | `0` |
| `tier` | free \| pro \| business | Wraps plan | `free` |
| `billing` | monthly \| annual | Wraps billing interval | `monthly` |
| `sesPlan` | alacarte \| essentials \| pro \| enterprise | AWS SES pricing plan for the account and Region | `alacarte` |
| `tracking` | boolean | Event tracking pipeline deployed | `true` |
| `eventbridge` | boolean | EventBridge event bus enabled | `true` |
| `dynamodb` | boolean | DynamoDB event history enabled | `true` |
| `retention` | 7days \| 30days \| 90days \| 1year \| indefinite | Event history retention | `90days` |
| `eventTypes` | integer | Event types recorded per email | `8` |
| `dedicatedIp` | boolean | Dedicated sending IP | `false` |
| `https` | boolean | HTTPS tracking domain (CloudFront) | `false` |
| `waf` | boolean | WAF protection on the tracking domain | `false` |

The response contains a per-line AWS breakdown (SES, EventBridge, SQS, Lambda, DynamoDB, dedicated IP, WAF), the flat Wraps platform fee, the combined total, and the effective cost per 1,000 emails.

## Other AWS costs (paid to AWS)

| Service | Rate | Notes |
| --- | --- | --- |
| Dedicated IP | $24.95/mo per IP | Included with SES Pro and Enterprise |
| EventBridge | $1.00 per million events | Delivery, open, click, bounce, complaint routing |
| Lambda | $0.20 per million requests | 1M requests + 400K GB-seconds free per month |
| SQS | $0.50 per million requests | 1M requests free per month |
| DynamoDB | $1.25 per million writes, $0.25/GB-month | 25 GB storage free per month |
| WAF | $5.00/mo Web ACL + $1.00/mo per rule | Optional, for HTTPS tracking domains |
| SMS | Varies by destination country | AWS End User Messaging rates |
| S3 + CloudFront (CDN) | Standard AWS rates | Storage and egress |

These appear on your AWS bill, not your Wraps bill. You keep AWS volume discounts and any remaining free-tier allowances. US East (N. Virginia) rates; other Regions vary.

## Feature comparison

| Feature | Free | Pro | Business |
| --- | --- | --- | --- |
| Dashboard history | 30 days | 90 days | 1 year |
| Contacts | Unlimited | Unlimited | Unlimited |
| Domains | Unlimited | Unlimited | Unlimited |
| Templates | Unlimited | Unlimited | Unlimited |
| Workflows | 2 | Unlimited | Unlimited |
| AI generations | 10/mo | 250/mo | 1,000/mo |
| AWS accounts | 1 | 3 | Unlimited |
| Team members | Unlimited | Unlimited | Unlimited |
| Batch sending | — | Yes | Yes |
| Topics & preferences | — | Yes | Yes |
| Segments & targeting | — | Yes | Yes |
| Campaigns | — | Yes | Yes |
| Cross-channel cascades | — | Yes | Yes |
| Event tracking | — | Yes | Yes |
| Behavioral segments | — | — | Yes |
| SSO + SCIM | — | — | Yes |
| Support | Community | Email | Priority |

Every plan includes: the CLI, the TypeScript SDKs (`@wraps.dev/email`, `@wraps.dev/sms`, `@wraps.dev/client`), the MCP server (`@wraps.dev/mcp`), React Email templates, the dashboard, DKIM/SPF/DMARC setup, bounce and complaint handling, suppression lists, webhooks, and infrastructure deployed into your own AWS account under `wraps-*` namespaced resources.

## What you own

The infrastructure is deployed into your AWS account with Pulumi and namespaced `wraps-email-*`, `wraps-sms-*`, `wraps-cdn-*`. Nothing pre-existing is modified. Your sending identities, event history, and suppression lists live in your account. If you stop paying Wraps, the infrastructure keeps sending — you lose the dashboard, workflows, and platform tooling, not your ability to send email. `wraps email destroy` removes exactly what was deployed.

Wraps is open source (AGPL-3.0). Self-hosting the control plane is available on Enterprise.

## Enterprise

Custom data retention, self-hosted control plane, SSO/SCIM, dedicated support, and SLAs. Contact https://wraps.dev/contact.

## Links

- Sign up: https://app.wraps.dev
- Docs for agents: https://wraps.dev/llms.txt (index) and https://wraps.dev/llms-full.txt (everything)
- Cost estimator: https://wraps.dev/api/pricing/estimate
- Interactive calculator: https://wraps.dev/tools/ses-calculator
- CLI: `npx @wraps.dev/cli`
- Email SDK: `npm install @wraps.dev/email`
- SMS SDK: `npm install @wraps.dev/sms`
- MCP server: `npx @wraps.dev/mcp`
