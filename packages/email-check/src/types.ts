/**
 * Email Check Types
 * Complete TypeScript interfaces for email deliverability auditing
 */

// =============================================================================
// Check Options
// =============================================================================

export type EmailCheckOptions = {
  /** Fast mode: fewer DKIM selectors, top blacklists only, skip slow checks */
  quick?: boolean;
  /** Also verify via inbound test email */
  verify?: boolean;
  /** Output results as JSON */
  json?: boolean;
  /** Show all checks including passing */
  verbose?: boolean;
  /** Specific DKIM selector to check */
  dkimSelector?: string;
  /** Comma-separated list of selectors to try */
  dkimSelectors?: string[];
  /** DNS/connection timeout in milliseconds */
  timeout?: number;
  /** Disable colored output */
  noColor?: boolean;
  /** Skip blacklist checks */
  skipBlacklists?: boolean;
  /** Skip MX TLS checks (if port 25 blocked) */
  skipTls?: boolean;
};

// =============================================================================
// SPF Types
// =============================================================================

export type SpfResult = {
  exists: boolean;
  record: string | null;
  records: string[]; // All SPF records found (should be 1)
  multipleRecords: boolean; // True if >1 SPF record (RFC violation)
  valid: boolean;
  syntaxErrors: string[];
  warnings: string[];

  // Lookup tracking with tree visualization
  lookupCount: number;
  lookupLimit: 10;
  lookupTree: SpfLookupNode[]; // Tree of all lookups for visualization

  allMechanism: "+all" | "-all" | "~all" | "?all" | null;
  includes: string[];
  hasPtr: boolean;
  hasDuplicates: boolean;
  hasCircularInclude: boolean;
  recordLength: number;

  // Macro usage
  usesMacros: boolean;
  macros: string[];
};

export type SpfLookupNode = {
  mechanism: string; // e.g., "include:_spf.google.com"
  type: "include" | "a" | "mx" | "ptr" | "exists" | "redirect";
  domain: string;
  lookups: number; // How many lookups this node used
  children: SpfLookupNode[]; // Nested includes
  error: string | null; // If lookup failed
};

// =============================================================================
// DKIM Types
// =============================================================================

export type DkimResult = {
  found: boolean;
  selectors: DkimSelector[];
  selectorsChecked: number; // How many we tried
  earlyExit: boolean; // Did we stop early after finding valid?
  warnings: string[];
};

export type DkimSelector = {
  selector: string;
  exists: boolean;
  record: string | null;
  valid: boolean;
  keyType: "rsa" | "ed25519" | "unknown" | null;
  keyBits: number | null; // For RSA
  publicKey: string | null;
  testMode: boolean; // t=y flag
  revoked: boolean; // Empty p= tag
  expired: boolean; // x= tag check
  hashAlgorithms: string[]; // h= tag (sha256, sha1)
  serviceTypes: string[]; // s= tag (email, *)
  flags: string[]; // t= flags
  errors: string[];
  warnings: string[];
};

// =============================================================================
// DMARC Types
// =============================================================================

export type DmarcResult = {
  exists: boolean;
  record: string | null;
  valid: boolean;
  policy: "none" | "quarantine" | "reject" | null;
  subdomainPolicy: "none" | "quarantine" | "reject" | null;
  /** np= tag — policy for non-existent subdomains (DMARCbis / RFC 9989) */
  nonExistentSubdomainPolicy?: "none" | "quarantine" | "reject" | null;
  /** t=y tag — testing mode; DMARCbis receivers won't enforce the policy */
  testing?: boolean;
  /** psd= tag — public suffix domain declaration (DMARCbis / RFC 9989) */
  psd?: "y" | "n" | "u" | null;
  /** @deprecated pct= is retired in DMARCbis; receivers ignore it */
  percentage: number;
  reportingEnabled: boolean;
  ruaAddresses: string[];
  rufAddresses: string[];
  alignmentSpf: "strict" | "relaxed";
  alignmentDkim: "strict" | "relaxed";
  failureOptions: string; // fo= tag
  reportInterval: number; // ri= tag in seconds
  reportFormat: string; // rf= tag
  errors: string[];
  warnings: string[];
};

// =============================================================================
// MX Types
// =============================================================================

export type MxResult = {
  exists: boolean;
  records: MxRecord[];
  hasRedundancy: boolean;
  warnings: string[];
};

export type MxRecord = {
  priority: number;
  exchange: string;
  resolves: boolean;
  ipv4Addresses: string[];
  ipv6Addresses: string[];
  isLocalhost: boolean;
  isIpAddress: boolean;
  reverseHostnames: string[]; // PTR for each IP
};

