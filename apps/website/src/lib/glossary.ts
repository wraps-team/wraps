/**
 * The public email terminology glossary, one entry per page under /glossary.
 *
 * This is not a general-knowledge dictionary. The SPF, DKIM, DMARC, and BIMI
 * entries are written from what `packages/email-check/src/checks/*.ts`
 * actually evaluates — the 10-lookup SPF limit, the DKIM selector batching and
 * key-size thresholds, the DMARCbis `np=`/`t=y` tags, the BIMI SVG Tiny P/S
 * profile — not from general knowledge, and each one says plainly where the
 * checker's own behavior falls short of the spec (SPF: warns but doesn't fail
 * over the lookup limit; BIMI: VMC reachability only, not full X.509
 * validation). MTA-STS and TLS-RPT have no real check behind them at all yet —
 * `mtaStsResult`/`tlsRptResult`/`dnssecResult` in `packages/email-check/src/
 * index.ts` are hardcoded stubs, so their entries describe the protocol from
 * its RFC, not from Wraps' own code, and say so. Where a failure mode is
 * already documented in depth on a `/ses/errors/*` or `/ses/*` page, this file
 * links to it rather than restating it.
 *
 * `~all` is the correct SPF qualifier for a sending domain, and `-all` is
 * correct only alongside an enforcing DMARC policy. That is a deliberate,
 * previously-recorded position — see the `dmarc` and `spf` entries. Do not
 * invert it.
 *
 * `src/__tests__/glossary.test.ts` enforces: unique slugs and terms, a
 * meta-description-length `shortDefinition`, at least 3 body sections and 3
 * FAQs, at least 500 words of real content per term, every `relatedSlugs`
 * entry resolving to a real slug, every `seeAlso.href` resolving to a real
 * route on disk, the on-disk `src/app/glossary/*` directories matching this
 * list exactly, and no `shortDefinition` copy-pasted verbatim into another
 * term's body.
 */

export type GlossaryCategory =
  | "authentication"
  | "deliverability"
  | "infrastructure"
  | "compliance"
  | "metrics";

export type GlossaryBodySection = {
  heading: string;
  content: string;
};

export type GlossarySeeAlso = {
  label: string;
  href: string;
};

export type GlossaryFaq = {
  question: string;
  answer: string;
};

export type GlossaryTerm = {
  /** URL segment under /glossary. */
  slug: string;
  /** Display name, page H1. */
  term: string;
  /** Other names people search for this under. */
  aliases: readonly string[];
  category: GlossaryCategory;
  /** 1-2 sentences, quotable, used as the meta description. 80-300 chars. */
  shortDefinition: string;
  /** 3-5 sections, each written for this term specifically. */
  body: readonly GlossaryBodySection[];
  whyItMatters: string;
  /** The command or tool that inspects this, where one exists. */
  howToCheck?: string;
  /** Other glossary slugs this term relates to. */
  relatedSlugs: readonly string[];
  /** Links into /ses, /docs, /tools, or /blog — never another glossary term. */
  seeAlso: readonly GlossarySeeAlso[];
  /** At least 3. */
  faqs: readonly GlossaryFaq[];
};

