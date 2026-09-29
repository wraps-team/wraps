import type { DnsProvider } from "@wraps.dev/email-check";
import type { SendingDomain } from "@/actions/domains";
import { dnsRecordsFor } from "@/lib/dns-records";

export type DomainAuthRecordKind =
  | "dkim"
  | "mailfrom_mx"
  | "mailfrom_spf"
  | "dmarc";
export type DomainAuthStatus = "verified" | "incorrect" | "missing" | "unknown";

export type DomainAuthRecordResult = {
  kind: DomainAuthRecordKind;
  name: string; // DNS name queried
  expected: string; // human-readable expectation
  status: DomainAuthStatus;
  found: string[]; // raw values seen; [] when missing or unknown
};

const stripDot = (value: string) => value.replace(/\.$/, "");

type Check = Pick<DomainAuthRecordResult, "status" | "found">;

async function checkDkim(
  provider: DnsProvider,
  name: string,
  expected: string
): Promise<Check> {
  const found = await provider.resolveCname(name);
  if (found.length === 0) return { status: "missing", found };
  const ok = found.some((v) => stripDot(v) === expected);
  return { status: ok ? "verified" : "incorrect", found };
}

async function checkMx(
  provider: DnsProvider,
  name: string,
  expectedHost: string
): Promise<Check> {
  const records = await provider.resolveMx(name);
  const found = records.map((r) => r.exchange);
  if (found.length === 0) return { status: "missing", found };
  const ok = found.some((v) => stripDot(v) === expectedHost);
  return { status: ok ? "verified" : "incorrect", found };
}

async function checkSpf(provider: DnsProvider, name: string): Promise<Check> {
  const txt = (await provider.resolveTxt(name)).map((chunks) =>
    chunks.join("")
  );
  const spf = txt.find((v) => v.startsWith("v=spf1"));
  if (!spf) return { status: "missing", found: [] };
  const ok = spf.includes("include:amazonses.com");
  return { status: ok ? "verified" : "incorrect", found: [spf] };
}

async function checkDmarc(provider: DnsProvider, name: string): Promise<Check> {
  const txt = (await provider.resolveTxt(name)).map((chunks) =>
    chunks.join("")
  );
  const dmarc = txt.find((v) => v.startsWith("v=DMARC1"));
  if (!dmarc) return { status: "missing", found: [] };
  return { status: "verified", found: [dmarc] };
}

export async function checkDomainAuthRecords(
  domain: SendingDomain,
  provider: DnsProvider
): Promise<DomainAuthRecordResult[]> {
  if (domain.identityType !== "DOMAIN") return [];

  const targets: Array<{
    kind: DomainAuthRecordKind;
    name: string;
    expected: string;
    run: () => Promise<Check>;
  }> = dnsRecordsFor(domain).map((record) => {
    if (record.kind === "dkim") {
      return {
        kind: record.kind,
        name: record.name,
        expected: `CNAME to ${record.value}`,
        run: () => checkDkim(provider, record.name, record.value),
      };
    }
    if (record.kind === "mailfrom_mx") {
      const host = record.value.split(" ")[1] ?? record.value;
      return {
        kind: record.kind,
        name: record.name,
        expected: `MX to ${host}`,
        run: () => checkMx(provider, record.name, host),
      };
    }
    return {
      kind: record.kind,
      name: record.name,
      expected: "SPF TXT including amazonses.com",
      run: () => checkSpf(provider, record.name),
    };
  });

  const dmarcName = `_dmarc.${domain.identity}`;
  targets.push({
    kind: "dmarc",
    name: dmarcName,
    expected: 'a TXT record starting "v=DMARC1"',
    run: () => checkDmarc(provider, dmarcName),
  });

  return Promise.all(
    targets.map(async ({ run, ...meta }): Promise<DomainAuthRecordResult> => {
      try {
        return { ...meta, ...(await run()) };
      } catch {
        // A throw means we could not tell — never "missing".
        return { ...meta, status: "unknown", found: [] };
      }
    })
  );
}