// =============================================================================
// MX TLS Types
// =============================================================================

export type MxTlsResult = {
  checked: boolean;
  skipped: boolean;
  skipReason: string | null; // "Port 25 blocked", "--skip-tls flag", etc.
  servers: MxTlsServerResult[];
};

export type MxTlsServerResult = {
  server: string;
  port: number;
  connected: boolean;
  connectionError: string | null;
  supportsStarttls: boolean;
  tlsVersions: string[]; // All supported versions
  preferredTlsVersion: string | null;
  cipherSuite: string | null;
  certificate: TlsCertificate | null;
  errors: string[];
};

export type TlsCertificate = {
  valid: boolean;
  issuer: string;
  subject: string;
  altNames: string[];
  expiresAt: string;
  daysUntilExpiry: number;
  matchesHostname: boolean;
  selfSigned: boolean;
  chainValid: boolean;
};

// =============================================================================
// MTA-STS Types
// =============================================================================

export type MtaStsResult = {
  configured: boolean;
  dnsRecord: string | null;
  dnsRecordId: string | null;
  policyFetched: boolean;
  policyUrl: string;
  policy: MtaStsPolicy | null;
  mxPatternsMatch: boolean;
  errors: string[];
  warnings: string[];
};

export type MtaStsPolicy = {
  version: string;
  mode: "enforce" | "testing" | "none";
  maxAge: number;
  mxPatterns: string[];
};

// =============================================================================
// TLS-RPT Types
// =============================================================================

export type TlsRptResult = {
  configured: boolean;
  record: string | null;
  version: string | null;
  reportingUris: string[];
  errors: string[];
};

// =============================================================================
// Reverse DNS Types
// =============================================================================

export type ReverseDnsResult = {
  results: PtrRecord[];
  allHavePtr: boolean;
  allConfirm: boolean;
  warnings: string[];
};

export type PtrRecord = {
  ip: string;
  ipVersion: 4 | 6;
  ptrHostname: string | null;
  forwardConfirms: boolean; // PTR hostname resolves back to IP
  looksGeneric: boolean; // Pattern like IP-based hostname
  matchesDomain: boolean; // Contains the domain being checked
};

// =============================================================================
// IPv6 Types
// =============================================================================

export type Ipv6Result = {
  mxHasIpv6: boolean;
  mxIpv6Addresses: { mx: string; addresses: string[] }[];
  ipv6Connectable: boolean;
  spfIncludesIpv6: boolean;
  warnings: string[];
};

// =============================================================================
// Blacklist Types
// =============================================================================

export type BlacklistResult = {
  domainChecks: {
    checked: number;
    listed: BlacklistListing[];
    clean: string[];
    errors: string[];
    timeouts: string[]; // Blacklists that timed out
  };
  ipChecks: {
    checked: number;
    listed: BlacklistListing[];
    clean: string[];
    errors: string[];
    timeouts: string[];
  };
  overallClean: boolean;
  quickMode: boolean; // True if only top 10 checked
};

export type BlacklistListing = {
  blacklist: string;
  zone: string;
  priority: "critical" | "high" | "medium" | "low";
  type: "domain" | "ip";
  target: string; // The domain or IP that was listed
  returnCode: string; // e.g., "127.0.0.2"
  meaning: string; // Decoded meaning if known
  delistUrl: string | null; // URL to request removal
};

export type BlacklistConfig = {
  name: string;
  zone: string;
  priority?: "critical" | "high" | "medium" | "low";
};

// =============================================================================
// Domain Age Types
// =============================================================================

export type DomainAgeResult = {
  createdAt: string | null;
  expiresAt: string | null;
  updatedAt: string | null;
  ageInDays: number | null;
  daysUntilExpiry: number | null;
  registrar: string | null;
  registrantOrganization: string | null;
  registrantCountry: string | null;
  nameservers: string[];
  dnssecEnabled: boolean;

  // Source tracking
  source: "rdap" | "whois" | "unavailable";
  privacyEnabled: boolean; // True if WHOIS privacy service detected
  errors: string[];
};

// =============================================================================
// DNSSEC Types
// =============================================================================

export type DnssecResult = {
  enabled: boolean;
  valid: boolean;
  validationMethod: "google-dns" | "system-resolver";
  chainOfTrust: {
    domain: string;
    hasDs: boolean;
    hasDnskey: boolean;
    hasRrsig: boolean;
    valid: boolean;
  }[];
  algorithm: string | null;
  keyTag: number | null;
  errors: string[];
};

// =============================================================================
// CAA Types
// =============================================================================

