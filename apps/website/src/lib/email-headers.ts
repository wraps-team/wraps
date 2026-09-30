// Pure email header parser. Client-side only: pasted headers contain recipient
// addresses and internal hostnames, so nothing here touches the network, the
// URL, or storage.

export type HeaderField = {
  name: string;
  value: string;
};

export type ReceivedHop = {
  /** 1-based, oldest first. */
  index: number;
  from: string | null;
  by: string | null;
  protocol: string | null;
  dateText: string | null;
  date: Date | null;
  /** Seconds since the previous hop. Null for the first hop or when either date does not parse. */
  delaySeconds: number | null;
  raw: string;
};

export type AuthMethodResult = {
  method: "spf" | "dkim" | "dmarc";
  result: string;
  /** smtp.mailfrom domain for spf, header.d for dkim, header.from for dmarc. */
  domain: string | null;
  /** Which Authentication-Results header it came from (the authserv-id). */
  reportedBy: string | null;
};

export type AlignmentVerdict = {
  returnPathDomain: string | null;
  fromDomain: string | null;
  /** Null when either domain is missing. */
  aligned: boolean | null;
  /** True when the two domains are identical, not just the same organization. */
  exact: boolean;
};

export type ParsedHeaders = {
  fields: HeaderField[];
  received: ReceivedHop[];
  auth: AuthMethodResult[];
  from: string | null;
  returnPath: string | null;
  messageId: string | null;
  subject: string | null;
  date: string | null;
  alignment: AlignmentVerdict;
  platforms: string[];
};

const HEADER_LINE = /^([!-9;-~]+):[ \t]?(.*)$/;

/**
 * RFC 5322 section 2.2.3: a line that starts with space or tab continues the
 * previous header. Header parsing stops at the first blank line. Lines that are
 * not headers and not continuations are ignored.
 */
export function unfoldHeaders(raw: string): HeaderField[] {
  const fields: HeaderField[] = [];
  for (const line of raw.replace(/\r\n?/g, "\n").split("\n")) {
    if (line.trim() === "") {
      if (fields.length > 0) {
        break;
      }
      continue;
    }
    if (/^[ \t]/.test(line)) {
      const last = fields.at(-1);
      if (last) {
        last.value = `${last.value} ${line.trim()}`;
      }
      continue;
    }
    const match = HEADER_LINE.exec(line);
    if (match?.[1]) {
      fields.push({ name: match[1], value: (match[2] ?? "").trim() });
    }
  }
  return fields;
}

function stripComments(value: string): string {
  let previous = value;
  let next = value.replace(/\([^()]*\)/g, " ");
  while (next !== previous) {
    previous = next;
    next = next.replace(/\([^()]*\)/g, " ");
  }
  return next.replace(/\s+/g, " ").trim();
}

function parseReceived(
  value: string
): Omit<ReceivedHop, "index" | "delaySeconds"> {
  const semicolon = value.lastIndexOf(";");
  const body = stripComments(
    semicolon === -1 ? value : value.slice(0, semicolon)
  );
  const dateText =
    semicolon === -1 ? null : stripComments(value.slice(semicolon + 1)) || null;
  const parsed = dateText ? new Date(dateText) : null;
  return {
    from: /\bfrom\s+(\S+)/i.exec(body)?.[1] ?? null,
    by: /\bby\s+(\S+)/i.exec(body)?.[1] ?? null,
    protocol: /\bwith\s+(\S+)/i.exec(body)?.[1] ?? null,
    dateText,
    date: parsed && !Number.isNaN(parsed.getTime()) ? parsed : null,
    raw: value,
  };
}

/** Domain of the first address found in a From or Return-Path value. */
export function extractDomain(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const angle = /<([^<>]*)>/.exec(value);
  const candidate = angle ? angle[1] : value;
  const match = /@([a-z0-9.-]+\.[a-z]{2,})/i.exec(candidate ?? "");
  return match?.[1] ? match[1].toLowerCase().replace(/\.$/, "") : null;
}

