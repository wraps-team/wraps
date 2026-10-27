/*
 * The diagnose step: an alert says a line moved, the audit says why.
 *
 * The readout is abridged from a real run of `wraps email check example.com`
 * (the published CLI, in a clean environment with no AWS config), kept in the
 * CLI's own order, wording and symbols. Nothing is invented; lines are only
 * left out. It is a snapshot, and blacklist results move, which the caption
 * says. The CLI itself ends by pointing at `email init`, which is the step the
 * page wants next, so that line stays.
 */

type Tone = "ok" | "warn" | "fail" | "muted" | "plain" | "head";

type Line = { tone: Tone; text: string };

const READOUT: Line[] = [
  { tone: "plain", text: "Domain: example.com    Score: 72/100  (C)" },
  { tone: "plain", text: "" },
  { tone: "head", text: "AUTHENTICATION" },
  { tone: "ok", text: "✓ SPF              v=spf1 -all" },
  { tone: "warn", text: "⚠ DKIM             Found but invalid or revoked" },
  {
    tone: "ok",
    text: "✓ DMARC            v=DMARC1;p=reject;sp=reject;adkim=s;aspf=s",
  },
  { tone: "muted", text: "○ BIMI             Not configured" },
  { tone: "plain", text: "" },
  { tone: "head", text: "INFRASTRUCTURE" },
  { tone: "warn", text: "⚠ MX Records       1 record, some not resolving" },
  { tone: "muted", text: "○ Mail Server TLS  Could not connect to servers" },
  { tone: "plain", text: "" },
  { tone: "head", text: "REPUTATION" },
  { tone: "fail", text: "✗ Blacklists       Listed on 1 list" },
  {
    tone: "plain",
    text: "                   • ZapBL RHSBL: Listed as spam source",
  },
  {
    tone: "muted",
    text: "                   Domain: 15 lists • No IPv4 mail server addresses to check",
  },
  {
    tone: "muted",
    text: "                   ○ SURBL Multi: did not answer (SERVFAIL)",
  },
  { tone: "plain", text: "" },
  { tone: "head", text: "ISSUES (0 critical, 1 warnings)" },
  { tone: "plain", text: "  1. No valid DKIM record" },
  { tone: "plain", text: "" },
  {
    tone: "muted",
    text: "Need help fixing these? Deploy Wraps to manage your email infrastructure:",
  },
  { tone: "plain", text: "  npx @wraps.dev/cli email init" },
];

const TONE: Record<Tone, string> = {
  ok: "text-success",
  warn: "text-warning",
  fail: "text-destructive",
  muted: "text-muted-foreground",
  plain: "text-foreground",
  head: "pt-1 text-muted-foreground tracking-widest",
};

/** Lines the compact readout leaves out: the infrastructure block, blacklist detail, and the closing pitch. */
const COMPACT_DROP = new Set([8, 9, 10, 11, 15, 16, 20, 21, 22]);

export function AuditReadout({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const lines = compact
    ? READOUT.filter((_, i) => !COMPACT_DROP.has(i))
    : READOUT;

  return (
    <figure className={className ?? "m-0 min-w-0"}>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex items-center gap-3 border-border border-b bg-muted/40 px-4 py-3">
          <div aria-hidden="true" className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-border" />
            <span className="size-2.5 rounded-full bg-border" />
            <span className="size-2.5 rounded-full bg-border" />
          </div>
          <span className="font-mono text-muted-foreground text-xs">
            wraps email check example.com
          </span>
        </div>
        <pre className="overflow-x-auto p-5 lg:overflow-visible font-mono text-xs leading-relaxed">
          <code>
            {lines.map((line, i) => (
              <span
                className={`block min-h-[1.4em] whitespace-pre lg:whitespace-pre-wrap lg:break-words ${TONE[line.tone]}`}
                // biome-ignore lint/suspicious/noArrayIndexKey: static readout, never reordered
                key={i}
              >
                {line.text}
              </span>
            ))}
          </code>
        </pre>
      </div>
      <figcaption className="mt-3 text-muted-foreground text-xs leading-normal">
        Abridged from a real run of wraps email check on example.com. Results
        change as DNS and blacklists do.
      </figcaption>
    </figure>
  );
}
