import { CopyCommand } from "./copy-command";
import { SectionKicker } from "./section-kicker";

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
    text: "                   Did not answer: SURBL Multi",
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

export function DeliverabilityAuditSection() {
  return (
    <section className="border-border border-b py-20 md:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.15fr] lg:gap-16">
          <div className="min-w-0">
            <SectionKicker>Diagnose</SectionKicker>
            <h2 className="max-w-[20ch] font-heading font-semibold text-3xl text-foreground leading-none tracking-tight md:text-4xl">
              When a rate climbs, one command says why.
            </h2>
            <p className="mt-5 max-w-[48ch] text-base text-muted-foreground leading-relaxed">
              An alert tells you a line moved. The audit tells you what is
              behind it: DKIM, SPF and DMARC, MX and TLS, BIMI, and public
              blacklists, in one pass, with the fix list at the bottom.
            </p>
            <p className="mt-4 max-w-[48ch] text-base text-muted-foreground leading-relaxed">
              Bounces and complaints are suppressed on the way in, so the rates
              have a floor under them and not only a gauge over them.
              Suppression is browsable and clearable in the dashboard, and every
              message has an event log.
            </p>

            <p className="mt-8 mb-3 font-medium text-foreground text-sm">
              Try it on your own domain before you install anything.
            </p>
            <CopyCommand
              command="npx @wraps.dev/cli email check yourdomain.com"
              location="audit_section"
            />
            <p className="mt-3 max-w-[48ch] text-muted-foreground text-xs leading-normal">
              It reads public DNS records and blacklists. Nothing is deployed
              and no AWS account is needed.
            </p>
          </div>

          <figure className="m-0 min-w-0 lg:justify-self-end">
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
              <pre className="overflow-x-auto p-5 lg:overflow-visible font-mono text-xs leading-relaxed md:text-[13px]">
                <code>
                  {READOUT.map((line, i) => (
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
              Abridged from a real run of wraps email check on example.com.
              Results change as DNS and blacklists do.
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