export type CaaResult = {
  configured: boolean;
  records: CaaRecord[];
  allowedIssuers: string[];
  allowedWildcardIssuers: string[];
  reportingConfigured: boolean;
  iodefUri: string | null;
};

export type CaaRecord = {
  flags: number;
  tag: "issue" | "issuewild" | "iodef";
  value: string;
};

// =============================================================================
// BIMI Types
// =============================================================================

export type BimiResult = {
  configured: boolean;
  record: string | null;
  logoUrl: string | null;
  vmcUrl: string | null;
  logoAccessible: boolean;
  logoValid: boolean; // Valid SVG format
  vmcAccessible: boolean;
  vmcValid: boolean; // Valid certificate
  dmarcCompatible: boolean; // DMARC must be enforcing
  errors: string[];
  warnings: string[];
};

// =============================================================================
// Scoring Types
// =============================================================================

export type ScoreResult = {
  rawScore: number;
  finalScore: number;
  grade: "A" | "B" | "C" | "D" | "F";
  deductions: Deduction[];
  bonuses: Bonus[];
  breakdown: ScoreBreakdown;
};

export type Deduction = {
  check: string;
  points: number;
  reason: string;
};

export type Bonus = {
  check: string;
  points: number;
  reason: string;
};

export type ScoreBreakdown = {
  spf: { max: number; score: number };
  dkim: { max: number; score: number };
  dmarc: { max: number; score: number };
  mx: { max: number; score: number };
  blacklist: { max: number; score: number };
  bonus: { earned: number; possible: number };
};

// =============================================================================
// Full Check Result
// =============================================================================

export type EmailCheckResult = {
  domain: string;
  checkedAt: string;
  duration: number; // Total check duration in ms
  options: EmailCheckOptions;

  // Core authentication
  spf: SpfResult;
  dkim: DkimResult;
  dmarc: DmarcResult;

  // Infrastructure
  mx: MxResult;
  mxTls: MxTlsResult;
  mtaSts: MtaStsResult;
  tlsRpt: TlsRptResult;
  reverseDns: ReverseDnsResult;
  ipv6: Ipv6Result;

  // Reputation
  blacklist: BlacklistResult;
  domainAge: DomainAgeResult;

  // Security
  dnssec: DnssecResult;
  caa: CaaResult;
  bimi: BimiResult;

  // Scoring
  score: ScoreResult;

  // Verification (only if --verify)
  verification?: VerificationResult;
};

// =============================================================================
// Verification Types (for --verify mode)
// =============================================================================

export type VerificationResult = {
  verificationId: string;
  email: string;
  received: boolean;
  receivedAt: string | null;
  timedOut: boolean;
  authResults: InboundAuthResult | null;
  headers: HeaderAnalysis | null;
  dkimSignature: DkimSignatureAnalysis | null;
  alignment: AlignmentResult | null;
  infrastructure: SendingInfraAnalysis | null;
};

export type InboundAuthResult = {
  spf: {
    result:
      | "pass"
      | "fail"
      | "softfail"
      | "neutral"
      | "none"
      | "temperror"
      | "permerror";
    domain: string;
    ip: string;
    helo: string;
    details: string;
  };
  dkim: {
    result: "pass" | "fail" | "none" | "temperror" | "permerror";
    domain: string;
    selector: string;
    headerFields: string[]; // Which headers were signed
    bodyHashValid: boolean;
    signatureValid: boolean;
  };
  dmarc: {
    result: "pass" | "fail" | "none";
    policy: string;
    disposition: string;
    spfAlignment: "pass" | "fail";
    dkimAlignment: "pass" | "fail";
  };
  arc: {
    present: boolean;
    valid: boolean;
    chainLength: number;
    seals: ArcSeal[];
  } | null;
};

export type ArcSeal = {
  instance: number;
  domain: string;
  result: "pass" | "fail";
};

export type HeaderAnalysis = {
  from: {
    raw: string;
    address: string;
    name: string | null;
    domain: string;
    valid: boolean;
    matchesExpected: boolean;
  };
  replyTo: {
    raw: string | null;
    address: string | null;
    valid: boolean;
  } | null;
  to: {
    raw: string;
    addresses: string[];
    valid: boolean;
  };
  subject: {
    raw: string | null;
    present: boolean;
    length: number;
  };
  messageId: {
    raw: string | null;
    valid: boolean;
    domain: string | null;
  };
  date: {
    raw: string | null;
    parsed: Date | null;
    valid: boolean;
    isFuture: boolean;
    ageMinutes: number;
  };
  mimeVersion: string | null;
  contentType: {
    type: string;
    charset: string | null;
    boundary: string | null;
  } | null;
  mailer: string | null;
  originatingIp: string | null;
  receivedChain: ReceivedHeader[];
  listUnsubscribe: {
    present: boolean;
    mailto: string | null;
    https: string | null;
  };
  listUnsubscribePost: boolean;
  precedence: string | null;
  autoSubmitted: string | null;
  feedbackId: string | null;
  customHeaders: Record<string, string>;
  warnings: string[];
  errors: string[];
};

