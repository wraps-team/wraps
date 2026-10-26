# mail-audit

Email deliverability audit from your terminal — SPF, DKIM, DMARC, MX, reverse DNS, mail server TLS, blacklists, and domain age, scored 0–100 with a letter grade A–F.

No install, no API key, no account:

```bash
npx mail-audit example.com
```

## Example

```
╭────────────────────────────────────────────────────────────────────────────╮
│                                                                            │
│   mail-audit                                                               │
│                                                                            │
│   Domain: wraps.dev                                                        │
│                                                                            │
│   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━─  A          │
│   Score: 99/100                                                            │
│                                                                            │
╰────────────────────────────────────────────────────────────────────────────╯

AUTHENTICATION

  ✓ SPF              v=spf1 include:_spf.google.com include:amazonses.com -all
                     2/10 DNS lookups used

  ✓ DKIM             Found 1 valid selector
                     • google (2048-bit RSA)

  ✓ DMARC            v=DMARC1; p=reject; rua=mailto:postmaster@mail.wraps.dev
                     Policy: reject • Reporting: enabled • Alignment: relaxed


INFRASTRUCTURE

  ✓ MX Records       5 records, all resolving
                     aspmx.l.google.com (1), alt1.aspmx.l.google.com (5), ...

  ✓ Mail Server TLS  All 5 servers support TLS (TLSv1.3)

  ✓ Reverse DNS      All IPs have valid PTR records

  ⚠ IPv6             Partial (MX has IPv6, SPF does not)


REPUTATION

  ✓ Blacklists       Not listed on any major blocklist

  ✓ Domain Age       Registered 263 days ago
                     (2025-11-07)


──────────────────────────────────────────────────────────────────────────────

✅ Excellent! SPF + DKIM + DMARC enforcing.
```

## Usage

```
Usage: mail-audit <domain> [options]
       mail-audit spf <domain> [options]

Commands:
  <domain>             Run full email deliverability audit
  spf <domain>         Analyze SPF record and lookup tree

Options:
  --json               Output as JSON
  --quick              Fast mode (fewer checks)
  --verbose            Show all details
  --skip-blacklists    Skip blacklist checks
  --skip-tls           Skip mail server TLS checks
  --timeout <ms>       DNS timeout in milliseconds
  -h, --help           Show this help
  -v, --version        Show version
```

### SPF lookup tree

SPF fails silently once a record needs more than 10 DNS lookups to evaluate. `spf` expands every `include:`, `a`, `mx`, and `redirect` so you can see the count and where it comes from:

```bash
npx mail-audit spf example.com
```

## What it checks

| Check | What it looks for |
| --- | --- |
| SPF | Record present, syntax valid, `-all`/`~all` qualifier, DNS lookup count under the limit of 10 |
| DKIM | 128 common selectors probed (25 in `--quick`), key present, valid, and not revoked |
| DMARC | Record present, policy (`none`/`quarantine`/`reject`), `rua` reporting, alignment mode |
| MX | Records present and resolving |
| Mail server TLS | STARTTLS support and negotiated version per MX host |
| Reverse DNS | PTR records for mail server IPs |
| IPv6 | AAAA on MX hosts and matching SPF coverage |
| Blacklists | Mail server IPs against 38 public DNSBLs, plus the domain against 15 domain blocklists |
| Domain age | Registration date (young domains are treated with suspicion by receivers) |

## CI usage

`--json` emits the full result as machine-readable JSON, and the exit code reflects the grade — so you can fail a pipeline on a deliverability regression:

| Grade | Exit code |
| --- | --- |
| A, B | `0` |
| C, D | `1` |
| F | `2` |
| Unknown | `4` |

```yaml
- name: Audit email DNS
  run: npx mail-audit example.com --json
```

## Requirements

Node.js 20 or newer. Zero runtime dependencies.

## Related

Built by the team behind [Wraps](https://wraps.dev) — send email through your own AWS SES account with a modern SDK, dashboard, and CLI.

## License

MIT