/**
 * Heuristic organizational domain: the last two labels. This is wrong for
 * multi-part public suffixes such as example.co.uk (it returns co.uk), and we
 * deliberately do not ship the public suffix list. Treat the alignment verdict
 * as a first read, not a DMARC evaluation.
 */
export function organizationalDomain(domain: string): string {
  return domain.split(".").slice(-2).join(".");
}

function domainFromProperty(text: string, property: string): string | null {
  const match = new RegExp(`${property}\\s*=\\s*("?)([^\\s;"]+)\\1`, "i").exec(
    text
  );
  if (!match?.[2]) {
    return null;
  }
  const at = match[2].lastIndexOf("@");
  return (at === -1 ? match[2] : match[2].slice(at + 1))
    .toLowerCase()
    .replace(/[<>]/g, "");
}

function parseAuthenticationResults(value: string): AuthMethodResult[] {
  const parts = stripComments(value).split(";");
  const reportedBy = parts.shift()?.trim().split(/\s+/)[0] || null;
  const results: AuthMethodResult[] = [];
  for (const part of parts) {
    const match = /^\s*(spf|dkim|dmarc)\s*=\s*([a-z]+)/i.exec(part);
    if (!(match?.[1] && match[2])) {
      continue;
    }
    const method = match[1].toLowerCase() as AuthMethodResult["method"];
    const property =
      method === "spf"
        ? "smtp\\.mailfrom"
        : method === "dkim"
          ? "header\\.d"
          : "header\\.from";
    results.push({
      method,
      result: match[2].toLowerCase(),
      domain: domainFromProperty(part, property),
      reportedBy,
    });
  }
  return results;
}

function detectPlatforms(fields: HeaderField[]): string[] {
  const found = new Set<string>();
  for (const { name, value } of fields) {
    const lower = name.toLowerCase();
    if (
      lower === "x-ses-outgoing" ||
      (lower === "feedback-id" && /amazonses/i.test(value))
    ) {
      found.add("Amazon SES");
    } else if (lower.startsWith("x-mailgun-")) {
      found.add("Mailgun");
    } else if (lower === "x-sg-eid" || lower === "x-sg-id") {
      found.add("SendGrid");
    } else if (lower === "x-pm-message-id") {
      found.add("Postmark");
    } else if (lower.startsWith("x-google-")) {
      found.add("Google");
    }
  }
  return [...found];
}

function firstValue(fields: HeaderField[], name: string): string | null {
  const lower = name.toLowerCase();
  return fields.find((f) => f.name.toLowerCase() === lower)?.value ?? null;
}

export function parseEmailHeaders(raw: string): ParsedHeaders {
  const fields = unfoldHeaders(raw);

  // Raw headers list the newest hop first; present oldest first.
  const hops = fields
    .filter((f) => f.name.toLowerCase() === "received")
    .map((f) => parseReceived(f.value))
    .reverse();
  const received: ReceivedHop[] = hops.map((hop, i) => {
    const previous = hops[i - 1];
    const delaySeconds =
      previous?.date && hop.date
        ? Math.round((hop.date.getTime() - previous.date.getTime()) / 1000)
        : null;
    return { ...hop, index: i + 1, delaySeconds };
  });

  const auth = fields
    .filter((f) => f.name.toLowerCase() === "authentication-results")
    .flatMap((f) => parseAuthenticationResults(f.value));

  const from = firstValue(fields, "From");
  const returnPath = firstValue(fields, "Return-Path");
  const fromDomain = extractDomain(from);
  const returnPathDomain = extractDomain(returnPath);

  return {
    fields,
    received,
    auth,
    from,
    returnPath,
    messageId: firstValue(fields, "Message-ID"),
    subject: firstValue(fields, "Subject"),
    date: firstValue(fields, "Date"),
    alignment: {
      returnPathDomain,
      fromDomain,
      aligned:
        fromDomain && returnPathDomain
          ? organizationalDomain(fromDomain) ===
            organizationalDomain(returnPathDomain)
          : null,
      exact: !!fromDomain && fromDomain === returnPathDomain,
    },
    platforms: detectPlatforms(fields),
  };
}