export type ReceivedHeader = {
  index: number;
  from: string | null;
  fromIp: string | null;
  by: string | null;
  byIp: string | null;
  via: string | null;
  with: string | null; // Protocol (SMTP, ESMTP, ESMTPS, etc.)
  timestamp: Date | null;
  timestampRaw: string | null;
  tls: boolean;
  authenticated: boolean;
};

export type DkimSignatureAnalysis = {
  present: boolean;
  count: number; // Number of DKIM signatures
  signatures: DkimSignatureDetail[];
};

export type DkimSignatureDetail = {
  version: string; // v= tag
  algorithm: string; // a= tag (rsa-sha256, ed25519-sha256)
  signature: string; // b= tag (truncated for display)
  bodyHash: string; // bh= tag
  domain: string; // d= tag
  selector: string; // s= tag
  canonicalization: {
    header: "relaxed" | "simple";
    body: "relaxed" | "simple";
  };
  signedHeaders: string[]; // h= tag parsed
  bodyLength: number | null; // l= tag (dangerous if present)
  timestamp: number | null; // t= tag (Unix timestamp)
  expiration: number | null; // x= tag (Unix timestamp)
  queryMethod: string; // q= tag
  copiedHeaders: string | null; // z= tag

  // Analysis results
  criticalHeadersSigned: {
    from: boolean;
    subject: boolean;
    date: boolean;
    to: boolean;
    messageId: boolean;
  };
  isExpired: boolean;
  expiresIn: number | null; // Seconds until expiration
  usesDeprecatedAlgorithm: boolean;
  hasBodyLengthLimit: boolean;

  // Verification (if we can verify)
  verified: boolean | null;
  verificationError: string | null;

  warnings: string[];
  errors: string[];
};

export type AlignmentResult = {
  fromDomain: string;
  fromOrganizationalDomain: string;

  spf: {
    returnPath: string | null;
    returnPathDomain: string | null;
    envelopeFrom: string | null;
    envelopeFromDomain: string | null;
    strictlyAligned: boolean;
    relaxedAligned: boolean;
  };

  dkim: {
    signingDomain: string;
    strictlyAligned: boolean;
    relaxedAligned: boolean;
  };

  dmarcResult: {
    spfPassed: boolean;
    spfAligned: boolean;
    dkimPassed: boolean;
    dkimAligned: boolean;
    wouldPass: boolean; // At least one (passed + aligned)
    effectivePolicy: "none" | "quarantine" | "reject";
  };
};

export type SendingInfraAnalysis = {
  sendingIp: string;
  ipVersion: 4 | 6;

  hostname: {
    heloHostname: string | null;
    resolvedHostname: string | null; // From PTR
    forwardMatches: boolean; // PTR resolves back to IP
    looksGeneric: boolean;
  };

  provider: {
    detected: boolean;
    name: string | null; // "Amazon SES", "SendGrid", "Google Workspace", etc.
    type: "esp" | "mailbox" | "self-hosted" | "unknown";
    confidence: "high" | "medium" | "low";
    indicators: string[]; // What gave it away
  };

  security: {
    tlsUsed: boolean;
    tlsVersion: string | null;
    authenticated: boolean;
    authMethod: string | null; // PLAIN, LOGIN, etc.
  };

  ipReputation: {
    checked: boolean;
    listedOn: string[];
    clean: boolean;
  };

  hops: {
    count: number;
    internal: number; // Hops within same org
    external: number; // Hops across different orgs
    totalTime: number; // Total transit time in seconds
  };
};

// =============================================================================
// DNS Abstraction Types
// =============================================================================

export type DnsProvider = {
  resolveTxt(domain: string): Promise<string[][]>;
  resolveMx(domain: string): Promise<{ exchange: string; priority: number }[]>;
  resolveA(domain: string): Promise<string[]>;
  resolveAaaa(domain: string): Promise<string[]>;
  resolvePtr(ip: string): Promise<string[]>;
  resolveCaa(domain: string): Promise<CaaRecord[]>;
  resolveCname(domain: string): Promise<string[]>;
};

export type DnsQueryOptions = {
  timeout?: number;
  retries?: number;
};
