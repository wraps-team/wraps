import { Card } from "@wraps/ui/components/ui/card";
import type { Metadata } from "next";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { JsonLd } from "@/components/json-ld";
import {
  AuthVisualizer,
  ChapterNav,
  ComposeViewer,
  DeepCutAccordion,
  HeaderChain,
  HeroScrollButton,
  MxLookup,
  ParallaxHero,
  PredictionPrompt,
  ReadingProgress,
  RelayMap,
  SectionReveal,
  SmtpTerminal,
} from "./page-content";

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "How Email Actually Works: An Interactive Deep-Dive",
  description:
    "You click Send. What happens in the next 3 seconds? An interactive journey through SMTP handshakes, DNS lookups, relay hops, and authentication — with a terminal you can type in.",
  image: "https://wraps.dev/blog/how-email-works.webp",
  datePublished: "2026-03-06T00:00:00.000Z",
  dateModified: "2026-03-06T00:00:00.000Z",
  author: {
    "@type": "Organization",
    name: "Wraps",
    url: "https://wraps.dev",
    description:
      "Email infrastructure experts building tools to deploy production-ready email systems to AWS.",
    sameAs: ["https://github.com/wraps-team", "https://twitter.com/wrapsdev"],
  },
  publisher: {
    "@type": "Organization",
    name: "Wraps",
    logo: {
      "@type": "ImageObject",
      url: "https://wraps.dev/logo.png",
    },
  },
  mainEntityOfPage: {
    "@type": "WebPage",
    "@id": "https://wraps.dev/blog/how-email-works",
  },
};

const howToSchema = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: "How to Send an Email via SMTP",
  description:
    "Step-by-step walkthrough of an SMTP conversation — from TCP connection to queued message.",
  step: [
    {
      "@type": "HowToStep",
      name: "Connect",
      text: "Open a TCP connection to port 25 on the recipient's mail server. The server responds with a 220 greeting.",
    },
    {
      "@type": "HowToStep",
      name: "EHLO",
      text: "Identify yourself with the EHLO command. The server responds with its capabilities.",
    },
    {
      "@type": "HowToStep",
      name: "MAIL FROM",
      text: "Specify the envelope sender address using MAIL FROM:<sender@domain.com>.",
    },
    {
      "@type": "HowToStep",
      name: "RCPT TO",
      text: "Specify the recipient address using RCPT TO:<recipient@domain.com>.",
    },
    {
      "@type": "HowToStep",
      name: "DATA",
      text: "Send the DATA command, then transmit message headers and body. End with a single dot (.) on its own line.",
    },
    {
      "@type": "HowToStep",
      name: "QUIT",
      text: "Close the session with the QUIT command. The server confirms with 221 Bye.",
    },
  ],
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What protocol does email use?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Email uses SMTP (Simple Mail Transfer Protocol) for sending and relaying messages between servers. For retrieving messages, clients use IMAP or POP3. SMTP typically operates on port 25 (server-to-server), 587 (submission with authentication), or 465 (implicit TLS).",
      },
    },
    {
      "@type": "Question",
      name: "What happens when you click Send on an email?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Your email client connects to your outbound mail server via SMTP, authenticates, and transmits the message. Your server then queries DNS for the recipient domain's MX records, connects to the recipient's mail server, performs an SMTP handshake, and delivers the message. The recipient's server runs SPF, DKIM, and DMARC authentication checks before accepting the message into the inbox.",
      },
    },
    {
      "@type": "Question",
      name: "What are MX records?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "MX (Mail Exchange) records are DNS records that specify which mail servers accept email for a domain. Each MX record has a priority number — lower numbers are tried first. If the primary server is unavailable, email falls back to servers with higher priority values.",
      },
    },
    {
      "@type": "Question",
      name: "How do SPF, DKIM, and DMARC protect email?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "SPF verifies the sending server is authorized for the domain. DKIM cryptographically signs the email to prove it wasn't tampered with. DMARC ties them together by requiring alignment between the visible From: address and the SPF/DKIM domains, and specifies what to do when authentication fails (monitor, quarantine, or reject).",
      },
    },
  ],
};

