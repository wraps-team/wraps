/**
 * Bot user-agent keywords used for both TypeScript and PostgreSQL filtering.
 * Add new patterns here — they automatically apply everywhere.
 */
export const BOT_UA_KEYWORDS = [
  // Email security gateways
  "barracuda",
  "mimecast",
  "proofpoint",
  "fireeye",
  "symantec",
  "fortinet",
  "fortiguard",
  "sophos",
  "trendmicro",
  "messagelabs",
  "ironport",
  "cisco\\s+email",
  "forcepoint",
  // NOTE: Gmail (GoogleImageProxy) and Yahoo (YahooMailProxy) image proxies
  // fetch at open time on behalf of real users — they are genuine opens and
  // must NOT be listed here. Doing so drops ~60% of all real opens.
  // Generic bot patterns
  "bot",
  "crawler",
  "spider",
  "scanner",
  "prefetch",
  "preview",
  // Programmatic HTTP clients
  "wget",
  "curl",
  "python-requests",
  "java/",
  "Go-http-client",
  "node-fetch",
];

const BOT_UA_PATTERNS = BOT_UA_KEYWORDS.map(
  (keyword) => new RegExp(keyword, "i")
);

export function isBotOpen(userAgent: string | undefined | null): boolean {
  if (!userAgent || userAgent.trim() === "") {
    return true;
  }
  return BOT_UA_PATTERNS.some((pattern) => pattern.test(userAgent));
}

export function isOpenEventBot(additionalData: string | undefined): boolean {
  if (!additionalData) {
    return false;
  }
  try {
    const data = JSON.parse(additionalData);
    return isBotOpen(data.userAgent);
  } catch {
    return false;
  }
}
