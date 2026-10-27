import { AuditReadout } from "./audit-readout";
import { CopyCommand } from "./copy-command";
import { SectionKicker } from "./section-kicker";

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

          <AuditReadout className="m-0 min-w-0 lg:justify-self-end" />
        </div>
      </div>
    </section>
  );
}
