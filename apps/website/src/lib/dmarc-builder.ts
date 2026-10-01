// Pure DMARC record builder. Client-side only, no network.
//
// Tag set mirrors what packages/email-check reads (checks/dmarc.ts). It never
// emits pct, ri or rf: DMARCbis receivers ignore pct (use t=y while testing),
// and our own checker warns on pct below 100.

export type DmarcPolicy = "none" | "quarantine" | "reject";
export type DmarcAlignment = "r" | "s";
export type DmarcFailureOption = "" | "0" | "1" | "d" | "s";

export type DmarcInput = {
  domain: string;
  policy: DmarcPolicy;
  /** "" means unset (inherit p). */
  subdomainPolicy: DmarcPolicy | "";
  /** "" means unset. */
  nonExistentSubdomainPolicy: DmarcPolicy | "";
  testing: boolean;
  adkim: DmarcAlignment;
  aspf: DmarcAlignment;
  /** Comma, space or newline separated. Bare emails get mailto: added. */
  rua: string;
  ruf: string;
  /** Only emitted when at least one valid ruf address exists. */
  fo: DmarcFailureOption;
};

export type DmarcWarningId =
  | "monitoring-only"
  | "enforcing-first-step"
  | "subdomain-weaker"
  | "testing-with-enforcement"
  | "no-np"
  | "no-rua"
  | "invalid-rua"
  | "invalid-ruf"
  | "external-report-domain";

export type DmarcWarning = {
  id: DmarcWarningId;
  severity: "warning" | "info";
  message: string;
};

export type DmarcResult = {
  /** `_dmarc.<domain>`, or null when no valid domain was entered. */
  name: string | null;
  value: string;
  warnings: DmarcWarning[];
};

export const DEFAULT_DMARC_INPUT: DmarcInput = {
  domain: "",
  policy: "none",
  subdomainPolicy: "",
  nonExistentSubdomainPolicy: "",
  testing: false,
  adkim: "r",
  aspf: "r",
  rua: "",
  ruf: "",
  fo: "",
};

const EMAIL_SHAPE = /^[^\s@,;<>]+@([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/i;
const DOMAIN_SHAPE = /^(?=.{1,253}$)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/;

export function normalizeDomain(raw: string): string | null {
  const domain = raw
    .trim()
    .toLowerCase()
    .replace(/^_dmarc\./, "")
    .replace(/\.$/, "");
  return DOMAIN_SHAPE.test(domain) ? domain : null;
}

type ParsedAddresses = {
  valid: { uri: string; host: string }[];
  invalid: string[];
};

function parseAddresses(raw: string): ParsedAddresses {
  const valid: ParsedAddresses["valid"] = [];
  const invalid: string[] = [];
  for (const token of raw.split(/[\s,]+/).filter(Boolean)) {
    const bare = token.replace(/^mailto:/i, "");
    const match = EMAIL_SHAPE.exec(bare);
    if (match?.[1]) {
      valid.push({ uri: `mailto:${bare}`, host: match[1].toLowerCase() });
    } else {
      invalid.push(token);
    }
  }
  return { valid, invalid };
}

function isEnforcing(policy: DmarcPolicy): boolean {
  return policy === "quarantine" || policy === "reject";
}

export function buildDmarcRecord(input: DmarcInput): DmarcResult {
  const domain = normalizeDomain(input.domain);
  const rua = parseAddresses(input.rua);
  const ruf = parseAddresses(input.ruf);
  const enforcing = isEnforcing(input.policy);

  const tags = ["v=DMARC1", `p=${input.policy}`];
  if (input.subdomainPolicy) {
    tags.push(`sp=${input.subdomainPolicy}`);
  }
  if (input.nonExistentSubdomainPolicy) {
    tags.push(`np=${input.nonExistentSubdomainPolicy}`);
  }
  if (input.testing) {
    tags.push("t=y");
  }
  if (input.adkim === "s") {
    tags.push("adkim=s");
  }
  if (input.aspf === "s") {
    tags.push("aspf=s");
  }
  if (rua.valid.length > 0) {
    tags.push(`rua=${rua.valid.map((a) => a.uri).join(",")}`);
  }
  if (ruf.valid.length > 0) {
    tags.push(`ruf=${ruf.valid.map((a) => a.uri).join(",")}`);
    if (input.fo) {
      tags.push(`fo=${input.fo}`);
    }
  }

  const warnings: DmarcWarning[] = [];

  if (input.policy === "none") {
    warnings.push({
      id: "monitoring-only",
      severity: "info",
      message:
        "p=none is monitoring only. Nothing is enforced, so spoofed mail is still delivered. Read the aggregate reports for a few weeks, fix every legitimate sender that fails, then move to quarantine and finally reject.",
    });
  }

  if (enforcing) {
    warnings.push({
      id: "enforcing-first-step",
      severity: "warning",
      message: `p=${input.policy} asks receivers to ${input.policy === "reject" ? "refuse" : "quarantine"} every message that fails DMARC. Any legitimate sender that is not yet aligned, such as a marketing tool, a CRM or a forgotten cron job, will lose mail. If this is your first DMARC record, start at p=none with an rua address and read the reports first.`,
    });
  }

  if (input.subdomainPolicy === "none" && enforcing) {
    warnings.push({
      id: "subdomain-weaker",
      severity: "warning",
      message:
        "sp=none is weaker than your domain policy, so mail spoofed from subdomains is not enforced. Drop sp, or set it to match p.",
    });
  }

  if (input.testing && enforcing) {
    warnings.push({
      id: "testing-with-enforcement",
      severity: "warning",
      message: `t=y tells receivers not to enforce the policy, so p=${input.policy} does nothing while it is set. Remove t=y when you are ready to enforce.`,
    });
  }

  if (enforcing && !input.nonExistentSubdomainPolicy) {
    warnings.push({
      id: "no-np",
      severity: "info",
      message:
        "No np set. Consider np=reject to block spoofing from subdomains that do not exist (DMARCbis).",
    });
  }

  if (rua.valid.length === 0) {
    warnings.push({
      id: "no-rua",
      severity: "warning",
      message: enforcing
        ? "No rua address, so you get no aggregate reports and you are enforcing blind."
        : "No rua address, so you get no aggregate reports and cannot see which senders fail.",
    });
  }

  if (rua.invalid.length > 0) {
    warnings.push({
      id: "invalid-rua",
      severity: "warning",
      message: `Left out of rua because they are not valid mailto: addresses: ${rua.invalid.join(", ")}`,
    });
  }

  if (ruf.invalid.length > 0) {
    warnings.push({
      id: "invalid-ruf",
      severity: "warning",
      message: `Left out of ruf because they are not valid mailto: addresses: ${ruf.invalid.join(", ")}`,
    });
  }

  if (domain) {
    const external = new Set<string>();
    for (const { host } of [...rua.valid, ...ruf.valid]) {
      if (host !== domain && !host.endsWith(`.${domain}`)) {
        external.add(host);
      }
    }
    for (const host of external) {
      warnings.push({
        id: "external-report-domain",
        severity: "info",
        message: `Reports go to ${host}, which is not ${domain}. ${host} must publish an authorization TXT record at ${domain}._report._dmarc.${host} (value v=DMARC1) or receivers drop the reports.`,
      });
    }
  }

  return {
    name: domain ? `_dmarc.${domain}` : null,
    value: tags.join("; "),
    warnings,
  };
}