export const GLOSSARY: readonly GlossaryTerm[] = [
  // ---------------------------------------------------------------------
  // Authentication
  // ---------------------------------------------------------------------
  {
    slug: "spf",
    term: "SPF (Sender Policy Framework)",
    aliases: ["Sender Policy Framework", "SPF record", "v=spf1"],
    category: "authentication",
    shortDefinition:
      "An SPF record is a DNS TXT record that lists which servers are allowed to send mail for a domain, checked against the envelope return-path rather than the visible From address.",
    body: [
      {
        heading: "What the record actually says",
        content:
          "A domain publishes one TXT record starting with `v=spf1`, followed by a sequence of mechanisms (`ip4`, `ip6`, `a`, `mx`, `include`, `redirect`) and a trailing qualifier that says what to do with everything not explicitly listed. A receiving mail server resolves that record for the return-path domain on the incoming message and walks the mechanisms in order looking for a match. RFC 7208 permits exactly one SPF record per domain; a second one is not additive, it is invalid, and Wraps' own deliverability checker treats multiple records as a hard failure rather than trying to merge them.",
      },
      {
        heading: "The 10-lookup limit is the part people miss",
        content:
          "Every `include`, `a`, `mx`, `ptr`, `exists`, and `redirect` mechanism costs one DNS lookup, and RFC 7208 caps the total at 10 for the whole chain, including lookups inside nested includes. `ip4` and `ip6` mechanisms are free because they need no lookup. An SPF record that exceeds 10 lookups is specified to return `permerror` — the receiving server is required to treat it as broken, not to try harder. Wraps' email-check package walks this chain recursively and warns at the limit and warns again over it, but it doesn't currently fail the check for this the way a real receiving server would — a 15-lookup record still reports as valid today, which is a gap worth knowing about rather than trusting the tool to catch for you.",
      },
      {
        heading: "The qualifier at the end decides enforcement",
        content:
          "The final mechanism is almost always some form of `all`, and the character in front of it is the qualifier: `+` (pass, and never write this explicitly), `-` (hard fail), `~` (soft fail), or `?` (neutral). `~all` tells a receiver to accept-but-flag mail from an unlisted source; `-all` tells it to reject outright. For a sending domain, `~all` is the correct default: it gives you a way to add a forgotten sending source without an outage. `-all` is appropriate only once DMARC is enforcing (`p=quarantine` or `p=reject`), because at that point DMARC — not a bare SPF fail — is what determines the recipient's disposition, and a `-all` without an enforcing DMARC just adds a second way for a legitimate but unlisted source to bounce.",
      },
      {
        heading: "SPF authenticates the return-path, not the From address",
        content:
          "This is the single most common source of confusion about SPF. The check runs against the envelope sender (the MAIL FROM / return-path address), which a recipient never sees, not the visible From: header a human reads. A message can pass SPF cleanly while its visible From domain has no relationship to the domain that actually passed. DMARC alignment is the mechanism that ties the two back together — see the `dmarc-alignment` and `return-path` entries.",
      },
    ],
    whyItMatters:
      "SPF is the cheapest of the three authentication mechanisms to get wrong, because a record that looks plausible at a glance can silently exceed the lookup limit or end in the wrong qualifier for your DMARC posture. Both failure modes cause real mail to be rejected or marked as failing authentication, and neither shows up until a recipient's mail server actually evaluates the record.",
    howToCheck: "dig +short TXT example.com | grep spf1",
    relatedSlugs: [
      "dmarc",
      "dkim",
      "dmarc-alignment",
      "return-path",
      "mx-record",
    ],
    seeAlso: [
      { label: "SPF Builder", href: "/tools/spf-builder" },
      { label: "SPF Record Guide", href: "/blog/spf-guide" },
      {
        label: "Domain Verification guide",
        href: "/docs/guides/domain-verification",
      },
    ],
    faqs: [
      {
        question: "Should my SPF record end in ~all or -all?",
        answer:
          "~all for almost every sending domain. -all is correct only once DMARC is enforcing (quarantine or reject), because at that point DMARC decides disposition and -all stops being the thing standing between a misconfiguration and a bounce.",
      },
      {
        question: "Why did adding one more include break my SPF record?",
        answer:
          "You likely crossed the 10-DNS-lookup limit RFC 7208 sets for the whole chain, including lookups nested inside other includes. Past that limit, SPF is specified to return permerror, which most receivers treat as a fail.",
      },
      {
        question: "Does SPF check the From address I see in my inbox?",
        answer:
          "No. SPF checks the envelope return-path, which is invisible to the recipient. Aligning that check to the visible From domain is what DMARC alignment does on top of SPF, not SPF itself.",
      },
    ],
  },
  {
    slug: "dkim",
    term: "DKIM (DomainKeys Identified Mail)",
    aliases: ["DomainKeys Identified Mail", "DKIM signature", "DKIM record"],
    category: "authentication",
    shortDefinition:
      "DKIM signs outgoing mail with a private key and publishes the matching public key in DNS, so a receiver can verify the message was not altered in transit and genuinely came from the signing domain.",
    body: [
      {
        heading: "Where the public key lives",
        content:
          "The public key is published as a DNS TXT record at `<selector>._domainkey.<domain>`, where the selector is an arbitrary label the sender chooses and puts in the `DKIM-Signature` header of every message it signs. A domain can publish several selectors at once — useful for rotating keys or running multiple sending systems — and a receiver only ever looks up the one selector named in the specific message it is verifying.",
      },
      {
        heading: "What the record's tags mean",
        content:
          "The record starts with `v=DKIM1`, names a key type with `k=` (`rsa` by default, or `ed25519`), and carries the actual public key in `p=`. An empty `p=` tag is not an error, it is a deliberate revocation: the key is intentionally disabled while the record stays in place. `h=` restricts which hash algorithms are acceptable — publishing `sha1` without `sha256` is flagged as a warning by Wraps' checker — and `t=y` marks the key as being in testing mode, where a failure should be logged but not acted on.",
      },
      {
        heading: "Key size is a real, checkable number",
        content:
          "For RSA keys, Wraps' email-check package estimates bit length from the base64-decoded `p=` value and treats anything under 1024 bits as an outright error and anything under 2048 as a warning. 2048-bit RSA is the current baseline; some providers still publish 1024-bit keys from years-old setups, and those are the ones most likely to fail a modern deliverability audit even though they technically still validate.",
      },
      {
        heading: "Providers don't all use predictable selectors",
        content:
          "Discovering DKIM by guessing selectors only works when the provider uses well-known ones. AWS SES generates a random per-identity selector rather than a fixed one, so a generic selector scan will not find it — the actual selector has to come from the SES console or the DKIM record it publishes at verification time. SendGrid and Mailgun similarly use their own custom selector conventions rather than a single industry-standard name, which is why a DKIM lookup tool has to either be told the selector or fall back to checking a large list of known vendor conventions.",
      },
    ],
    whyItMatters:
      "DKIM is the authentication mechanism that survives forwarding, because the signature travels with the message body and headers rather than depending on which server relayed it — unlike SPF, which breaks the moment a message is forwarded through a server not in the original sender's SPF record. It is also the mechanism DMARC alignment most commonly relies on for exactly that reason.",
    howToCheck: "dig +short TXT selector._domainkey.example.com",
    relatedSlugs: ["dkim-selector", "dmarc", "dmarc-alignment", "spf"],
    seeAlso: [
      {
        label: "Domain Verification guide",
        href: "/docs/guides/domain-verification",
      },
      {
        label: "MAIL FROM domain is not verified",
        href: "/ses/errors/mail-from-domain-not-verified",
      },
    ],
    faqs: [
      {
        question: "Why is my DKIM record's p= tag empty?",
        answer:
          "An empty p= is a deliberate revocation, not a broken record. Whoever manages the domain intentionally disabled that key while leaving the record in place, usually mid-rotation or after retiring a sending system.",
      },
      {
        question: "What DKIM key size should I use?",
        answer:
          "2048-bit RSA. Anything under 1024 bits fails outright on a modern check, and 1024-2047 bits passes but is flagged, because it is weaker than current guidance recommends for a key that has to stay secure for years.",
      },
      {
        question: "Why can't a DKIM checker find my AWS SES selector?",
        answer:
          "SES generates a random per-identity selector rather than a predictable one, so a tool has to read the actual selector from the SES console or the DNS records SES itself published, not guess it from a common-selector list.",
      },
    ],
  },
  {
    slug: "dmarc",
    term: "DMARC (Domain-based Message Authentication, Reporting & Conformance)",
    aliases: ["DMARC record", "DMARC policy", "p=reject", "p=quarantine"],
    category: "authentication",
    shortDefinition:
      "DMARC is a DNS TXT record that tells receivers what to do with mail claiming your domain that fails SPF and DKIM alignment, and where to send reports about it — the enforcement layer on top of both.",
    body: [
      {
        heading: "The one required tag decides everything downstream",
        content:
          'The record lives at `_dmarc.<domain>`, starts with `v=DMARC1`, and requires exactly one tag: `p=`, set to `none`, `quarantine`, or `reject`. `none` means monitor only — nothing is rejected because of this policy, which makes it the correct starting point while you confirm every legitimate sending source is authenticated, but it is not enforcement and should not be treated as "DMARC is set up." `quarantine` and `reject` are the two enforcing policies; only they change what a receiver actually does with a failing message.',
      },
      {
        heading: "np= closes a gap p= and sp= do not cover",
        content:
          "DMARCbis (RFC 9989) added `np=`, the policy for subdomains that do not exist at all — closing a spoofing gap where an attacker sends as a made-up subdomain of your domain that has no MX, no A record, nothing. `sp=` only covers subdomains that do exist; without `np=`, a non-existent subdomain effectively falls back to `p=none` regardless of how strict your main policy is. Wraps' checker warns when a domain is enforcing at the top level but has no `np=` set.",
      },
      {
        heading: "t=y replaced pct= for ramping into enforcement",
        content:
          "The older way to ramp into an enforcing policy gradually was `pct=`, applying the policy to only a percentage of failing mail. DMARCbis retires that: modern receivers apply the policy as all-or-nothing and ignore `pct=` below 100. The replacement is `t=y`, a testing flag that tells receivers to evaluate the policy for reporting purposes but not to act on it — the honest way to watch what an enforcing policy would do before it actually does it.",
      },
      {
        heading: 'Alignment mode, reporting, and what "enforcing" means here',
        content:
          '`aspf=`/`adkim=` set alignment strictness (see the `dmarc-alignment` entry), `rua=`/`ruf=` name mailto: addresses for aggregate and forensic reports, and `pct=100` (or omitted) is the only value that still does what it says. Throughout Wraps\' own content, "enforcing" means `p=quarantine` or `p=reject` specifically — `p=none` is DMARC published, not DMARC enforcing, and BIMI eligibility and several other downstream benefits depend on that distinction rather than on the record simply existing.',
      },
    ],
    whyItMatters:
      "A DMARC record with p=none is table stakes and is not a defense against spoofing — it is a listening post. Moving to an enforcing policy is the step that actually stops a forged message from reaching the recipient's inbox using your domain's name, and it is also the step that unlocks BIMI, since BIMI explicitly checks for an enforcing DMARC policy before it will show a brand logo.",
    howToCheck: "dig +short TXT _dmarc.example.com",
    relatedSlugs: ["spf", "dkim", "dmarc-alignment", "bimi"],
    seeAlso: [
      {
        label: "Your DMARC Policy Is Useless",
        href: "/blog/your-dmarc-policy-is-useless",
      },
      {
        label: "DMARCbis: What RFC 9989 Changes",
        href: "/blog/dmarcbis-what-changes",
      },
    ],
    faqs: [
      {
        question: "Is p=none the same as having DMARC set up?",
        answer:
          "It publishes a record, but it enforces nothing — a message that fails alignment is still delivered exactly as if no DMARC record existed. Reports start flowing, but no spoofed mail is actually stopped until the policy moves to quarantine or reject.",
      },
      {
        question: "Should I still use pct= to ramp into DMARC gradually?",
        answer:
          "No. DMARCbis-conformant receivers ignore pct= below 100 and enforce all-or-nothing. Use t=y instead: it evaluates the policy for reporting without acting on it, which is the honest way to see the blast radius before it is real.",
      },
      {
        question: "What does np= protect that sp= does not?",
        answer:
          "sp= only applies to subdomains that actually exist. np=, added in DMARCbis, covers subdomains that do not exist at all, which is exactly the gap an attacker exploits by sending from a made-up subdomain with no other DNS records.",
      },
      {
        question: "Do I need DMARC if I already have SPF and DKIM?",
        answer:
          "Yes. SPF and DKIM each authenticate independently, but neither one ties its result back to the visible From address a recipient reads. DMARC is the layer that requires one of them to align with that From domain and states what happens when neither does.",
      },
    ],
  },
  {
    slug: "bimi",
    term: "BIMI (Brand Indicators for Message Identification)",
    aliases: [
      "Brand Indicators for Message Identification",
      "BIMI record",
      "email logo",
    ],
    category: "authentication",
    shortDefinition:
      "BIMI is a DNS record that points a supporting mailbox provider at a domain's SVG logo, displayed next to authenticated mail — but only once DMARC is already enforcing.",
    body: [
      {
        heading: "The record and its two tags",
        content:
          "The record lives at `default._bimi.<domain>`, starts with `v=BIMI1`, and carries `l=`, the HTTPS URL of the SVG logo, as the one required field. An optional `a=` tag points to a Verified Mark Certificate (VMC) or Common Mark Certificate (CMC) — a certificate that some mailbox providers require before they will display the logo at all, and that others treat as an enhancement to trust rather than a hard requirement.",
      },
      {
        heading: "DMARC has to be enforcing first",
        content:
          "BIMI is specified to require an enforcing DMARC policy — quarantine or reject — because the logo is a trust signal, and a domain that has not committed to rejecting unauthenticated mail claiming to be it has not earned that signal. A BIMI record published against a `p=none` DMARC policy is syntactically valid and functionally inert: no mailbox provider will render the logo.",
      },
      {
        heading: "The SVG has to be a specific, restricted profile",
        content:
          'The logo file is not an ordinary SVG. It has to declare `baseProfile="tiny-ps"` and `version="1.2"`, include a `<title>` element, and must not contain scripts, animation, embedded raster images, `<foreignObject>` elements, or external references — no fonts loaded from elsewhere, no linked images. The root `<svg>` element cannot carry `x=` or `y=` attributes, the viewBox has to be square, and the file has to stay under roughly 32KB. Every one of those is an automatic rejection reason, not a soft warning, for the mailbox providers that validate strictly.',
      },
      {
        heading: "VMC verification is a real gap worth knowing about",
        content:
          'Full X.509 certificate-chain verification of a VMC is genuinely hard to implement correctly and is not something every BIMI-checking tool does, including Wraps\' own — it probes the VMC URL for HTTPS reachability, not full certificate validity. Treat a green VMC-reachability check as "the URL answers," not as "the certificate is valid and trusted," and expect real gaps between tools here for a while yet.',
      },
    ],
    whyItMatters:
      "A logo next to a message in the inbox list is a visible, differentiating trust signal at the exact moment a recipient decides whether to open a message — and it is unavailable to any domain that has not first done the harder, less visible work of getting DMARC to an enforcing policy. BIMI is a reward for authentication maturity, not a shortcut around it.",
    howToCheck: "dig +short TXT default._bimi.example.com",
    relatedSlugs: ["dmarc", "spf", "dkim"],
    seeAlso: [{ label: "DMARC glossary entry", href: "/glossary/dmarc" }],
    faqs: [
      {
        question: "Can I set up BIMI before DMARC is enforcing?",
        answer:
          "You can publish the record, but no mailbox provider will render the logo until your DMARC policy is quarantine or reject. BIMI is specified to depend on enforcement, not just presence.",
      },
      {
        question: "Do I need a Verified Mark Certificate for BIMI to work?",
        answer:
          "It depends on the mailbox provider. Some require a VMC or CMC before displaying the logo at all, others treat it as optional trust enhancement. Check the requirement for each provider you care about rather than assuming one answer covers all of them.",
      },
      {
        question:
          "Why was my BIMI logo rejected even though it opens fine in a browser?",
        answer:
          "BIMI requires the restricted SVG Tiny P/S profile, not an ordinary SVG. A browser will happily render scripts, embedded images, or a missing baseProfile attribute that a strict BIMI validator rejects outright.",
      },
    ],
  },
  {
    slug: "mta-sts",
    term: "MTA-STS (SMTP MTA Strict Transport Security)",
    aliases: ["SMTP MTA Strict Transport Security", "MTA-STS policy"],
    category: "authentication",
    shortDefinition:
      "MTA-STS (RFC 8461) lets a domain require that inbound mail delivered to it use encrypted, authenticated SMTP, closing the downgrade and interception attacks plain SMTP TLS leaves open.",
    body: [
      {
        heading: "Two parts have to exist together",
        content:
          "MTA-STS needs a DNS TXT record at `_mta-sts.<domain>` announcing that a policy exists and its version, and a separate policy file served over HTTPS at `https://mta-sts.<domain>/.well-known/mta-sts.txt` that actually states the enforcement mode and which MX hosts are authorized. The DNS record alone does nothing; a sending server that supports MTA-STS fetches and caches the policy file before it will honor it.",
      },
      {
        heading: "Testing mode exists for a reason",
        content:
          "The policy file's `mode` can be `none`, `testing`, or `enforce`. `testing` behaves like `enforce` for the purposes of generating reports (paired with TLS-RPT) but does not actually reject connections that fail to meet the policy — the same staged-rollout instinct DMARC's `t=y` serves, applied to transport security instead of message authentication. Moving straight to `enforce` without first watching what `testing` reports risks losing legitimate mail from senders whose SMTP configuration does not yet meet the policy.",
      },
      {
        heading: "This protects mail coming in, not mail going out",
        content:
          "MTA-STS is about how other people's mail servers deliver mail to your domain, the opposite direction from SPF, DKIM, and DMARC, which govern how receivers judge mail claiming to be from your domain. Without MTA-STS, an attacker in a position to intercept SMTP traffic can attempt a downgrade to unencrypted delivery or present a fraudulent certificate, and a sending server with no enforced policy to check against has no way to know that is happening.",
      },
      {
        heading:
          "Wraps' checker has the scoring formula for this but not the check itself, yet",
        content:
          "Wraps' scoring code carries a real, specific bonus for a validated MTA-STS policy — a couple of points for `enforce`, less for `testing` — the same shape as the small bonuses it gives BIMI and DNSSEC. What it doesn't have yet is the check that would feed that bonus: `mtaStsResult`, `tlsRptResult`, and `dnssecResult` are all hardcoded stub values in the checker today, never actually looked up over DNS or fetched over HTTPS, so the bonus is dead code that nothing currently triggers. A domain with a correct, fully enforcing MTA-STS policy and one with no MTA-STS record at all score identically on this dimension right now.",
      },
    ],
    whyItMatters:
      "Plain SMTP negotiates TLS opportunistically with STARTTLS, which means a network attacker who can intercept the connection before STARTTLS negotiates can simply strip it and force plaintext delivery, and the receiving side has no standard way to notice. MTA-STS turns that from an invisible downgrade into a policy violation a sender can be required to honor and report on.",
    howToCheck: "dig +short TXT _mta-sts.example.com",
    relatedSlugs: ["tls-rpt", "dmarc", "mx-record"],
    seeAlso: [
      {
        label: "Domain Verification guide",
        href: "/docs/guides/domain-verification",
      },
    ],
    faqs: [
      {
        question:
          "Do I need both the DNS record and the policy file for MTA-STS to work?",
        answer:
          "Yes. The DNS TXT record only announces that a policy exists; the actual enforcement mode and authorized MX hosts live in the HTTPS-served policy file. A sending server fetches and caches that file — the DNS record alone changes nothing about how mail is delivered.",
      },
      {
        question: "What does MTA-STS testing mode actually do?",
        answer:
          "It generates the same TLS-RPT reports enforce mode would, so you can see what would have been rejected, but it does not actually reject any connection. It is the safe way to validate a policy before it can affect real mail delivery.",
      },
      {
        question: "Does MTA-STS replace SPF, DKIM, or DMARC?",
        answer:
          "No. Those three govern whether mail claiming to be from your domain is authentic. MTA-STS governs how mail is transported to your domain over SMTP. They solve different problems and are commonly deployed together, not as alternatives.",
      },
    ],
  },
  {
    slug: "tls-rpt",
    term: "TLS-RPT (SMTP TLS Reporting)",
    aliases: ["SMTP TLS Reporting", "TLS reporting record"],
    category: "authentication",
    shortDefinition:
      "TLS-RPT (RFC 8460) is a DNS record naming an address that receives daily aggregate reports of SMTP transport-security failures against your domain, the reporting half of MTA-STS.",
    body: [
      {
        heading: "The record and what it points at",
        content:
          "TLS-RPT lives at `_smtp._tls.<domain>` as a DNS TXT record, starting with `v=TLSRPTv1` and a `rua=` tag naming one or more report destinations, most commonly a `mailto:` address. The shape is deliberately similar to DMARC's own `rua=` reporting mechanism — a familiar pattern applied to a different layer of the mail path.",
      },
      {
        heading:
          "It reports failures MTA-STS and DANE can't tell you about directly",
        content:
          "Without TLS-RPT, a domain enforcing MTA-STS or DANE has no visibility into how often connecting mail servers actually fail to meet the policy — a sending server that cannot negotiate a compliant TLS session to you simply queues, retries, or eventually bounces the message, and nothing tells the receiving domain's operator that it happened. TLS-RPT closes that by having every reporting sender publish daily aggregate statistics: how many sessions succeeded, how many failed, and broken down by failure type and by which sending system.",
      },
      {
        heading: "What actually shows up in a report",
        content:
          "Reports are JSON, aggregated per day and per reporting sending domain, and categorize failures — certificate expired, certificate mismatch, no supported TLS version, MTA-STS policy fetch failure, and so on — rather than reporting on individual messages. It is a health signal on the transport layer, not a message-level audit trail, which is exactly the granularity that matters for spotting a misconfigured MX host or an expiring certificate before it becomes a delivery outage.",
      },
      {
        heading:
          "It is worth almost nothing without MTA-STS or DANE already deployed",
        content:
          "TLS-RPT reports on enforcement outcomes for policies that already exist. Publishing a TLS-RPT record with no MTA-STS policy and no DANE (DNSSEC-backed TLSA records) in place gives you reports about opportunistic STARTTLS behavior that nobody is actually required to honor, which is a much thinner signal than reports about an enforced policy.",
      },
    ],
    whyItMatters:
      "Transport-layer failures are otherwise invisible from the receiving side — a sender that cannot deliver over the required TLS configuration to you does not notify you, it just fails silently from your point of view. TLS-RPT is the only standard mechanism that turns that into a report you can actually read and act on.",
    howToCheck: "dig +short TXT _smtp._tls.example.com",
    relatedSlugs: ["mta-sts", "dmarc"],
    seeAlso: [{ label: "MTA-STS glossary entry", href: "/glossary/mta-sts" }],
    faqs: [
      {
        question: "Do I need MTA-STS for TLS-RPT to be useful?",
        answer:
          "You get far more out of it with MTA-STS (or DANE) already deployed. Without an enforced policy, TLS-RPT reports on opportunistic STARTTLS behavior that nobody was required to follow, which is a much weaker signal than reports on actual policy violations.",
      },
      {
        question: "Is TLS-RPT the same mechanism as DMARC reporting?",
        answer:
          "They share a shape — both are daily aggregate reports sent to a mailto: address named in a DNS record — but they report on different things. DMARC reports on message authentication outcomes; TLS-RPT reports on transport-layer encryption outcomes.",
      },
      {
        question: "What kind of failures show up in a TLS-RPT report?",
        answer:
          "Certificate problems, unsupported TLS versions, and MTA-STS policy fetch failures are the common categories, aggregated per day and per sending domain rather than reported per message.",
      },
    ],
  },
  {
    slug: "dkim-selector",
    term: "DKIM selector",
    aliases: ["selector._domainkey", "DKIM key selector"],
    category: "authentication",
    shortDefinition:
      "The DKIM selector is the label a sender chooses to name a specific public key at <selector>._domainkey.<domain>, letting one domain publish and rotate several DKIM keys at once.",
    body: [
      {
        heading: "Why the selector exists at all",
        content:
          "DKIM signatures name the selector they were signed with directly in the `DKIM-Signature` header (`s=` tag), so a receiver knows exactly which DNS record to fetch rather than needing a single fixed location per domain. That indirection is what makes key rotation possible without downtime: a new selector's record can be published and verified working before the old selector is retired, and multiple sending systems (marketing platform, transactional API, a third-party app) can each sign with their own selector under the same domain simultaneously.",
      },
      {
        heading: "Discovery has to guess, because there is no fixed name",
        content:
          "Since the selector is arbitrary, a tool that wants to find a domain's DKIM records without being told the selector has to guess from known conventions. Wraps' email-check package ships both a quick list (~25 common selectors) and a full list (~100), checked in batches of 10 in parallel, stopping at the first valid, non-revoked hit unless verbose output is requested. That is a scan against likely names, not an exhaustive proof that no DKIM record exists.",
      },
      {
        heading: "Some providers make guessing pointless",
        content:
          "AWS SES issues a randomly generated selector per verified identity rather than a fixed or even a predictable one, so no selector list will find it — the actual value has to come from the SES console or from the CNAME/TXT records SES itself instructs you to publish during domain verification. SendGrid and Mailgun use their own vendor-specific selector conventions that a generic scan may or may not include, which is why a DKIM check that comes back empty does not necessarily mean DKIM is missing.",
      },
      {
        heading: "Selectors don't expire, but keys effectively do",
        content:
          "A selector's DNS record stays exactly as valid as the key it names — there is no separate expiration mechanism for the selector itself. What actually retires a selector is either deleting the record or publishing an empty `p=` tag against it, which is a deliberate revocation rather than an expiry. Rotation in practice means: publish a new selector, confirm outgoing mail is signing with it and validating cleanly, then revoke the old one.",
      },
    ],
    whyItMatters:
      "Without the selector, DKIM would need one public key per domain, which makes rotation and multi-sender setups painful in exactly the way this scheme avoids. Knowing which selector a sending system actually uses — rather than assuming a common one — is usually the difference between a DKIM check that correctly finds nothing and one that incorrectly reports a false negative.",
    howToCheck: "wraps email verify",
    relatedSlugs: ["dkim", "dmarc-alignment"],
    seeAlso: [
      {
        label: "Domain Verification guide",
        href: "/docs/guides/domain-verification",
      },
    ],
    faqs: [
      {
        question: "Can a domain have more than one DKIM selector at once?",
        answer:
          "Yes, and it's common. Each sending system — a marketing platform, a transactional API, an internal app — can sign with its own selector, and a receiver looks up only the one named in the specific message being verified.",
      },
      {
        question:
          "Why does my DKIM check find nothing even though DKIM is set up?",
        answer:
          "The checking tool likely doesn't know the selector your provider actually uses. AWS SES and several other providers generate selectors that aren't in any common-selector list, so a scan against known names can miss a perfectly valid record.",
      },
      {
        question: "How do I rotate a DKIM key without breaking signing?",
        answer:
          "Publish the new selector's record first, confirm outgoing mail is signing with it and validating, then revoke the old selector by emptying its p= tag or removing the record. Never remove the old selector before the new one is confirmed working.",
      },
    ],
  },
  {
    slug: "dmarc-alignment",
    term: "DMARC alignment",
    aliases: ["SPF alignment", "DKIM alignment", "aspf", "adkim"],
    category: "authentication",
    shortDefinition:
      "DMARC alignment is the check that ties a passing SPF or DKIM result back to the domain in the visible From header, using either a strict exact-match mode or a relaxed organizational-domain match.",
    body: [
      {
        heading: "Why passing SPF or DKIM alone isn't enough",
        content:
          "SPF authenticates the envelope return-path and DKIM authenticates whichever domain signed the message — neither one is required to have any relationship to the domain a recipient actually sees in the From: header. A message can pass SPF against a completely unrelated return-path domain and still be a plausible-looking spoof of the domain in From:. Alignment is the rule that closes that gap: for DMARC to pass, at least one of SPF or DKIM has to both pass and align with the visible From domain.",
      },
      {
        heading: "Relaxed is the default, and it means organizational domain",
        content:
          "The `aspf=` and `adkim=` tags in a DMARC record set alignment mode, each independently, to `r` (relaxed, the default when omitted) or `s` (strict). Relaxed mode considers `mail.example.com` and `example.com` aligned, because they share an organizational domain — the registrable domain one level below the public suffix. That is the mode almost every real-world setup with subdomains for different sending systems needs.",
      },
      {
        heading: "Strict mode requires an exact match",
        content:
          "Strict alignment requires the SPF return-path domain (or the DKIM `d=` signing domain) to match the From domain exactly, subdomain and all. A message signed by `mail.example.com` does not align in strict mode against a From address of `example.com`, even though both are clearly the same organization. Strict mode is rarely what you want unless every sending system genuinely signs and sends as the exact From domain.",
      },
      {
        heading: "Only one mechanism has to align, not both",
        content:
          "DMARC's pass condition is SPF-aligned OR DKIM-aligned, not both. This is what makes DKIM the more resilient of the two for DMARC purposes: SPF alignment breaks the moment a message is forwarded through an intermediate server not in the original SPF record, but a DKIM signature travels with the message and can still align correctly after a forward, which is why DKIM is usually the mechanism actually carrying DMARC pass results for mail that transits third-party infrastructure.",
      },
    ],
    whyItMatters:
      "Alignment is the actual anti-spoofing mechanism in DMARC — without it, DMARC would only be checking that SPF or DKIM passed for some domain, which an attacker can arrange for a domain they control while still forging your visible From address. Getting alignment mode wrong (usually by assuming strict when relaxed was needed for a subdomain setup) is a common reason a domain's DMARC pass rate looks lower than its actual SPF/DKIM health would suggest.",
    relatedSlugs: ["dmarc", "spf", "dkim"],
    seeAlso: [
      {
        label: "Your DMARC Policy Is Useless",
        href: "/blog/your-dmarc-policy-is-useless",
      },
    ],
    faqs: [
      {
        question:
          "What's the difference between relaxed and strict DMARC alignment?",
        answer:
          "Relaxed (the default) considers a subdomain aligned with its parent organizational domain, so mail.example.com aligns with example.com. Strict requires an exact domain match, subdomain included, which most multi-system sending setups don't meet.",
      },
      {
        question: "Do both SPF and DKIM need to align for DMARC to pass?",
        answer:
          "No, only one of them. DMARC passes if SPF is aligned and passing, or DKIM is aligned and passing, or both. That either/or is deliberate, since SPF alignment routinely breaks on forwarded mail in a way DKIM alignment does not.",
      },
      {
        question: "Why does my mail pass SPF but still fail DMARC?",
        answer:
          "SPF can pass against a return-path domain that has no alignment with your visible From address — a common setup when a third-party sending platform uses its own return-path. DMARC failing there means the pass didn't align, not that SPF itself is broken.",
      },
    ],
  },
  {
    slug: "return-path",
    term: "Return-path",
    aliases: ["envelope sender", "MAIL FROM address", "bounce address"],
    category: "authentication",
    shortDefinition:
      "The return-path is the envelope-level sender address SPF actually checks and where non-delivery bounces are sent — distinct from, and invisible next to, the visible From address a recipient reads.",
    body: [
      {
        heading: "Two different senders exist on every message",
        content:
          "Every email carries two sender identities: the visible `From:` header, rendered by the recipient's mail client, and the envelope sender established during the SMTP `MAIL FROM` command, which most mail clients never display at all. The return-path is that second, invisible address. They are frequently the same domain and sometimes not — a marketing platform sending on your behalf, for instance, commonly uses its own return-path while your domain stays in From:.",
      },
      {
        heading: "This is the address SPF actually authenticates",
        content:
          "SPF's DNS lookup is performed against the return-path domain, not the From domain — a detail that surprises people who assume SPF is checking the address they see in their inbox. This is exactly why DMARC alignment exists as a separate step: it is the mechanism that requires the return-path domain (when used for SPF) to actually relate back to the visible From domain, rather than trusting an SPF pass against an arbitrary, unrelated domain.",
      },
      {
        heading: "A custom return-path needs its own DNS records",
        content:
          "By default, SES sends bounces through its own shared MAIL FROM domain (something under `amazonses.com`), which works but means the return-path domain doesn't share reputation with your sending domain and can't itself be covered by your SPF record for alignment purposes. Configuring a custom MAIL FROM subdomain fixes that, but that subdomain needs its own MX record pointing at the region's SES inbound endpoint and its own SPF TXT record — separate records from the ones your main sending domain uses. SES reports the domain as pending until both resolve, and a message sent while pending fails with `MailFromDomainNotVerifiedException`.",
      },
      {
        heading: "It's also literally where bounces go",
        content:
          "When a recipient's mail server can't deliver a message, the non-delivery report goes to the return-path address, not to the visible From address — which is the entire reason it is sometimes also called the bounce address. A return-path that nobody monitors, or that points at a domain incapable of receiving mail, means bounce information is generated and then silently discarded rather than feeding back into list hygiene.",
      },
    ],
    whyItMatters:
      'Confusing the return-path with the From address is the single most common reason someone insists "SPF is definitely set up correctly" while a receiver\'s DMARC evaluation disagrees — both statements can be true at once, because they are checking two different addresses on the same message.',
    howToCheck: "dig +short MX mail.example.com",
    relatedSlugs: ["spf", "dmarc-alignment", "hard-bounce"],
    seeAlso: [
      {
        label: "MAIL FROM domain is not verified",
        href: "/ses/errors/mail-from-domain-not-verified",
      },
      {
        label: "Domain Verification guide",
        href: "/docs/guides/domain-verification",
      },
    ],
    faqs: [
      {
        question: "Is the return-path the same as the From address?",
        answer:
          "Not necessarily, and often not. The return-path is the invisible envelope-sender address established at the SMTP protocol level; the From address is what the recipient's mail client actually displays. They're commonly different domains when a third-party platform sends on your behalf.",
      },
      {
        question: "Why does SES need a custom MAIL FROM domain at all?",
        answer:
          "Without one, bounces and SPF checks run against SES's own shared MAIL FROM domain, which doesn't share reputation with your sending domain and can't be covered by your own SPF record. A custom MAIL FROM domain lets SPF alignment actually reflect your domain's reputation.",
      },
      {
        question:
          "What happens to bounce reports if nobody monitors the return-path?",
        answer:
          "They're generated and then effectively discarded — the non-delivery report has nowhere useful to go, so hard bounces never make it into list hygiene, and a sender keeps mailing addresses that are provably dead.",
      },
    ],
  },

  // ---------------------------------------------------------------------
  // Deliverability
  // ---------------------------------------------------------------------
  {
    slug: "soft-bounce",
    term: "Soft bounce",
    aliases: ["temporary bounce", "SMTP 4xx", "transient failure"],
    category: "deliverability",
    shortDefinition:
      "A soft bounce is a temporary delivery failure — a full mailbox, an unreachable server, an oversized message — reported with an SMTP 4xx code, meant to be retried rather than treated as permanent.",
    body: [
      {
        heading: "What actually causes one",
        content:
          "The common causes are a full mailbox, a receiving server that is temporarily down or overloaded, a message that exceeds the recipient's size limit, or a greylisting delay where the receiver deliberately asks the sender to try again shortly. None of these say anything about whether the address is real — they say the delivery attempt itself couldn't complete right now.",
      },
      {
        heading: "The SMTP code family that signals it",
        content:
          "A soft bounce corresponds to an SMTP 4xx response — 421, 450, 451, 452 are common — as opposed to the 5xx family that signals a permanent failure. A well-behaved sending system retries a 4xx with backoff for a bounded period before giving up, rather than either abandoning immediately or retrying forever.",
      },
      {
        heading: "Retrying is expected, retrying forever is not",
        content:
          "The correct response to a soft bounce is a retry, typically with exponential backoff over a window of hours to a couple of days, not an immediate resend and not an indefinite queue. AWS SES itself retries a temporarily undeliverable message automatically for a period before giving up and reporting a final bounce, so most SES senders don't need to build their own soft-bounce retry logic on top of it.",
      },
      {
        heading: "Repeated soft bounces are a reputation signal too",
        content:
          "A single soft bounce is noise. An address that soft-bounces on every single attempt over an extended period is functionally dead even though no individual attempt returned a permanent failure — a full mailbox that's never emptied, for instance, looks exactly like this. Reputation systems and mailbox providers both treat a persistently soft-bouncing address with growing suspicion the longer it goes on, even without a single hard bounce ever occurring.",
      },
    ],
    whyItMatters:
      "Treating a soft bounce like a hard bounce (suppressing the address immediately) throws away legitimate recipients over a transient condition, while treating a persistently soft-bouncing address like it's still healthy quietly degrades sender reputation over time without a single alarm-worthy event ever firing. The right handling sits between those two mistakes.",
    howToCheck:
      "aws sesv2 get-suppressed-destination --email-address bounced@example.com",
    relatedSlugs: ["hard-bounce", "suppression-list", "complaint-rate"],
    seeAlso: [
      { label: "Bounce Handling guide", href: "/docs/guides/bounce-handling" },
      { label: "SES Bounce Rate", href: "/ses/bounce-rate" },
    ],
    faqs: [
      {
        question: "Should I resend a message immediately after a soft bounce?",
        answer:
          "No. Retry with backoff over a period of hours to a couple of days, which is also what SES itself does automatically before reporting a final failure. Immediate resends waste attempts on a condition that usually needs time to clear.",
      },
      {
        question:
          "Does a soft bounce hurt my sender reputation the way a hard bounce does?",
        answer:
          "A single one, generally no. An address that soft-bounces on every attempt for weeks functions like a dead address for reputation purposes even though no individual attempt was a permanent failure, so persistence is what matters, not the type.",
      },
      {
        question: "Does AWS SES retry soft bounces for me automatically?",
        answer:
          "Yes, for a bounded period after a temporary failure, before it reports the message as a final bounce. Most senders on SES don't need to implement their own soft-bounce retry logic on top of that.",
      },
    ],
  },
  {
    slug: "hard-bounce",
    term: "Hard bounce",
    aliases: ["permanent bounce", "SMTP 5xx"],
    category: "deliverability",
    shortDefinition:
      "A hard bounce is a permanent delivery failure — the address or domain doesn't exist — reported with an SMTP 5xx code, and the address should never be sent to again without a fresh, confirmed reason to believe it's valid.",
    body: [
      {
        heading: "What it actually means",
        content:
          "A hard bounce says the recipient's mail server has permanently refused the message, most commonly because the mailbox doesn't exist, the domain doesn't exist or has no MX records, or the account has been closed. Unlike a soft bounce, there is no future retry that fixes this — the condition doesn't resolve itself, it only changes if someone actively re-enters that exact address correctly some other time.",
      },
      {
        heading: "The SMTP code family and what triggers it",
        content:
          "A hard bounce corresponds to an SMTP 5xx response — 550 (mailbox unavailable) is the classic example — distinct from the 4xx family that signals soft, temporary failures. Some receivers are stricter than others about which conditions they report as 5xx versus 4xx, so the boundary isn't always perfectly crisp in practice, but a genuine 5xx is meant to be treated as final.",
      },
      {
        heading: "SES suppresses it automatically",
        content:
          "AWS SES adds a hard-bounced address to the account-level suppression list automatically, and by default refuses to send to a suppressed address again without an explicit override. This is the single biggest structural difference between running SES directly and running a self-hosted mail server, where nothing suppresses a hard-bounced address unless you build that logic yourself.",
      },
      {
        heading:
          "This is the number that gets accounts paused — but not every hard bounce counts",
        content:
          "AWS's bounce rate is narrower than \"hard bounces\" as a whole: it counts only hard bounces to domains you have not verified in SES. A hard bounce against a domain you've verified — including your own test domains — is excluded entirely, and soft bounces never count toward this metric either way. There's no fixed window it's measured over; AWS computes it across a representative volume of recent sending that varies per sender, which is also why you can't reproduce the exact number yourself from the console. A list with a persistently high rate against unverified domains is a list-acquisition problem (purchased lists, no confirmation step, years-old addresses never re-verified), and suppressing individual bad addresses after the fact treats the symptom without fixing what keeps adding new ones.",
      },
    ],
    whyItMatters:
      "Hard bounces are the clearest, least ambiguous signal a mailbox provider has that a sender doesn't maintain its list — every other reputation signal has some noise or subjectivity to it, but an address that simply does not exist is unambiguous. That's exactly why it carries so much weight in both AWS's own thresholds and every major mailbox provider's reputation scoring.",
    howToCheck: "aws sesv2 list-suppressed-destinations --reasons BOUNCE",
    relatedSlugs: ["soft-bounce", "suppression-list", "return-path"],
    seeAlso: [
      { label: "SES Bounce Rate", href: "/ses/bounce-rate" },
      {
        label: "Suppression Lists guide",
        href: "/docs/guides/suppression-lists",
      },
    ],
    faqs: [
      {
        question: "Should I ever retry sending to a hard-bounced address?",
        answer:
          "Not without a specific, fresh reason to believe the address is valid again — the condition that caused a hard bounce (nonexistent mailbox or domain) doesn't resolve on its own. SES will refuse to send to it anyway unless you explicitly override the suppression.",
      },
      {
        question:
          "Does SES automatically stop me from re-sending to a bounced address?",
        answer:
          "Yes. SES adds hard-bounced addresses to its account-level suppression list and refuses further sends to them by default, which is a meaningful safety net compared to a self-hosted setup where nothing enforces that unless you build it.",
      },
      {
        question: "How does a hard bounce affect my SES account's bounce rate?",
        answer:
          "Only if the domain isn't verified in your SES account. AWS states the bounce rate counts exclusively hard bounces to unverified domains — a hard bounce against a domain you've verified, including your own test domains, doesn't count at all, and neither does a soft bounce either way.",
      },
    ],
  },
  {
    slug: "complaint-rate",
    term: "Complaint rate",
    aliases: [
      "spam complaint rate",
      "abuse complaint rate",
      "FBL complaint rate",
    ],
    category: "deliverability",
    shortDefinition:
      "Complaint rate is the share of delivered messages a recipient actively marked as spam, and AWS reviews an SES account at 0.1% and may pause sending at 0.5% — thresholds far tighter than the bounce-rate ones.",
    body: [
      {
        heading: "It measures rejection, not a delivery problem",
        content:
          'A bounce means the message failed to reach a mailbox. A complaint means it reached the mailbox, the recipient saw it, and actively clicked "report spam" or the equivalent. That makes complaint rate a stronger and more damaging signal than bounce rate for the same reason a customer complaint is worse for a business than an order that simply never arrived: it\'s evidence of active, specific rejection rather than a logistics failure.',
      },
      {
        heading: "The visible number understates the real one",
        content:
          "Complaint feedback only reaches the sender through mailbox providers that operate a feedback loop and report back — not every provider does, and not every recipient who is annoyed by a message bothers clicking report-spam versus simply deleting it or, worse, silently disengaging. What a sender can actually measure is a lower bound on how many recipients found the message unwanted, not the true figure.",
      },
      {
        heading: "AWS's thresholds sit at a fraction of the bounce-rate ones",
        content:
          "Where SES reviews bounce rate at roughly 5% and may pause at 10%, complaint rate is reviewed at 0.1% and may trigger a pause at 0.5% — fifty times tighter as a proportion. That gap reflects how much more weight a mailbox provider (and therefore AWS, whose own reputation with those providers depends on its senders' behavior) puts on an active complaint versus a failed delivery attempt.",
      },
      {
        heading: "Suppression on complaint is not optional in practice",
        content:
          "SES adds a complained-about address to the account-level suppression list the same way it does for a hard bounce, and sending to that address again is both against the point and, without an override, blocked by SES itself. The only real lever a sender has against complaint rate is upstream: better list acquisition, more relevant content, and an unsubscribe path recipients will actually use instead of the report-spam button.",
      },
    ],
    whyItMatters:
      "Complaint rate is the metric where the incentive structure most obviously rewards fixing the cause rather than the symptom — suppressing a complained-about address after the fact does nothing for the underlying reason recipients are complaining, which is almost always irrelevant content, unclear sender identity, or a broken unsubscribe path that pushes people toward reporting spam as the only visible way out.",
    relatedSlugs: ["hard-bounce", "feedback-loop", "list-unsubscribe"],
    seeAlso: [
      { label: "SES Complaint Rate", href: "/ses/complaint-rate" },
      { label: "Domain Reputation guide", href: "/docs/guides/reputation" },
    ],
    faqs: [
      {
        question:
          "Why is the SES complaint-rate threshold so much lower than the bounce-rate one?",
        answer:
          "AWS reviews at 0.1% complaints against roughly 5% for bounces, because a complaint is direct evidence a real recipient saw the message and actively rejected it — a far stronger and more damaging signal to mailbox providers than a delivery failure.",
      },
      {
        question:
          "Does my measured complaint rate reflect every recipient who's annoyed?",
        answer:
          "No. It only counts complaints that a feedback-loop-participating mailbox provider actually reports back. Recipients who delete unwanted mail without clicking report-spam, or who are on a provider without a feedback loop, don't show up in the number at all.",
      },
      {
        question: "What actually lowers a persistently high complaint rate?",
        answer:
          "Upstream fixes: better list acquisition (see double opt-in), more relevant and expected content, and a working unsubscribe path recipients will actually use. Suppressing individual complained-about addresses after the fact doesn't touch the reason people are complaining.",
      },
    ],
  },
  {
    slug: "spam-trap",
    term: "Spam trap",
    aliases: ["honeypot address", "trap address"],
    category: "deliverability",
    shortDefinition:
      "A spam trap is an email address mailbox providers or anti-spam organizations control specifically to catch senders with poor list hygiene — a hit confirms the practice, not a one-off mistake.",
    body: [
      {
        heading: "Pristine traps catch acquisition problems",
        content:
          "A pristine trap is an address that was never used by a real person and never opted into anything — it exists solely as bait. The only way a sender's message reaches one is through a list built by scraping, purchasing, or otherwise acquiring addresses without genuine, individual opt-in, because a legitimately confirmed subscriber list has no path to a pristine trap ever entering it.",
      },
      {
        heading: "Recycled traps catch stale-list problems",
        content:
          "A recycled trap was a real, previously active mailbox that its owner abandoned, and the mailbox provider — after a defined dormancy period, often 12 months or more of inactivity — repurposes the address as a trap rather than letting it sit unused. This is the trap type that catches senders with an otherwise legitimate list who simply never re-verify or re-permission stale addresses over time.",
      },
      {
        heading: "A single hit is a signal, not a catastrophe",
        content:
          "One spam-trap hit rarely gets an account penalized on its own — mailbox providers and blocklist operators are generally watching for a pattern, not a single occurrence, since even careful senders occasionally acquire or retain one. A sustained pattern of trap hits, on the other hand, is treated as strong evidence of systemic list-hygiene failure and is a common trigger behind a domain or IP landing on a blocklist.",
      },
      {
        heading: "There's no way to detect a trap in advance",
        content:
          "A trap address looks exactly like a normal email address to a sender — there's no header, no DNS lookup, no API response that flags it before you send. The only defense is preventing bad addresses from entering the list in the first place (see double opt-in) and removing addresses that have gone dormant for an extended period, rather than trying to identify traps directly.",
      },
    ],
    whyItMatters:
      "Spam traps are the mechanism that makes list hygiene an active, ongoing discipline rather than a one-time cleanup — a list that was clean at signup degrades on its own as real people abandon addresses, and every abandoned address is a candidate to eventually become a recycled trap.",
    relatedSlugs: ["double-opt-in", "blocklist", "hard-bounce"],
    seeAlso: [
      { label: "Domain Reputation guide", href: "/docs/guides/reputation" },
    ],
    faqs: [
      {
        question:
          "What's the difference between a pristine and a recycled spam trap?",
        answer:
          "A pristine trap was never a real mailbox — it exists purely as bait and can only be reached through scraped or purchased lists. A recycled trap was a real, abandoned mailbox that a provider repurposed after a dormancy period, so it catches otherwise-legitimate lists that never remove stale addresses.",
      },
      {
        question: "Can I check whether an address on my list is a spam trap?",
        answer:
          "No — a trap address is indistinguishable from a normal one by inspection, header, or API. The only real defense is preventing unverified addresses from entering the list and pruning long-dormant ones before they can be repurposed as traps.",
      },
      {
        question: "Does one spam-trap hit get my account penalized?",
        answer:
          "Usually not on its own. Providers and blocklist operators generally look for a sustained pattern of trap hits as evidence of systemic list-hygiene failure, rather than treating a single occurrence as decisive.",
      },
    ],
  },
  {
    slug: "blocklist",
    term: "Blocklist (DNSBL)",
    aliases: ["blacklist", "DNSBL", "DNS-based blocklist"],
    category: "deliverability",
    shortDefinition:
      "A blocklist (DNSBL) is a DNS-queryable list of IPs or domains associated with unwanted mail — checked by reversing the IP into a lookup subdomain and testing for a listing response.",
    body: [
      {
        heading: "How the DNS trick actually works",
        content:
          "A DNSBL is queried by reversing the octets of an IP address and appending the blocklist's zone — checking `1.2.3.4` against Spamhaus's ZEN list means querying `4.3.2.1.zen.spamhaus.org`. If that query returns an A record in the `127.0.0.0/8` range, the IP is listed; different addresses within that range often encode the listing reason. If the query returns nothing, the IP is clean on that particular list.",
      },
      {
        heading: "A routable answer means something else entirely",
        content:
          "A response outside `127.0.0.0/8` — a normal, routable IP address — does not mean you're listed. It typically means the DNSBL zone itself is misconfigured, wildcarded, or effectively dead, and a checking tool has to explicitly distinguish this case rather than treating any DNS answer as a listing, which is exactly the check Wraps' own blocklist code performs before reporting a result.",
      },
      {
        heading: "Not every blocklist carries equal weight",
        content:
          "Spamhaus's ZEN, SBL, XBL, and DBL lists, along with Barracuda's list, are treated as high-priority because major mailbox providers actually consult them when making delivery decisions. Smaller or more niche blocklists exist by the dozens and being listed on one of those carries far less real-world consequence — a comprehensive check still reports them, but not every listing deserves the same urgency.",
      },
      {
        heading: "Domains get listed too, separately from IPs",
        content:
          "IP-based blocklists (ZEN, XBL, PBL) catch a sending server's reputation; domain-based blocklists like Spamhaus's DBL catch a URL or domain that shows up inside message bodies being sent as spam, regardless of what IP sent it. A clean sending IP with a domain listed on the DBL — commonly because that domain is being abused inside someone else's spam content, not necessarily your own sends — still hurts deliverability.",
      },
    ],
    whyItMatters:
      "A listing on a major DNSBL is one of the few deliverability problems with a genuinely binary effect — mailbox providers that consult Spamhaus's lists will reject or heavily filter mail from a listed IP regardless of how clean everything else about the sender looks, which makes blocklist status worth checking on its own rather than assuming good authentication and low bounce rates are sufficient.",
    howToCheck: "dig +short A 4.3.2.1.zen.spamhaus.org",
    relatedSlugs: ["spam-trap", "hard-bounce", "dedicated-ip"],
    seeAlso: [
      {
        label: "SES Account Under Review or Paused",
        href: "/ses/account-under-review",
      },
    ],
    faqs: [
      {
        question: "How does a DNSBL lookup actually work?",
        answer:
          "The IP's octets are reversed and appended to the blocklist's zone, then queried as a normal DNS A record — a returned address in 127.0.0.0/8 means listed, no answer means clean on that list, and an address outside that range means the zone itself is likely broken rather than an actual listing.",
      },
      {
        question: "Are all blocklists equally important to clear?",
        answer:
          "No. Spamhaus's ZEN, SBL, XBL, and DBL, plus Barracuda's list, matter because major mailbox providers actually consult them. Being listed on a smaller, niche DNSBL has far less real-world delivery impact even though a thorough check will still report it.",
      },
      {
        question:
          "Can my domain get blocklisted even if my sending IP is clean?",
        answer:
          "Yes. Domain-based lists like Spamhaus's DBL track domains appearing in spam content across any sender, not the reputation of a specific sending IP — your domain can be listed because it's being abused inside someone else's spam, independent of your own sending IP's status.",
      },
    ],
  },
  {
    slug: "ip-warming",
    term: "IP warming",
    aliases: ["IP ramp-up", "warming a sending IP"],
    category: "deliverability",
    shortDefinition:
      "IP warming is the gradual, staged increase of sending volume on a new IP so mailbox providers can build a reputation baseline for it before it carries full-scale traffic.",
    body: [
      {
        heading: "Why a cold IP gets filtered even with clean content",
        content:
          "Mailbox providers weigh sending IP reputation heavily, and a brand-new IP has no history at all — no baseline of how recipients respond to mail from it. A sudden burst of high volume from an IP with zero sending history looks statistically identical to the start of a spam run, regardless of how legitimate the actual content is, which is why providers apply heavier filtering to unfamiliar IPs by default.",
      },
      {
        heading: "What a warming schedule actually does",
        content:
          "A warming plan starts at a small daily volume — often just a few hundred messages — sent to the most engaged, most likely-to-open portion of a list, and increases volume incrementally over roughly two to four weeks as positive engagement (opens, replies, low complaints) accumulates. The goal is giving mailbox providers a growing, positive signal to attach to the IP before it ever needs to carry peak volume.",
      },
      {
        heading: "This mostly matters for dedicated IPs",
        content:
          "A shared IP pool, like SES's default sending infrastructure, already carries an aggregate reputation built from every sender using it, so a new account sending through it doesn't start from zero the way a freshly provisioned dedicated IP does. Warming is primarily a dedicated-IP concern — it's the price of owning your own reputation rather than borrowing a pool's established one.",
      },
      {
        heading: "Sending to your worst engagement segment first undoes it",
        content:
          "Warming works because it front-loads positive signal onto an unproven IP. Sending a re-engagement campaign, a purchased list, or any low-engagement segment during the warming window does the opposite of what warming is for — it attaches the negative signal that's most damaging precisely to the IP that has the least existing reputation to absorb it.",
      },
    ],
    whyItMatters:
      "Skipping IP warming on a new dedicated IP is one of the most common ways a deliverability problem gets self-inflicted right at launch — the technical setup (SPF, DKIM, DMARC) can be perfect and the IP still gets aggressively filtered simply because mailbox providers have no reason yet to trust it at volume.",
    relatedSlugs: ["dedicated-ip", "shared-ip", "sending-quota"],
    seeAlso: [
      { label: "Domain Reputation guide", href: "/docs/guides/reputation" },
    ],
    faqs: [
      {
        question: "How long does IP warming take?",
        answer:
          "Typically two to four weeks, starting at a low daily volume sent to the most engaged subscribers and increasing incrementally as positive engagement accumulates, rather than a fixed schedule that applies identically to every sender.",
      },
      {
        question: "Do I need to warm up SES's shared sending IPs?",
        answer:
          "No. Shared IP pools already carry an aggregate reputation built from every sender using them, so a new account doesn't start from zero the way a freshly provisioned dedicated IP does. Warming is a dedicated-IP concern.",
      },
      {
        question:
          "What happens if I send to a low-engagement list during IP warming?",
        answer:
          "It undermines the entire point. Warming works by attaching positive signal to an unproven IP first — sending to a stale or purchased list during that window attaches negative signal precisely when the IP has the least reputation built up to absorb it.",
      },
    ],
  },
  {
    slug: "dedicated-ip",
    term: "Dedicated IP",
    aliases: ["dedicated sending IP", "private sending IP"],
    category: "deliverability",
    shortDefinition:
      "A dedicated IP is a sending IP address assigned to a single sender rather than shared across many, meaning its reputation is entirely and exclusively yours to build and protect.",
    body: [
      {
        heading: "What you're actually buying",
        content:
          "AWS SES offers dedicated IPs as a paid add-on, and a dedicated IP pool can be assigned to a specific configuration set so different traffic types (transactional versus marketing, for instance) send from different dedicated IPs with independently tracked reputations. That separation is the main operational reason to reach for one — isolating a risky sending program from mail that absolutely has to land reliably.",
      },
      {
        heading: "Reputation is all yours, for better or worse",
        content:
          "Every message sent from a dedicated IP contributes to that IP's reputation, and nothing else does — there's no shared pool of other senders' good behavior to fall back on if your own volume is inconsistent or your content quality dips. That cuts both ways: consistent, well-managed sending on a dedicated IP builds a reputation that isn't affected by anyone else's mistakes, but sparse or spiky sending never gives mailbox providers enough signal to trust it.",
      },
      {
        heading:
          "It needs warming, and it needs consistent volume to stay warm",
        content:
          "A newly provisioned dedicated IP starts with zero history and needs a gradual ramp-up (see IP warming) before it can carry full volume. After warming, a dedicated IP also needs sustained, reasonably consistent sending volume to hold its reputation — long gaps followed by a volume spike can cause providers to treat it almost as if it were cold again.",
      },
      {
        heading: "It's the wrong choice below a certain volume",
        content:
          "Below roughly tens of thousands of messages a month, most senders don't generate enough consistent volume to keep a dedicated IP properly warm, and a dedicated IP with sparse sending often performs worse than a well-managed shared pool that benefits from aggregate reputation across many senders. Dedicated IPs earn their cost at genuine, consistent scale, not as a default upgrade.",
      },
    ],
    whyItMatters:
      "A dedicated IP trades the safety net of shared reputation for full control — the right trade at real, consistent volume where isolating your traffic from other senders' behavior matters, and the wrong one below that volume where you'd be building reputation from scratch with too little traffic to build it well.",
    howToCheck: "aws sesv2 list-dedicated-ip-pools",
    relatedSlugs: ["shared-ip", "ip-warming", "sending-quota"],
    seeAlso: [
      { label: "Domain Reputation guide", href: "/docs/guides/reputation" },
    ],
    faqs: [
      {
        question: "When does a dedicated IP make sense over SES's shared pool?",
        answer:
          "Roughly at consistent, meaningful volume — tens of thousands of messages a month or more — where isolating your reputation from other senders, or separating transactional from marketing traffic onto different pools, becomes worth the cost and the warming effort.",
      },
      {
        question: "Does a dedicated IP need ongoing maintenance after warming?",
        answer:
          "Yes. It needs sustained, reasonably consistent sending volume to hold its reputation — a long gap followed by a volume spike can make mailbox providers treat it almost as if it were cold again, undoing much of the original warming effort.",
      },
      {
        question:
          "Can I use different dedicated IPs for different types of mail?",
        answer:
          "Yes, by assigning a dedicated IP pool to a specific configuration set. This is a common way to keep a risky marketing program's reputation from affecting transactional mail that has to land reliably, since each pool's reputation is tracked independently.",
      },
    ],
  },
  {
    slug: "shared-ip",
    term: "Shared IP",
    aliases: ["shared sending pool", "shared IP pool"],
    category: "deliverability",
    shortDefinition:
      "A shared IP is a sending address used by many senders at once, whose reputation reflects the collective behavior of everyone in the pool rather than any single sender's own history.",
    body: [
      {
        heading: "SES's default is a shared pool",
        content:
          "Unless you provision a dedicated IP, SES sends every message through its own managed shared IP infrastructure. That pool already has an established, actively managed reputation across major mailbox providers, built from the aggregate sending behavior of everyone using it — which is why a brand-new SES account can send its first messages without going through an IP-warming period the way a fresh dedicated IP would need.",
      },
      {
        heading:
          "Good behavior for you means good behavior for everyone in the pool",
        content:
          "Because reputation is collective, a shared pool's health depends on AWS actively managing who uses it and how — monitoring bounce and complaint rates across the pool, and taking action against accounts that damage it. This is part of why AWS enforces bounce and complaint thresholds account-wide rather than leaving reputation entirely to market forces: a shared resource needs active moderation to stay usable for everyone on it.",
      },
      {
        heading: "The trade-off is exposure to other senders' mistakes",
        content:
          "In principle, another sender's bad behavior on the same shared IP pool could affect deliverability for everyone using it, which is the theoretical downside of shared infrastructure. In practice, AWS's pool management and scale reduce this risk considerably compared to a smaller or less actively managed shared pool, but it is not zero — it's the trade-off shared infrastructure makes for not needing warming or isolated reputation management.",
      },
      {
        heading: "Right choice for most senders below dedicated-IP volume",
        content:
          "For low or inconsistent sending volume, a shared pool's aggregate reputation is genuinely an advantage rather than a compromise — there's no volume threshold below which shared sending becomes a mistake, unlike a dedicated IP, which actively needs consistent volume to stay healthy. Most SES senders should stay on the shared pool by default and move to dedicated IPs only when volume and isolation needs justify it.",
      },
    ],
    whyItMatters:
      "The shared pool is why SES works reasonably well for a new sender on day one without a multi-week warming ramp — the alternative, provisioning everyone a cold dedicated IP by default, would make low-volume and early-stage sending dramatically harder than it needs to be.",
    relatedSlugs: ["dedicated-ip", "ip-warming"],
    seeAlso: [
      { label: "Domain Reputation guide", href: "/docs/guides/reputation" },
    ],
    faqs: [
      {
        question:
          "Do I need to warm up SES's shared IPs before sending at volume?",
        answer:
          "No. The shared pool already carries an established, actively managed reputation built from every sender using it, which is exactly why new SES accounts can send without a dedicated warming period.",
      },
      {
        question:
          "Can another sender on the same shared IP hurt my deliverability?",
        answer:
          "In principle yes, since reputation is collective, but in practice AWS actively monitors and manages who uses the shared pool and how, which considerably reduces the real-world risk compared to a smaller, less-managed shared pool elsewhere.",
      },
      {
        question: "At what volume should I move off the shared IP pool?",
        answer:
          "There's no fixed number, but roughly tens of thousands of consistent messages a month is where isolating your own reputation, or separating transactional from marketing traffic, starts to be worth a dedicated IP's cost and warming effort.",
      },
    ],
  },
  {
    slug: "inbox-placement",
    term: "Inbox placement",
    aliases: ["inbox placement rate", "spam folder placement"],
    category: "deliverability",
    shortDefinition:
      "Inbox placement is whether a message that was successfully delivered actually lands in the primary inbox, a secondary tab, or the spam folder — a decision no sender, including AWS, can see or guarantee from the outside.",
    body: [
      {
        heading: "Delivery and placement are two different outcomes",
        content:
          "A message SES reports as delivered has been accepted by the recipient's mail server — that's delivery. What that mail server then does with it internally (primary inbox, a promotions or social tab, or the spam folder) is placement, decided by the receiving provider's own filtering logic, and it happens entirely after the point where a sender's own event data stops. A 100% delivery rate says nothing about placement.",
      },
      {
        heading: "There is no reliable way to measure it directly",
        content:
          "Unlike delivery, bounce, or complaint, placement isn't reported back to a sender through any standard mechanism — there's no event, no webhook, no API call that tells you a specific message landed in spam versus the primary inbox for a specific recipient. Third-party seed-list panels (sending to a controlled panel of test mailboxes across providers and checking where each copy landed) are the closest proxy the industry has, and even those only sample a handful of provider configurations out of the enormous variety recipients actually use.",
      },
      {
        heading: "Authentication and reputation are the levers, not a setting",
        content:
          "There's no placement dial to turn — the closest a sender gets to influencing it is the same set of levers that drive every other deliverability outcome: passing SPF/DKIM/DMARC, keeping bounce and complaint rates low, sending content recipients actually engage with, and building sending history and reputation over time. Placement is the downstream result of all of that, not a separate thing to optimize on its own.",
      },
      {
        heading: "No vendor, including AWS, can promise a result",
        content:
          "Every major sending platform, and AWS's own documentation, is explicit that inbox placement cannot be guaranteed — it's determined by the receiving provider's proprietary filtering, which is neither disclosed nor stable, and legitimately varies by recipient, by provider, and over time for the exact same sender and content.",
      },
    ],
    whyItMatters:
      'Confusing a clean delivery rate with good inbox placement is one of the most common ways a sender misreads their own deliverability health — a domain can show near-perfect delivered/bounced/complained numbers while a meaningful share of that "delivered" mail is actually landing in spam, invisible to every metric the sender can see directly.',
    relatedSlugs: ["complaint-rate", "feedback-loop"],
    seeAlso: [{ label: "SES Emails Going to Spam", href: "/ses/spam-folder" }],
    faqs: [
      {
        question:
          "If SES reports a message as delivered, did it reach the inbox?",
        answer:
          "It reached the recipient's mail server, which is delivery. Whether that server then routed it to the primary inbox, a secondary tab, or spam is placement — a separate outcome that delivery data doesn't tell you anything about.",
      },
      {
        question: "How do I measure my actual inbox placement rate?",
        answer:
          "There's no direct, standard way — no event or API reports it. Third-party seed-list panels that send to controlled test mailboxes across providers are the closest proxy available, though they only sample a fraction of real-world provider configurations.",
      },
      {
        question: "Can Wraps or AWS guarantee my mail lands in the inbox?",
        answer:
          "No, and neither can any other sending platform. Placement is decided by the receiving mailbox provider's own filtering logic, which is undisclosed and can vary by recipient and over time even for identical senders and content.",
      },
    ],
  },
  {
    slug: "feedback-loop",
    term: "Feedback loop (FBL)",
    aliases: ["FBL", "ISP feedback loop", "complaint feedback loop"],
    category: "deliverability",
    shortDefinition:
      "A feedback loop is a mailbox provider's mechanism for forwarding a recipient's spam complaint back to the sending infrastructure, so the address can be suppressed and the underlying cause investigated.",
    body: [
      {
        heading: "The traditional model requires per-ISP enrollment",
        content:
          "For a self-hosted mail server, participating in feedback loops usually means separately enrolling with each major mailbox provider that offers one — the enrollment process, the report format, and even which providers offer an FBL at all vary, and providers that don't offer one give a sender no visibility into complaints from their users at all beyond indirect signals.",
      },
      {
        heading: "SES routes complaints through its own event system instead",
        content:
          "Running through SES sidesteps most of that per-provider enrollment burden — AWS maintains its own relationships with major mailbox providers and surfaces a `Complaint` event through the same SNS/EventBridge event stream used for bounces and deliveries, in a consistent format regardless of which provider the complaint originated from. A configuration set determines where those complaint notifications actually route.",
      },
      {
        heading: "What arrives in a complaint event",
        content:
          "A complaint notification typically carries the complaining recipient's address, the timestamp, and where available a complaint-type classification (abuse, fraud, virus, and so on) the reporting provider assigned. It does not carry the full context of why the recipient complained — that's inference a sender has to do from patterns across complaints, not something the event itself explains.",
      },
      {
        heading:
          "The action a feedback loop enables is suppression, immediately",
        content:
          "The entire operational point of an FBL is enabling near-real-time suppression: an address that complains should stop receiving mail before the next send, not at the next manual list-cleanup pass. SES's automatic suppression-list behavior on complaint (the same mechanism used for hard bounces) is effectively feedback-loop handling built into the platform rather than logic a sender has to wire up separately.",
      },
      {
        heading:
          "Consuming the event stream is still a sender's own responsibility",
        content:
          "SES surfacing a complaint event does not, by itself, do anything beyond adding the address to the suppression list — anything beyond that, like alerting a human when the complaint rate on a specific campaign spikes, or correlating complaints against a recent content or list-source change, requires a consumer actually subscribed to that configuration set's event destination and watching for it.",
      },
    ],
    whyItMatters:
      "Feedback loops are the mechanism that turns a recipient's spam-button click into an actionable signal rather than an invisible one — without one, a sender has no way to know a specific recipient complained at all, and keeps mailing them indefinitely while their complaint rate silently climbs somewhere the sender can't see.",
    howToCheck:
      "aws sesv2 get-configuration-set-event-destinations --configuration-set-name <name>",
    relatedSlugs: ["complaint-rate", "suppression-list"],
    seeAlso: [{ label: "SES Complaint Rate", href: "/ses/complaint-rate" }],
    faqs: [
      {
        question:
          "Do I need to enroll in feedback loops separately when using SES?",
        answer:
          "No. AWS maintains the provider relationships and surfaces complaints through its own SNS/EventBridge event stream in a consistent format, which sidesteps the per-provider enrollment self-hosted senders otherwise have to manage individually.",
      },
      {
        question: "What information does a complaint event actually include?",
        answer:
          "The complaining recipient's address, a timestamp, and where the reporting provider supplies one, a complaint-type classification. It doesn't include why the recipient complained — that has to be inferred from patterns across complaints, not read off a single event.",
      },
      {
        question:
          "Does SES automatically suppress an address after a complaint?",
        answer:
          "Yes, the same account-level suppression mechanism used for hard bounces applies to complaints, which means the near-real-time suppression a feedback loop exists to enable is built into the platform rather than something you have to implement yourself.",
      },
    ],
  },
  {
    slug: "list-unsubscribe",
    term: "List-Unsubscribe",
    aliases: ["List-Unsubscribe header", "one-click unsubscribe", "RFC 8058"],
    category: "deliverability",
    shortDefinition:
      "List-Unsubscribe is an email header that lets a mailbox client render a working unsubscribe action directly in its interface, and it's mandatory for bulk senders on Gmail and Yahoo as of February 2024.",
    body: [
      {
        heading: "Two mechanisms, one older and one required",
        content:
          "RFC 2369 defined the original `List-Unsubscribe` header, carrying a `mailto:` address, an `https:` URL, or both. RFC 8058 added `List-Unsubscribe-Post`, which turns the header into a genuine one-click action: the mail client sends a POST request on the recipient's behalf with no page load and no confirmation click required, rather than opening a browser tab to a page the recipient still has to interact with.",
      },
      {
        heading: "Gmail and Yahoo made this non-optional",
        content:
          "Starting February 2024, both Gmail and Yahoo require bulk senders — roughly defined as anyone sending more than about 5,000 messages a day to their users — to include a working one-click List-Unsubscribe header, alongside a complaint rate that stays under roughly 0.3% as measured in Google Postmaster Tools. Missing the header on qualifying bulk mail risks outright rejection or heavy throttling, not just a lower engagement number.",
      },
      {
        heading: "It has to actually work, not just be present",
        content:
          "A header pointing at a broken link, a page that requires login before showing an unsubscribe option, or a POST endpoint that doesn't actually process the request satisfies the letter of having the header while failing the requirement it exists to meet. Providers increasingly verify that the mechanism functions, not merely that the header is syntactically present.",
      },
      {
        heading: "This is a separate signal from account-level suppression",
        content:
          "List-Unsubscribe is a per-message, recipient-initiated opt-out mechanism a sender has to build and honor — distinct from SES's account-level suppression list, which is populated automatically from bounces and complaints. A recipient who unsubscribes via this header should be removed from future sends by the sender's own list-management logic; SES's suppression list has no visibility into that action at all.",
      },
    ],
    whyItMatters:
      "A working one-click unsubscribe is now a deliverability requirement, not a courtesy — for bulk senders on the two largest mailbox providers, its absence is treated the same as a policy violation, and it's also the mechanism that gives a frustrated recipient somewhere to go other than the report-spam button, which directly protects complaint rate.",
    relatedSlugs: ["complaint-rate", "can-spam"],
    seeAlso: [
      {
        label: "Suppression Lists guide",
        href: "/docs/guides/suppression-lists",
      },
    ],
    faqs: [
      {
        question: "Is List-Unsubscribe required, or just good practice?",
        answer:
          "For bulk senders — roughly 5,000+ messages a day to Gmail or Yahoo users — it's required as of February 2024, alongside a complaint rate under about 0.3%. Below that volume it's not mandated by either provider, but it's still good practice everywhere.",
      },
      {
        question:
          "What's the difference between List-Unsubscribe and List-Unsubscribe-Post?",
        answer:
          "List-Unsubscribe (RFC 2369) names a mailto: or https: destination. List-Unsubscribe-Post (RFC 8058) is what makes it one-click: the mail client POSTs the unsubscribe request automatically, with no page load or confirmation click needed from the recipient.",
      },
      {
        question: "Does List-Unsubscribe feed into SES's suppression list?",
        answer:
          "No. It's a separate, sender-managed opt-out mechanism. SES's account-level suppression list only reflects bounces and complaints — a recipient who unsubscribes via this header has to be removed from future sends by the sender's own list-management system.",
      },
    ],
  },

  // ---------------------------------------------------------------------
  // Infrastructure
  // ---------------------------------------------------------------------
  {
    slug: "smtp-relay",
    term: "SMTP relay",
    aliases: ["SMTP gateway", "SES SMTP interface"],
    category: "infrastructure",
    shortDefinition:
      "An SMTP relay accepts mail over the standard SMTP protocol and forwards it on, letting any system that only knows how to speak SMTP — not call an API — send through a provider like SES.",
    body: [
      {
        heading: "Why SMTP still matters next to a modern API",
        content:
          "A huge amount of software only ever learned to send mail one way: connect to a server, authenticate, and speak SMTP. WordPress plugins, legacy PHPMailer and Nodemailer setups, network appliances, and countless internal tools were never built to call a REST or SDK-based sending API, and rewriting all of them isn't realistic. An SMTP relay lets that software keep doing exactly what it already does while the mail underneath actually goes through modern infrastructure.",
      },
      {
        heading: "SES's SMTP credentials aren't your IAM credentials",
        content:
          'SES exposes its own SMTP interface with a dedicated username and password pair, generated through a specific derivation from an IAM secret key rather than being the IAM access key and secret themselves. This is a real, separate credential type from the ones used for the SESv2 API, and it\'s the one to hand to any system that only knows how to configure "SMTP host, port, username, password" and nothing else.',
      },
      {
        heading: "The regional endpoint has to match where you verified",
        content:
          "SES's SMTP endpoints are regional, matching the SESv2 API's own regional scoping — an SMTP relay pointed at the wrong region's endpoint will authenticate against different verified identities than the ones actually configured, producing the same kind of identity-not-verified failures documented on the `/ses/errors` pages, just reached through SMTP instead of the API.",
      },
      {
        heading: "Everything downstream still applies",
        content:
          "Mail sent through the SMTP relay is still subject to the exact same SPF/DKIM/DMARC requirements, sending quotas, and suppression-list enforcement as mail sent through the API — SMTP is a different door into the same building, not a separate mail system with different rules.",
      },
    ],
    whyItMatters:
      "SMTP relay access is frequently the deciding factor in whether a legacy system, a plugin ecosystem like WordPress, or an appliance that can't be reprogrammed can move onto SES at all — without it, migrating those systems would mean either rewriting software that has no reasonable rewrite path or leaving it on older infrastructure indefinitely.",
    relatedSlugs: ["configuration-set", "sending-quota"],
    seeAlso: [{ label: "SMTP Credentials guide", href: "/docs/guides/smtp" }],
    faqs: [
      {
        question: "Are SES SMTP credentials the same as my AWS access keys?",
        answer:
          "No. SMTP credentials are a separate username and password derived specifically for the SMTP interface, distinct from the IAM access key and secret used for the SESv2 API. Each is scoped and generated differently.",
      },
      {
        question:
          "Does mail sent through SMTP get the same deliverability treatment as API-sent mail?",
        answer:
          "Yes. SPF/DKIM/DMARC checks, sending quotas, and suppression-list enforcement all apply identically regardless of whether a message arrived through the SMTP relay or the API — SMTP is just a different entry point into the same sending pipeline.",
      },
      {
        question:
          "Why would I use SMTP relay instead of the SDK if I'm writing new code?",
        answer:
          "You generally wouldn't — SMTP relay exists for software that can only be configured with host/port/username/password and can't call an API or SDK at all, like most WordPress plugins or legacy mail libraries. New code should use the API or SDK directly.",
      },
    ],
  },
  {
    slug: "mx-record",
    term: "MX record",
    aliases: ["mail exchange record", "MX"],
    category: "infrastructure",
    shortDefinition:
      "An MX record is a DNS record naming which mail server accepts email for a domain, with a priority value that determines the order receiving servers should be tried in.",
    body: [
      {
        heading: "Priority controls order, not exclusivity",
        content:
          "Each MX record carries a priority number, and lower numbers are tried first — a domain with `10 mail1.example.com` and `20 mail2.example.com` should attempt delivery to `mail1` first and fall back to `mail2` only if that attempt fails. Multiple records at the identical priority are treated as equally preferred alternatives, which a sending server can choose between arbitrarily.",
      },
      {
        heading:
          "Redundancy means more than one priority tier, not just more records",
        content:
          "Two MX records at the same priority aren't redundancy in the failover sense — if the mail server behind that priority is down, a sender still can't reach the domain through the other identical-priority record if it's hosted on the same infrastructure. Real redundancy is multiple distinct priority tiers pointing at genuinely independent mail infrastructure, which is exactly the distinction Wraps' email-check package looks for rather than just counting record totals.",
      },
      {
        heading: "The exchange has to actually resolve, and shouldn't be an IP",
        content:
          "An MX record names a hostname, which then needs its own A and/or AAAA records to actually resolve to an address — a common misconfiguration is an MX record whose hostname has no matching A record, meaning mail addressed to that domain has nowhere to actually be delivered even though the MX record itself looks fine. Pointing an MX record directly at a bare IP address instead of a hostname is technically invalid per the DNS specification and flagged as bad practice by any thorough checker.",
      },
      {
        heading: "MX is what SPF's mx mechanism actually checks",
        content:
          "SPF's `mx` mechanism authorizes sending from any IP that domain's MX records resolve to — a shortcut for \"whatever server receives mail for this domain is also allowed to send it,\" which is common for smaller setups where the same infrastructure both sends and receives, but is a poor fit for a domain that uses one provider (like SES) to send and a completely different one to receive.",
      },
    ],
    whyItMatters:
      "MX records are foundational infrastructure for receiving mail, and they matter for sending, too, both because SES's custom MAIL FROM domain needs its own dedicated MX record to verify, and because SPF's mx mechanism ties authorized senders directly to whatever the MX records currently say.",
    howToCheck: "dig +short MX example.com",
    relatedSlugs: ["spf", "return-path", "smtp-relay"],
    seeAlso: [
      {
        label: "MAIL FROM domain is not verified",
        href: "/ses/errors/mail-from-domain-not-verified",
      },
    ],
    faqs: [
      {
        question: "Does having two MX records mean I have redundancy?",
        answer:
          "Only if they're at different priorities pointing at genuinely independent infrastructure. Two records at the same priority hosted on related infrastructure don't give you a real failover path if the underlying system goes down.",
      },
      {
        question: "Can an MX record point directly at an IP address?",
        answer:
          "It's technically invalid per the DNS specification and flagged as bad practice by any thorough MX checker. An MX record should name a hostname, which then resolves to an address through its own A or AAAA records.",
      },
      {
        question: "How does SPF's mx mechanism relate to my MX records?",
        answer:
          "SPF's mx mechanism authorizes sending from whatever IPs your domain's current MX records resolve to. That's a reasonable shortcut when the same infrastructure sends and receives your mail, but a poor fit once you send through one provider (like SES) and receive through another.",
      },
    ],
  },
  {
    slug: "configuration-set",
    term: "Configuration set",
    aliases: ["SES configuration set"],
    category: "infrastructure",
    shortDefinition:
      "A configuration set is an SES resource attached to a send that controls where its events publish, which reputation options apply, and which IP pool it uses — a routing and policy layer on top of the send itself.",
    body: [
      {
        heading: "What it actually controls",
        content:
          "A configuration set names event destinations (SNS, EventBridge, Kinesis Data Firehose, or CloudWatch), can enable reputation tracking and an automatic sending-pause option if that reputation degrades past a threshold you configure, and can assign a specific dedicated IP pool. It's applied either explicitly on a per-send basis or implicitly through an identity-level default, so a send might be using one without the caller having named it directly.",
      },
      {
        heading:
          "It's a regional resource, and that trips people up constantly",
        content:
          "A configuration set created in `us-east-1` simply does not exist in `eu-west-1`, even with an identical name — SES resources of this kind are per-region, so a deploy or a send pointed at the wrong region will fail to find a configuration set that genuinely exists, just not where the request is looking. This is the single most common cause behind `ConfigurationSetDoesNotExistException`, documented in depth on its own error page.",
      },
      {
        heading: "It can pause independently of the whole account",
        content:
          "A configuration set with reputation-based auto-pause enabled can stop sending for just the traffic routed through it while the rest of the account keeps sending normally — a materially different, more survivable failure mode than an account-wide pause, and the reason `/ses/errors/configuration-set-sending-paused` exists as a separate page from the account-level pause error, with different diagnosis and different remediation.",
      },
      {
        heading:
          "Separating traffic types by configuration set is the main defensive use",
        content:
          "Routing transactional and marketing mail through separate configuration sets — potentially with separate dedicated IP pools too — means a reputation problem in one traffic type doesn't automatically pause the other. This is the same underlying idea as separating dedicated IPs by traffic type, applied at the policy layer rather than the network layer.",
      },
    ],
    whyItMatters:
      "The configuration set is the piece of SES infrastructure most likely to silently diverge from what a deploy or a send actually expects — hand-created in the console once and then never reconciled with what the application code references — which is exactly the drift Wraps' own IaC deploys the configuration set alongside the code that uses it specifically to prevent.",
    howToCheck: "aws sesv2 list-configuration-sets --region us-east-1",
    relatedSlugs: ["suppression-list", "sending-quota", "smtp-relay"],
    seeAlso: [
      {
        label: "Configuration set does not exist",
        href: "/ses/errors/configuration-set-does-not-exist",
      },
      {
        label: "Configuration set sending is paused",
        href: "/ses/errors/configuration-set-sending-paused",
      },
    ],
    faqs: [
      {
        question:
          "Why does SES say my configuration set doesn't exist when I can see it in the console?",
        answer:
          "Check the region. Configuration sets are per-region resources, so a configuration set visible in the console for one region genuinely does not exist in another, even under the identical name — this is the most common cause of this exact error.",
      },
      {
        question:
          "Can a configuration set pause without pausing my whole SES account?",
        answer:
          "Yes. A configuration set with reputation-based auto-pause enabled can stop only the traffic routed through it, leaving the rest of the account's sending unaffected — a different and more survivable failure than an account-wide pause.",
      },
      {
        question:
          "Do I have to name a configuration set explicitly on every send?",
        answer:
          "No. An identity can carry a default configuration set that applies implicitly to sends that don't name one explicitly, which is worth checking if a send is behaving as though a configuration set were involved that nobody specified directly.",
      },
    ],
  },
  {
    slug: "suppression-list",
    term: "Suppression list",
    aliases: ["SES suppression list", "account-level suppression"],
    category: "infrastructure",
    shortDefinition:
      "The suppression list is SES's account-level record of addresses it will refuse to send to, populated automatically on a hard bounce or a complaint, unless a send explicitly overrides it.",
    body: [
      {
        heading: "What actually adds an address to it",
        content:
          "SES adds an address automatically for two reasons: a permanent (hard) bounce, or a complaint. It does not add an address for a soft bounce, and it has no visibility into a recipient clicking an unsubscribe link in a message body or a List-Unsubscribe header — those are opt-outs a sender's own list-management system has to track and honor separately, entirely outside SES's suppression mechanism.",
      },
      {
        heading: "It's account-wide, not per-configuration-set or per-campaign",
        content:
          "Once an address is suppressed, it's suppressed for every send from that account, regardless of which configuration set, template, or campaign the next attempt comes from. There's no per-list or per-segment suppression scoping inside SES itself — that granularity, if you need it, is something a sender builds in their own application layer on top of SES's account-wide list.",
      },
      {
        heading: "It can be overridden, deliberately and per-send",
        content:
          "SES allows overriding suppression on a specific send when there's a genuine reason to believe the original suppression no longer applies — a customer confirms their address was fixed after a typo caused the original bounce, for example. This is meant to be a deliberate, occasional override, not a default setting, since routinely overriding suppression defeats the entire protection it provides against bounce and complaint rate.",
      },
      {
        heading:
          "This is the part self-hosted mail servers have to build themselves",
        content:
          "Running your own SMTP infrastructure means building bounce and complaint parsing, a suppression data store, and enforcement logic that checks it before every send — all from scratch. SES's suppression list is exactly that stack, built in, which is a meaningful part of why bounce and complaint-rate management is materially less work on SES than on self-hosted infrastructure.",
      },
    ],
    whyItMatters:
      "The suppression list is the single mechanism doing the most quiet, ongoing work to keep an SES account's bounce and complaint rates under AWS's review and pause thresholds — every hard bounce and complaint it catches is one less repeat offense against those same accounts, automatically, without a sender having to remember to act on it.",
    howToCheck: "aws sesv2 list-suppressed-destinations",
    relatedSlugs: ["hard-bounce", "complaint-rate", "list-unsubscribe"],
    seeAlso: [
      {
        label: "Suppression Lists guide",
        href: "/docs/guides/suppression-lists",
      },
    ],
    faqs: [
      {
        question: "Does a soft bounce add an address to the suppression list?",
        answer:
          "No, only a hard (permanent) bounce or a complaint does. A soft bounce is treated as temporary and retryable, which is exactly the distinction that keeps it out of a mechanism meant for permanent failures.",
      },
      {
        question:
          "Does List-Unsubscribe or an in-message unsubscribe link feed into SES's suppression list?",
        answer:
          "No. SES's suppression list only reflects bounces and complaints. An unsubscribe click, whichever mechanism triggers it, has to be tracked and honored by the sender's own list-management system — SES has no visibility into it at all.",
      },
      {
        question: "Can I send to a suppressed address anyway?",
        answer:
          "Yes, SES allows an explicit override on a specific send when there's a real reason to believe the original suppression no longer applies, but it's meant as a deliberate, occasional action, not a routine default.",
      },
    ],
  },
  {
    slug: "sending-quota",
    term: "Sending quota",
    aliases: ["SES send quota", "sending limits"],
    category: "infrastructure",
    shortDefinition:
      "SES enforces two independent sending caps — a rolling 24-hour maximum message count and a per-second maximum rate — and hitting either returns a different exception with a different fix.",
    body: [
      {
        heading: "Two separate limits, easy to conflate",
        content:
          "The daily quota is a total-messages-per-rolling-24-hour-window cap; the sending rate is a maximum-per-second cap. An account can be well under its daily quota and still get throttled on rate if it tries to send a large batch too quickly, and conversely can send at a perfectly acceptable rate all day and still eventually hit the daily ceiling. They're diagnosed and fixed differently, which is exactly why AWS returns different exceptions for each.",
      },
      {
        heading: "Different exceptions, different fixes",
        content:
          "Exceeding the daily quota returns `LimitExceededException` or `ServiceQuotaExceededException`, fixed by waiting for the rolling window to free up capacity or by requesting a higher quota. Exceeding the per-second rate returns `Throttling`, fixed by retrying with exponential backoff and jitter, and by bounding your own concurrency below the account's actual rate rather than letting every worker send independently. Both have dedicated `/ses/errors` pages precisely because the correct response to each is different enough that conflating them wastes time.",
      },
      {
        heading:
          "Quotas rise automatically, and can be requested to rise faster",
        content:
          "AWS raises both the daily quota and the per-second rate over time as an account's sending reputation builds — consistently low bounce and complaint rates are the main input to that. To ask for more directly: request increased quotas in the same submission that asks to leave the SES sandbox, or once the account is already out of the sandbox, open a new case in the AWS Support Center — that's the actual mechanism, not a generic \"Service Quotas\" self-service form.",
      },
      {
        heading:
          "The quota is shared across everything sending from that account",
        content:
          "Both limits apply to the AWS account as a whole, not to a single application or process — parallel workers, background jobs, and any other application sharing the account all draw from the same daily and per-second budget. A rate limiter or a queue that respects the limit inside one process does nothing to prevent a second, uncoordinated process from pushing the shared total over the line.",
      },
      {
        heading: "The daily quota counts recipients, not messages",
        content:
          "A single SendEmail call to 10 recipients spends 10 units of the daily quota, not one — a detail that catches people right when a batch send unexpectedly exhausts the day's budget faster than the message count suggested it would. AWS's own guidance is one SendEmail call per recipient rather than a multi-recipient call, partly for this reason and partly because a multi-recipient call fails as a whole if any part of it is rejected.",
      },
    ],
    whyItMatters:
      "Confusing the daily quota with the per-second rate leads directly to the wrong fix — retrying a daily-quota exhaustion with backoff does nothing but waste attempts until the rolling window frees capacity, and requesting a quota increase for what's actually a rate-throttling problem doesn't address the burst behavior causing it.",
    howToCheck: "aws sesv2 get-account --query 'SendQuota'",
    relatedSlugs: ["configuration-set", "ip-warming"],
    seeAlso: [
      {
        label: "Daily message quota exceeded",
        href: "/ses/errors/daily-sending-quota-exceeded",
      },
      {
        label: "Maximum sending rate exceeded",
        href: "/ses/errors/maximum-sending-rate-exceeded",
      },
      { label: "SES Sending Limits", href: "/ses/limits" },
    ],
    faqs: [
      {
        question:
          "What's the difference between the SES daily quota and the sending rate?",
        answer:
          "The daily quota is a total message count allowed in a rolling 24-hour window. The sending rate is a maximum number of messages per second. You can be well within one and still hit the other, since they're independent limits with different failure exceptions.",
      },
      {
        question: "Does the SES daily quota reset at midnight?",
        answer:
          "No, it's a rolling 24-hour window, not a fixed calendar-day reset. Capacity frees up gradually as older sends age out of the window rather than resetting all at once.",
      },
      {
        question:
          "Why am I getting throttled even though my app respects the rate limit?",
        answer:
          "The limit is shared across the whole AWS account, not scoped to a single process. Any other application, background job, or worker sending from the same account draws from the identical per-second budget, and an uncoordinated second sender can push the shared total over the line.",
      },
    ],
  },
  {
    slug: "message-id",
    term: "Message-ID",
    aliases: ["SES MessageId", "email Message-ID header"],
    category: "infrastructure",
    shortDefinition:
      "Message-ID is the RFC 5322 header uniquely identifying an individual email message; SES's own MessageId, returned from a successful send, is the handle used to correlate that send with its later delivery, bounce, and complaint events.",
    body: [
      {
        heading: "Two related but distinct identifiers",
        content:
          "The RFC 5322 `Message-ID` header is generated by the sending mail system and embedded in the message itself, in the form `<unique-string@domain>` — it's what lets mail clients thread replies and lets any system inspecting the raw message identify it uniquely. SES's own `MessageId`, returned in the response to a successful `SendEmail` or `SendBulkEmail` call, is a related but separate identifier — SES's own handle for tracking that specific send through its systems, not necessarily byte-identical to the RFC 5322 header value.",
      },
      {
        heading: "It's the join key across the entire event stream",
        content:
          "Every event SES publishes about a send — delivery, bounce, complaint, open, click — carries the same `MessageId` in its payload, specifically under `mail.messageId`, so an application consuming that event stream through SNS or EventBridge can correlate every downstream event back to the exact send that triggered it, even when events for different sends and different recipients arrive interleaved.",
      },
      {
        heading: "It's the natural key for idempotency and deduplication",
        content:
          "A background worker or queue consumer processing a send request has to guard against sending the same message twice — a retry after a network timeout, a redelivered queue message, or a race between workers. Since SESv2's `SendEmail` has no idempotency-token parameter of its own, tracking your own request against the returned `MessageId` (or a dedupe key you generate before the call) is the mechanism that actually prevents a duplicate send from a retried request.",
      },
      {
        heading: "It's also how a single message gets traced end to end",
        content:
          "Being able to answer \"what happened to this specific email\" — was it delivered, did it bounce, did the recipient open it — depends entirely on retaining the `MessageId` from send time and being able to look it up later, whether that's through your own application's event log, a query against SES's event stream, or a support conversation where a customer can only describe roughly when they expected to receive something.",
      },
    ],
    whyItMatters:
      "Without capturing MessageId at send time, an application has no way to answer basic operational questions about a specific email after the fact — whether it was delivered, whether it bounced, or whether it's the reason a retry is about to send a duplicate — which is why persisting it is one of the first things any serious send pipeline does, before any subsequent step that could fail.",
    relatedSlugs: ["sending-quota", "hard-bounce"],
    seeAlso: [
      {
        label: "Preventing Duplicate Sends guide",
        href: "/docs/guides/idempotency",
      },
    ],
    faqs: [
      {
        question:
          "Is the SES MessageId the same as the RFC 5322 Message-ID header?",
        answer:
          "They're related but not guaranteed to be identical — the RFC 5322 header is embedded in the message itself for mail-client threading, while SES's MessageId is its own handle for tracking the send through its systems and event stream. Treat them as related, not interchangeable.",
      },
      {
        question:
          "Does SES prevent me from accidentally sending the same email twice?",
        answer:
          "Not on its own — SESv2's SendEmail has no built-in idempotency token. Preventing a duplicate send on retry is the caller's responsibility, typically by tracking the request against the MessageId or a dedupe key generated before the call.",
      },
      {
        question:
          "Why should I save the MessageId immediately after a send succeeds?",
        answer:
          "It's the only handle that lets you correlate that specific send with its later delivery, bounce, or complaint events, and the only way to trace a single message end to end when a customer asks what happened to it. Losing it means losing that traceability permanently.",
      },
    ],
  },

  // ---------------------------------------------------------------------
  // Compliance
  // ---------------------------------------------------------------------
  {
    slug: "double-opt-in",
    term: "Double opt-in",
    aliases: ["confirmed opt-in", "COI"],
    category: "compliance",
    shortDefinition:
      "Double opt-in requires a subscriber to confirm their email address — usually by clicking a link in a confirmation message — before they're added to a sending list, rather than trusting the signup form alone.",
    body: [
      {
        heading: "What it adds over a plain signup form",
        content:
          "Single opt-in adds an address to a list the moment someone types it into a form, with no verification that the address is real, spelled correctly, or actually belongs to the person who typed it. Double opt-in inserts one more step: a confirmation message is sent to the address, and only a click on that confirmation link actually activates the subscription. Nothing gets sent to the list until the address has proven it can receive and act on mail.",
      },
      {
        heading:
          "It's the single most effective structural defense against bad addresses",
        content:
          "A typo'd address, a fake address entered to get past a gate without providing a real one, and a pristine spam trap — which by definition never opts into anything — all fail to confirm under double opt-in, because none of them can complete the click. Single opt-in has no mechanism that catches any of these before the first real send.",
      },
      {
        heading: "The trade-off is a real drop in list size",
        content:
          "Some meaningful share of people who fill out a signup form never click the confirmation message — distraction, a filtered confirmation email, or genuine disinterest that the original form-fill didn't reflect. That's a real cost in raw list size, and it's also exactly the point: those addresses were never going to be engaged, low-bounce, low-complaint subscribers anyway, and double opt-in filters them out before they can damage sender reputation instead of after.",
      },
      {
        heading: "It also produces cleaner consent evidence",
        content:
          "A confirmed, timestamped click is materially stronger consent evidence than a submitted form field, which matters directly for GDPR's affirmative-consent requirement and helps for CAN-SPAM recordkeeping too, even though CAN-SPAM itself doesn't require opt-in consent the way GDPR does.",
      },
    ],
    whyItMatters:
      "Nearly every downstream deliverability problem this glossary covers — spam-trap hits, a rising hard-bounce rate, an unexplained complaint-rate creep — traces back, eventually, to how addresses got onto the list in the first place. Double opt-in is the one intervention that prevents most of that class of problem before it starts, rather than requiring detection and cleanup after the fact.",
    relatedSlugs: ["spam-trap", "can-spam", "gdpr-consent"],
    seeAlso: [
      { label: "Domain Reputation guide", href: "/docs/guides/reputation" },
    ],
    faqs: [
      {
        question: "Does double opt-in significantly shrink my list size?",
        answer:
          "Yes, usually noticeably — some share of people who submit a signup form never click the confirmation. That's largely the intended effect: those addresses were unlikely to become engaged subscribers, and filtering them out before the first send protects reputation rather than damaging it after the fact.",
      },
      {
        question: "Is double opt-in required by law?",
        answer:
          "Not universally, but GDPR's requirement for freely given, specific, affirmative consent is much easier to satisfy with a confirmed click than a single form submission, and several countries' anti-spam laws effectively require or strongly favor it even where it isn't named explicitly.",
      },
      {
        question: "Does double opt-in prevent spam-trap hits entirely?",
        answer:
          "It prevents new pristine-trap hits, because a pristine trap can never complete a confirmation click. It doesn't protect against recycled traps, which come from addresses that were once real and confirmed but have since gone dormant — that needs separate list hygiene, not just a confirmed signup.",
      },
    ],
  },
  {
    slug: "can-spam",
    term: "CAN-SPAM Act",
    aliases: ["CAN-SPAM", "US anti-spam law"],
    category: "compliance",
    shortDefinition:
      "CAN-SPAM is the 2003 US federal law, enforced by the FTC, that requires accurate sender information, a working opt-out mechanism honored within 10 business days, and a valid physical postal address in commercial email.",
    body: [
      {
        heading: "It's an opt-out law, not an opt-in one",
        content:
          "Unlike GDPR, CAN-SPAM does not require consent before the first commercial message — a sender can legally send unsolicited commercial email to a US recipient with no prior relationship, as long as everything else the law requires is present. What CAN-SPAM actually mandates is honesty about the message and a genuine ability to stop future ones, not permission to start.",
      },
      {
        heading: "The specific, checkable requirements",
        content:
          "Header information (From, Reply-To, routing data) has to be accurate and not misleading; the subject line can't be deceptive about the message's content; the message has to clearly and conspicuously disclose that it's an advertisement or solicitation where that applies (15 U.S.C. §7704(a)(5)(A)) — silence isn't a safe default; every commercial message needs a clear and conspicuous way to opt out; opt-out requests have to be honored within 10 business days and can't require anything beyond a reply email or a single visit to a webpage; and every message needs a valid physical postal address for the sender.",
      },
      {
        heading: "Non-compliance carries real, per-message penalties",
        content:
          "The FTC can pursue civil penalties per violation, and each individual non-compliant email sent can count as a separate violation rather than the whole campaign counting as one — which is why a systemic gap (a missing physical address on a template used for thousands of sends) is a materially bigger exposure than an isolated mistake.",
      },
      {
        heading: "Where it stops covering an audience",
        content:
          "CAN-SPAM only governs commercial email to recipients in the US and only addresses the requirements listed above — it says nothing about consent for EU recipients, who fall under GDPR instead, and a global sending list needs to satisfy the stricter of the two regimes for whichever segment of the list each rule actually applies to, rather than picking one law and assuming it covers everyone.",
      },
    ],
    whyItMatters:
      "CAN-SPAM's requirements are minimums, not aspirational best practices, and every one of them is externally checkable — a missing opt-out mechanism or a fabricated physical address is not a judgment call, it's a specific, provable gap that a regulator, or a plaintiff's attorney in some private-right-of-action cases, can point to directly.",
    relatedSlugs: ["gdpr-consent", "list-unsubscribe", "double-opt-in"],
    seeAlso: [
      {
        label: "Suppression Lists guide",
        href: "/docs/guides/suppression-lists",
      },
    ],
    faqs: [
      {
        question:
          "Does CAN-SPAM require permission before I send someone a marketing email?",
        answer:
          "No. CAN-SPAM is opt-out based — it permits sending unsolicited commercial email as long as the message is honest, includes a working opt-out, and honors that opt-out within 10 business days. It does not require prior consent the way GDPR does.",
      },
      {
        question: "How quickly do I have to honor a CAN-SPAM opt-out request?",
        answer:
          "Within 10 business days, and the opt-out mechanism itself can't require more than a reply email or a single webpage visit to complete — a multi-step process or a required login is itself a compliance problem.",
      },
      {
        question: "Does CAN-SPAM apply to my emails to EU customers?",
        answer:
          "CAN-SPAM applies to commercial email sent to US recipients. EU recipients fall under GDPR's stricter, consent-based rules instead, so a sending list with both audiences has to satisfy each regime for the segment it actually governs.",
      },
    ],
  },
  {
    slug: "gdpr-consent",
    term: "GDPR consent",
    aliases: ["GDPR marketing consent", "lawful basis for email"],
    category: "compliance",
    shortDefinition:
      "GDPR requires a lawful basis for processing personal data, and for marketing email that basis is generally consent — freely given, specific, informed, and an affirmative opt-in, not a pre-checked box or a default-in setting.",
    body: [
      {
        heading: 'What "affirmative" rules out',
        content:
          "A pre-ticked checkbox, an opt-out framed as the default with opt-in requiring extra effort, or consent bundled into agreeing to unrelated terms of service all fail GDPR's bar. Valid consent requires a clear, affirmative action specifically for the marketing communication in question — the recipient has to actually do something that unambiguously means yes, not merely fail to say no.",
      },
      {
        heading: "It has to be specific, not blanket",
        content:
          'Consent to receive a transactional receipt is not consent to receive a marketing newsletter, and consent given for one company doesn\'t transfer to an affiliated company by default. Each distinct purpose generally needs its own clear consent, which is why a single "I agree" checkbox covering several different uses of an email address is a common compliance gap rather than an efficient shortcut.',
      },
      {
        heading: "Consent has to be as easy to withdraw as it was to give",
        content:
          "GDPR requires that withdrawing consent be genuinely as simple as giving it — burying an unsubscribe mechanism behind a multi-step process, a required login, or a customer-support request when signup only took one click is itself a compliance failure, independent of whether the original consent was valid.",
      },
      {
        heading: "This is a stricter bar than CAN-SPAM's, by design",
        content:
          "CAN-SPAM permits sending the first message without consent and requires honoring an opt-out afterward. GDPR requires the opposite ordering: consent before the first message, generally obtained through something functionally equivalent to double opt-in for it to hold up. A sender that treats CAN-SPAM compliance as sufficient for an EU audience is applying the wrong bar to that segment of the list. Consent isn't the only lawful basis GDPR recognizes, either — legitimate interest is a narrower alternative sometimes invoked for B2B email to an existing business contact, but it requires its own documented balancing test against the recipient's rights and still has to honor an opt-out, so it's a higher-effort exception rather than a way around consent generally.",
      },
      {
        heading: "Consent records need to be kept, not just obtained",
        content:
          "GDPR's accountability principle expects a controller to be able to demonstrate, later, that valid consent was actually given — what was agreed to, when, and through what mechanism. A signup flow that captures the confirmation click but discards the timestamp and the exact wording shown at the time has weakened its own evidence, even if the consent itself was originally valid.",
      },
    ],
    whyItMatters:
      "GDPR's consent requirement is the reason double opt-in isn't just a deliverability best practice for a list with EU subscribers — it's close to the practical minimum needed to demonstrate the kind of freely given, specific, affirmative consent the regulation actually requires, and a single-opt-in EU signup flow is a real, documented compliance gap, not a stylistic choice.",
    relatedSlugs: ["can-spam", "double-opt-in"],
    seeAlso: [{ label: "Data Processing Agreement", href: "/dpa" }],
    faqs: [
      {
        question: "Does a pre-checked consent checkbox satisfy GDPR?",
        answer:
          "No. GDPR requires an affirmative action specifically for that purpose — a pre-ticked box, an opt-out framed as default, or consent bundled with unrelated terms all fail the bar, regardless of how clearly the checkbox's label described what it was for.",
      },
      {
        question:
          "Can one consent checkbox cover both transactional and marketing email?",
        answer:
          "Generally no. GDPR expects specific consent per distinct purpose, so a marketing newsletter typically needs its own clear consent separate from whatever basis covers transactional messages like receipts or password resets.",
      },
      {
        question: "Is CAN-SPAM compliance enough for emailing EU recipients?",
        answer:
          "No. CAN-SPAM permits sending without prior consent and requires honoring opt-outs afterward; GDPR requires consent before the first message. A sending list with EU recipients has to meet GDPR's stricter, consent-first bar for that segment specifically.",
      },
    ],
  },

  // ---------------------------------------------------------------------
  // Metrics
  // ---------------------------------------------------------------------
  {
    slug: "open-rate",
    term: "Open rate",
    aliases: ["email open rate", "open tracking"],
    category: "metrics",
    shortDefinition:
      "Open rate is the share of delivered messages whose tracking pixel fired — historically the headline engagement metric, but heavily inflated since 2021 by Apple's Mail Privacy Protection pre-fetching images regardless of whether a message was actually opened.",
    body: [
      {
        heading: "How the measurement actually works",
        content:
          'Open tracking works by embedding a tiny, uniquely-URLed tracking pixel in the message body — when the recipient\'s mail client renders images and loads that pixel, the request to fetch it is logged as an open. That means the metric doesn\'t measure "did a human read this," it measures "did something load this specific image," which used to be a reasonable enough proxy before a major mailbox client changed how it loads images.',
      },
      {
        heading: "Apple's Mail Privacy Protection broke the proxy",
        content:
          'Since 2021, Apple Mail (on by default for Mail Privacy Protection-enabled accounts) pre-fetches and proxies all images in a message at delivery time, regardless of whether the recipient ever opens it, specifically to prevent senders from using pixel tracking to learn when and whether a message was read. For any list with a meaningful share of Apple Mail users — which is most consumer lists — a substantial fraction of "opens" now reflect this proxy pre-fetch, not a human actually opening the message.',
      },
      {
        heading: "The inflation isn't a fixed, predictable percentage",
        content:
          "How much a given list's open rate is inflated depends on what fraction of recipients use an MPP-enabled Apple Mail client, which varies list by list and audience by audience — there's no single correction factor to subtract that works generically. This makes open rate not just less accurate than it used to be, but less consistently comparable across different lists and different time periods than it used to be, too.",
      },
      {
        heading: "Click-through rate is the more trustworthy signal now",
        content:
          "A click still requires an actual human to interact with a specific link inside the message, which Apple's pre-fetch proxy does not simulate — click-through rate, and click-to-open rate calculated against it, are considerably more resistant to this specific distortion and are the metrics worth weighting more heavily now that a raw open count can no longer be trusted at face value.",
      },
    ],
    whyItMatters:
      "Making sending decisions off open rate alone — deciding a subject line \"worked\" because opens went up, or judging list health by a rising open trend — risks optimizing for something that increasingly measures Apple's own infrastructure behavior rather than recipient engagement, which is exactly the kind of quiet metric failure that doesn't announce itself until the underlying decisions it drove stop making sense.",
    relatedSlugs: ["list-unsubscribe", "complaint-rate"],
    seeAlso: [{ label: "How Email Works", href: "/blog/how-email-works" }],
    faqs: [
      {
        question:
          "Why did my open rate suddenly jump without any change to my campaigns?",
        answer:
          "Apple's Mail Privacy Protection, on by default for many Apple Mail users, pre-fetches images at delivery time regardless of whether the message is actually opened, which inflates the open-tracking pixel's fire rate independent of any real change in recipient behavior.",
      },
      {
        question: "Should I stop looking at open rate entirely?",
        answer:
          "Not entirely, but weight it less than click-through rate, which still requires genuine human interaction with a link and isn't simulated by Apple's image pre-fetch. Open rate is still directionally useful for very large trend shifts, just no longer a precise engagement number.",
      },
      {
        question: "Does open-rate inflation affect every list equally?",
        answer:
          "No. It scales with how much of a given list uses Mail Privacy Protection-enabled Apple Mail, which varies by audience — there's no single, fixed correction factor that applies the same way to every list or every campaign.",
      },
    ],
  },
];