export const metadata: Metadata = {
  title: "How Email Actually Works: An Interactive Deep-Dive",
  description:
    "You click Send. What happens in the next 3 seconds? An interactive journey through SMTP handshakes, DNS lookups, relay hops, and authentication.",
  openGraph: {
    title: "How Email Actually Works | Wraps",
    description:
      "You click Send. What happens in the next 3 seconds? An interactive journey through SMTP, DNS, and email authentication.",
    type: "article",
    url: "https://wraps.dev/blog/how-email-works",
    images: [
      {
        url: "https://wraps.dev/blog/how-email-works.webp",
        width: 1200,
        height: 630,
        alt: "How Email Actually Works — interactive deep-dive",
      },
    ],
    publishedTime: "2026-03-06T00:00:00.000Z",
    authors: ["Wraps Team"],
  },
  twitter: {
    card: "summary_large_image",
    title: "How Email Actually Works | Wraps",
    description:
      "An interactive journey through SMTP handshakes, DNS lookups, relay hops, and authentication.",
    images: ["https://wraps.dev/blog/how-email-works.webp"],
  },
  alternates: {
    canonical: "https://wraps.dev/blog/how-email-works",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={articleSchema} />
      <JsonLd data={howToSchema} />
      <JsonLd data={faqSchema} />

      <div className="min-h-screen bg-background text-foreground">
        <LandingNavbar />

        <ReadingProgress />
        <ChapterNav />

        <main>
          {/* Ch0: Hero */}
          <section
            className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 text-center"
            id="hero"
          >
            <ParallaxHero />
            <div className="relative z-10 mx-4 max-w-3xl rounded-2xl border bg-background/80 p-8 shadow-2xl backdrop-blur-sm md:p-12">
              <h1 className="mb-4 font-bold text-4xl md:text-6xl">
                How Email{" "}
                <span className="bg-gradient-to-r from-brand to-warning bg-clip-text text-transparent">
                  Actually
                </span>{" "}
                Works
              </h1>
              <p className="mb-4 max-w-2xl text-lg text-muted-foreground md:text-xl">
                You click Send. What happens in the next 3 seconds? An
                interactive journey from compose window to inbox — through SMTP
                handshakes, DNS lookups, relay hops, and authentication.
              </p>
              <div className="mb-8 flex items-center justify-center gap-2 text-muted-foreground text-sm">
                <span>20 min read</span>
                <span>&bull;</span>
                <span>Wraps Team</span>
              </div>
              <HeroScrollButton />
            </div>
          </section>

          {/* Content */}
          <div className="mx-auto max-w-4xl space-y-24 px-4 pt-24 pb-24">
            {/* Ch1: The Compose */}
            <SectionReveal>
              <section id="compose">
                <h2 className="mb-6 font-bold text-3xl">
                  Chapter 1: The Compose
                </h2>

                <div className="prose prose-neutral dark:prose-invert max-w-none">
                  <p className="text-foreground/80 text-xl leading-relaxed">
                    Every email starts with a lie — or at least a convenient
                    illusion. The compose window shows you simple fields: To,
                    From, Subject, Body. But underneath that friendly UI, your
                    email client is building a structured document with dozens
                    of headers, MIME encoding, and an envelope that's completely
                    separate from the message itself.
                  </p>

                  <p className="text-foreground/80 text-xl leading-relaxed">
                    This distinction between the{" "}
                    <span className="font-semibold text-foreground">
                      envelope
                    </span>{" "}
                    and the{" "}
                    <span className="font-semibold text-foreground">
                      content
                    </span>{" "}
                    is fundamental. The envelope (
                    <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">
                      MAIL FROM
                    </code>{" "}
                    and{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">
                      RCPT TO
                    </code>
                    ) tells servers where to route the message. The content (the{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">
                      From:
                    </code>{" "}
                    and{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">
                      To:
                    </code>{" "}
                    headers) is what you see in your inbox. They don't have to
                    match — and that mismatch is exactly how email spoofing
                    works.
                  </p>

                  <p className="text-foreground/80 text-xl leading-relaxed">
                    Try editing the compose form below and watch the raw SMTP
                    message update in real-time. Notice how the same information
                    appears in two different formats — human-readable and
                    machine-readable.
                  </p>
                </div>

                <div className="mt-8">
                  <ComposeViewer />
                </div>
              </section>
            </SectionReveal>

            {/* Ch2: The Handshake */}
            <SectionReveal>
              <section id="handshake">
                <h2 className="mb-6 font-bold text-3xl">
                  Chapter 2: The Handshake
                </h2>

                <div className="prose prose-neutral dark:prose-invert max-w-none">
                  <p className="text-foreground/80 text-xl leading-relaxed">
                    SMTP is a surprisingly conversational protocol. Your server
                    doesn't just blast a message at the recipient — it has a
                    structured back-and-forth dialogue, like two people on a
                    phone call. The server introduces itself, the recipient
                    confirms it's listening, then they negotiate how to transfer
                    the message.
                  </p>

                  <p className="text-foreground/80 text-xl leading-relaxed">
                    The conversation starts with a TCP connection to{" "}
                    <span className="font-semibold text-foreground">
                      port 25
                    </span>{" "}
                    (server-to-server) or{" "}
                    <span className="font-semibold text-foreground">
                      port 587
                    </span>{" "}
                    (client submission with auth). The receiving server responds
                    with a{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">
                      220
                    </code>{" "}
                    greeting — its way of saying "I'm here and ready." Your
                    server then says{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">
                      EHLO
                    </code>{" "}
                    (Extended Hello), and the conversation begins.
                  </p>

                  <p className="text-foreground/80 text-xl leading-relaxed">
                    Every SMTP response starts with a three-digit code.{" "}
                    <code className="rounded bg-success/20 px-1.5 py-0.5 text-success">
                      2xx
                    </code>{" "}
                    means success.{" "}
                    <code className="rounded bg-warning/20 px-1.5 py-0.5 text-warning">
                      3xx
                    </code>{" "}
                    means "keep going" (like 354 after DATA).{" "}
                    <code className="rounded bg-destructive/20 px-1.5 py-0.5 text-destructive">
                      4xx
                    </code>{" "}
                    is a temporary error (try again).{" "}
                    <code className="rounded bg-destructive/20 px-1.5 py-0.5 text-destructive">
                      5xx
                    </code>{" "}
                    is permanent failure (don't retry). The entire protocol runs
                    on this simple numbering system defined in 1982.
                  </p>

                  <p className="text-foreground/80 text-xl leading-relaxed">
                    Try it yourself. The terminal below simulates a real SMTP
                    session — type each command and watch the server respond.
                  </p>
                </div>

                <div className="mt-8">
                  <SmtpTerminal />
                </div>
              </section>
            </SectionReveal>

            {/* Ch3: The Lookup */}
            <SectionReveal>
              <section id="lookup">
                <h2 className="mb-6 font-bold text-3xl">
                  Chapter 3: The Lookup
                </h2>

                <div className="prose prose-neutral dark:prose-invert max-w-none">
                  <p className="text-foreground/80 text-xl leading-relaxed">
                    Before your server can deliver the message, it needs to find
                    out{" "}
                    <span className="font-semibold text-foreground">
                      where to send it
                    </span>
                    . The recipient's address says{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">
                      alice@example.com
                    </code>
                    , but what IP address actually handles mail for{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">
                      example.com
                    </code>
                    ?
                  </p>

                  <p className="text-foreground/80 text-xl leading-relaxed">
                    This is where{" "}
                    <span className="font-semibold text-foreground">
                      MX records
                    </span>{" "}
                    come in. Your server queries DNS for the MX (Mail Exchange)
                    records of the recipient domain. These records list one or
                    more mail servers, each with a{" "}
                    <span className="font-semibold text-foreground">
                      priority
                    </span>{" "}
                    number. Lower priority = tried first. If the primary server
                    is down, email falls back to the next one.
                  </p>

                  <p className="text-foreground/80 text-xl leading-relaxed">
                    The DNS resolution path goes: root servers → TLD servers
                    (.com, .org) → authoritative nameserver for the domain → MX
                    records. This usually takes 20-100ms. The result is cached,
                    so subsequent emails to the same domain skip the lookup.
                  </p>

                  <p className="text-foreground/80 text-xl leading-relaxed">
                    Try looking up the MX records for any domain below. You'll
                    see exactly which servers accept mail for that domain and in
                    what priority order.
                  </p>
                </div>

                <div className="mt-8">
                  <MxLookup />
                </div>
              </section>
            </SectionReveal>

            {/* Ch4: The Relay */}
            <SectionReveal>
              <section id="relay">
                <h2 className="mb-6 font-bold text-3xl">
                  Chapter 4: The Relay
                </h2>

                <div className="prose prose-neutral dark:prose-invert max-w-none">
                  <p className="text-foreground/80 text-xl leading-relaxed">
                    Email rarely goes directly from sender to recipient. It{" "}
                    <span className="font-semibold text-foreground">hops</span>{" "}
                    through multiple servers — your outbound mail server,
                    possibly a relay service (like AWS SES or Google's SMTP
                    relay), the recipient's inbound MX server, and finally the
                    IMAP store where the message lands.
                  </p>

                  <p className="text-foreground/80 text-xl leading-relaxed">
                    Each server that touches the email adds a{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">
                      Received:
                    </code>{" "}
                    header — a stamp showing where the message came from, which
                    server processed it, and when. These headers stack in
                    reverse order: the top Received header is the last hop, and
                    the bottom one is the first.
                  </p>

                  <p className="text-foreground/80 text-xl leading-relaxed">
                    This chain of Received headers is how you trace an email's
                    journey across the internet. It's also how receiving servers
                    detect suspicious routing — if an email claims to be from
                    Google but the Received chain shows it originated from an
                    unknown server in a different country, that's a red flag.
                  </p>
                </div>

                <div className="mt-8">
                  <RelayMap />
                </div>
              </section>
            </SectionReveal>

            {/* Ch5: The Trust Check */}
            <SectionReveal>
              <section id="trust">
                <h2 className="mb-6 font-bold text-3xl">
                  Chapter 5: The Trust Check
                </h2>

                <div className="prose prose-neutral dark:prose-invert max-w-none">
                  <p className="text-foreground/80 text-xl leading-relaxed">
                    SMTP was designed in 1982 — before spam, before phishing,
                    before anyone imagined email would carry financial
                    transactions. The protocol has{" "}
                    <span className="font-semibold text-destructive">
                      zero built-in authentication
                    </span>
                    . Any server can claim to be sending from any domain. It's
                    like a postal system where anyone can write any return
                    address on an envelope.
                  </p>

                  <p className="text-foreground/80 text-xl leading-relaxed">
                    Three protocols were added later to fix this: SPF (2006),
                    DKIM (2007), and DMARC (2012). Together, they form the
                    authentication chain that modern email depends on. When the
                    recipient's server receives your message, it runs all three
                    checks before deciding whether to deliver, quarantine, or
                    reject.
                  </p>
                </div>

                <div className="mt-8">
                  <AuthVisualizer />
                </div>

                <div className="mt-8">
                  <PredictionPrompt
                    options={[
                      {
                        label: "Email is rejected — both must pass",
                        correct: false,
                        explanation:
                          "DMARC requires either SPF or DKIM to pass AND align with the From: domain. Both don't need to pass.",
                      },
                      {
                        label:
                          "Email is delivered — DKIM pass is sufficient for DMARC",
                        correct: true,
                        explanation:
                          "Correct! DMARC passes if either SPF or DKIM passes AND aligns with the From: domain. DKIM passing is enough.",
                      },
                      {
                        label:
                          "Email goes to spam — partial pass means quarantine",
                        correct: false,
                        explanation:
                          "The DMARC policy (p=reject) only applies when DMARC itself fails. Since DKIM passes and aligns, DMARC passes.",
                      },
                    ]}
                    question="An email passes DKIM but fails SPF. The domain has DMARC with p=reject. What happens?"
                  />
                </div>

                <div className="prose prose-neutral dark:prose-invert mt-8 max-w-none">
                  <p className="text-foreground/80 text-xl leading-relaxed">
                    The key insight:{" "}
                    <span className="font-semibold text-foreground">
                      DMARC requires alignment
                    </span>
                    . It's not enough for SPF or DKIM to pass — the domain in
                    the result must match the{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">
                      From:
                    </code>{" "}
                    header domain. This prevents attackers from using their own
                    authenticated domain while spoofing a different From:
                    address.
                  </p>
                </div>

                <div className="mt-8">
                  <PredictionPrompt
                    options={[
                      {
                        label:
                          "Both pass SPF — one domain can have multiple SPF includes",
                        correct: true,
                        explanation:
                          "Correct! Your SPF record includes both Google's and SES's sending servers. Both are authorized to send for your domain.",
                      },
                      {
                        label:
                          "SES emails fail SPF — only one provider can be authorized",
                        correct: false,
                        explanation:
                          "SPF supports multiple include mechanisms. You can authorize as many sending services as needed (up to the 10-lookup limit).",
                      },
                      {
                        label: "You need separate domains for each provider",
                        correct: false,
                        explanation:
                          "While some companies use subdomains for different services, it's not required. SPF includes handle multiple providers on one domain.",
                      },
                    ]}
                    question="Your company uses Google Workspace for email but sends marketing emails through AWS SES. What happens with SPF?"
                  />
                </div>
              </section>
            </SectionReveal>

            {/* Ch6: The Inbox */}
            <SectionReveal>
              <section id="inbox">
                <h2 className="mb-6 font-bold text-3xl">
                  Chapter 6: The Inbox
                </h2>

                <div className="prose prose-neutral dark:prose-invert max-w-none">
                  <p className="text-foreground/80 text-xl leading-relaxed">
                    After passing authentication, the email lands in the
                    recipient's mail store. The recipient's email client
                    retrieves it using{" "}
                    <span className="font-semibold text-foreground">IMAP</span>{" "}
                    (Internet Message Access Protocol) or the older{" "}
                    <span className="font-semibold text-foreground">POP3</span>.
                    IMAP keeps messages on the server and syncs across devices;
                    POP3 downloads and (traditionally) deletes from the server.
                  </p>

                  <p className="text-foreground/80 text-xl leading-relaxed">
                    The full circle is complete. From compose window to SMTP
                    handshake, through DNS resolution and server relays, past
                    authentication checks, and into the inbox. The entire
                    journey typically takes{" "}
                    <span className="font-semibold text-foreground">
                      1-5 seconds
                    </span>{" "}
                    — though queuing, greylisting, or retry logic can extend it
                    to minutes or hours.
                  </p>

                  <p className="text-foreground/80 text-xl leading-relaxed">
                    Below is the complete Received header chain from our email's
                    journey. Each header was added by a different server at a
                    different step — read bottom to top to trace the path.
                  </p>
                </div>

                <div className="mt-8">
                  <HeaderChain />
                </div>
              </section>
            </SectionReveal>

            {/* Ch7: Deep Cuts */}
            <SectionReveal>
              <section id="deep-cuts">
                <h2 className="mb-6 font-bold text-3xl">
                  Chapter 7: Deep Cuts
                </h2>

                <div className="prose prose-neutral dark:prose-invert mb-8 max-w-none">
                  <p className="text-foreground/80 text-xl leading-relaxed">
                    Email's simplicity hides layers of complexity. Here are the
                    edge cases and failure modes that keep email administrators
                    up at night.
                  </p>
                </div>

                <DeepCutAccordion />
              </section>
            </SectionReveal>

            {/* CTA */}
            <SectionReveal>
              <section className="space-y-6 text-center">
                <h2 className="font-bold text-2xl">
                  Build on Top of Email Infrastructure You Own
                </h2>
                <p className="mx-auto max-w-xl text-muted-foreground">
                  Wraps deploys production-ready email infrastructure — DKIM,
                  SPF, DMARC, bounce handling, and sending — to your AWS
                  account. One command. You own everything.
                </p>

                <div className="overflow-hidden rounded-xl border bg-muted/50">
                  <div className="flex items-center gap-2 border-b px-4 py-2 text-muted-foreground text-xs">
                    <span className="inline-block h-3 w-3 rounded-full bg-destructive/60" />
                    <span className="inline-block h-3 w-3 rounded-full bg-warning/60" />
                    <span className="inline-block h-3 w-3 rounded-full bg-success/60" />
                    <span className="ml-2">Terminal</span>
                  </div>
                  <div className="p-4">
                    <code className="font-mono text-foreground text-sm">
                      <span className="text-muted-foreground">$</span> npx
                      @wraps.dev/cli email init
                    </code>
                  </div>
                </div>

                <div className="flex flex-col justify-center gap-3 sm:flex-row">
                  <a
                    className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-2.5 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                    href="/docs/quickstart"
                  >
                    Free CLI Quickstart
                  </a>
                  <a
                    className="inline-flex items-center justify-center rounded-lg border px-6 py-2.5 font-medium text-foreground transition-colors hover:bg-muted"
                    href="/tools"
                  >
                    Check Your Domain
                  </a>
                </div>

                <p className="text-center text-muted-foreground text-xs">
                  No credit card &middot; Open source &middot; Infrastructure
                  you own
                </p>
              </section>
            </SectionReveal>

            {/* Sources */}
            <footer id="post-footer">
              <Card className="p-6">
                <h4 className="mb-3 font-medium text-muted-foreground">
                  Sources & Further Reading
                </h4>
                <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs">
                  <a
                    className="text-primary hover:underline"
                    href="https://datatracker.ietf.org/doc/html/rfc5321"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    RFC 5321 — SMTP
                  </a>
                  <a
                    className="text-primary hover:underline"
                    href="https://datatracker.ietf.org/doc/html/rfc7208"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    RFC 7208 — SPF
                  </a>
                  <a
                    className="text-primary hover:underline"
                    href="https://datatracker.ietf.org/doc/html/rfc6376"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    RFC 6376 — DKIM
                  </a>
                  <a
                    className="text-primary hover:underline"
                    href="https://datatracker.ietf.org/doc/html/rfc7489"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    RFC 7489 — DMARC
                  </a>
                  <a
                    className="text-primary hover:underline"
                    href="https://datatracker.ietf.org/doc/html/rfc3501"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    RFC 3501 — IMAP
                  </a>
                </div>
              </Card>
            </footer>
          </div>
        </main>

        <LandingFooter />
      </div>
    </>
  );
}