export const GLOSSARY_CATEGORIES: readonly GlossaryCategory[] = [
  "authentication",
  "deliverability",
  "infrastructure",
  "compliance",
  "metrics",
];

export const GLOSSARY_CATEGORY_META: Record<
  GlossaryCategory,
  { label: string; blurb: string }
> = {
  authentication: {
    label: "Authentication",
    blurb:
      "The mechanisms a receiver checks to decide whether mail claiming to be from your domain actually is.",
  },
  deliverability: {
    label: "Deliverability",
    blurb:
      "What happens to a message after it authenticates — whether it bounces, gets reported, or actually lands.",
  },
  infrastructure: {
    label: "Infrastructure",
    blurb:
      "The AWS SES resources and protocols that carry a send from an application to a recipient's mail server.",
  },
  compliance: {
    label: "Compliance",
    blurb:
      "The consent and disclosure rules that decide whether you were allowed to send the message at all.",
  },
  metrics: {
    label: "Metrics",
    blurb:
      "The numbers senders watch, and where they quietly stop meaning what they used to.",
  },
};

/** Throws rather than returning undefined — a generated shim names a real slug. */
export function glossaryTermBySlug(slug: string): GlossaryTerm {
  const term = GLOSSARY.find((entry) => entry.slug === slug);
  if (term === undefined) {
    throw new Error(`Unknown glossary slug: ${slug}`);
  }
  return term;
}

export function glossaryTermsInCategory(
  category: GlossaryCategory
): readonly GlossaryTerm[] {
  return GLOSSARY.filter((entry) => entry.category === category);
}
