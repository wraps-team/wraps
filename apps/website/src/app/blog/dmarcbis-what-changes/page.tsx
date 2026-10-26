import { Card } from "@wraps/ui/components/ui/card";
import {
  AlertTriangle,
  ChevronRight,
  FileCheck,
  Network,
  Shield,
} from "lucide-react";
import type { Metadata } from "next";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { JsonLd } from "@/components/json-ld";
import { CodeBlock } from "./page-content";

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "DMARC Is Finally an Actual Standard",
  description:
    "RFC 9989 made DMARC Standards Track in May 2026, obsoleting RFC 7489 and RFC 9091. The Public Suffix List is replaced by a DNS tree walk, pct= is removed, np= and t= are in. What changed, and what Wraps ships.",
  datePublished: "2026-07-09T00:00:00.000Z",
  dateModified: "2026-07-09T00:00:00.000Z",
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
    "@id": "https://wraps.dev/blog/dmarcbis-what-changes",
  },
};

export const metadata: Metadata = {
  title: "DMARC Is Finally an Actual Standard: What RFC 9989 Changes",
  description:
    "RFC 9989 made DMARC Standards Track in May 2026, obsoleting RFC 7489 and RFC 9091. The Public Suffix List is replaced by a DNS tree walk, pct= is removed, np= and t= are in.",
  openGraph: {
    title: "DMARC Is Finally an Actual Standard | Wraps",
    description:
      "Every tag RFC 9989 changed: the tree walk, the removal of pct=, np=, t=, psd=, and a p= that is now only RECOMMENDED.",
    type: "article",
    url: "https://wraps.dev/blog/dmarcbis-what-changes",
    publishedTime: "2026-07-09T00:00:00.000Z",
    authors: ["Wraps Team"],
  },
  twitter: {
    card: "summary_large_image",
    title: "DMARC Is Finally an Actual Standard | Wraps",
    description:
      "Every tag RFC 9989 changed: the tree walk, the removal of pct=, np=, t=, psd=, and a p= that is now only RECOMMENDED.",
  },
  alternates: {
    canonical: "https://wraps.dev/blog/dmarcbis-what-changes",
  },
};

const tagRegistry = [
  {
    tag: "v",
    status: "active",
    note: "Version. Must be DMARC1. Records not starting with a v tag for the current version are discarded during discovery.",
  },
  {
    tag: "p",
    status: "active",
    note: "Domain Owner Assessment Policy. Now RECOMMENDED rather than required.",
  },
  {
    tag: "sp",
    status: "active",
    note: "Policy for existing subdomains only. Ignored on records published at subdomains of Organizational Domains and PSDs.",
  },
  {
    tag: "np",
    status: "active",
    note: "Policy for non-existent subdomains. Falls back to sp, then p, when absent.",
  },
  {
    tag: "t",
    status: "active",
    note: "Test mode. t=y applies the policy one level down. Default n.",
  },
  {
    tag: "psd",
    status: "active",
    note: "Public Suffix Domain flag: y, n, or u. Default u. Steers the tree walk.",
  },
  {
    tag: "adkim",
    status: "active",
    note: "DKIM identifier alignment mode: s or r.",
  },
  {
    tag: "aspf",
    status: "active",
    note: "SPF identifier alignment mode: s or r.",
  },
  {
    tag: "rua",
    status: "active",
    note: "Aggregate report destinations. Report format is now defined by RFC 9990.",
  },
  {
    tag: "ruf",
    status: "active",
    note: "Failure report destinations. Report format is now defined by RFC 9991.",
  },
  {
    tag: "fo",
    status: "active",
    note: "Failure reporting options: 0, 1, d, s. Content MUST be ignored if ruf is not also specified.",
  },
  {
    tag: "pct",
    status: "historic",
    note: "Sampling rate. Removed from the specification; the IANA reference still points at RFC 7489.",
  },
  {
    tag: "rf",
    status: "historic",
    note: "Failure report format.",
  },
  {
    tag: "ri",
    status: "historic",
    note: "Aggregate reporting interval.",
  },
];

export default function Page() {
  return (
    <>
      <JsonLd data={articleSchema} />
      <div className="min-h-screen bg-background text-foreground">
        <LandingNavbar />

        {/* Hero */}
        <header className="relative overflow-hidden">
          <div className="absolute inset-0 bg-radial-top from-brand/20 via-transparent to-transparent" />

          <div className="relative mx-auto max-w-4xl px-6 pt-20 pb-16">
            <div className="mb-4 flex items-center gap-2 font-medium text-brand text-sm">
              <FileCheck size={16} />
              <span>Security</span>
              <span className="text-muted-foreground/50">&bull;</span>
              <span className="text-muted-foreground">13 min read</span>
              <span className="text-muted-foreground/50">&bull;</span>
              <span className="text-muted-foreground">Wraps Team</span>
              <span className="text-muted-foreground/50">&bull;</span>
              <span className="text-muted-foreground">July 9, 2026</span>
            </div>

            <h1 className="mb-6 font-bold text-4xl leading-tight md:text-5xl lg:text-6xl">
              DMARC Is Finally
              <span className="block bg-gradient-to-r from-brand to-warning bg-clip-text text-transparent dark:to-warning">
                an Actual Standard
              </span>
            </h1>

            <p className="max-w-2xl text-muted-foreground text-xl leading-relaxed">
              RFC 9989 published in May 2026 and obsoleted the Informational RFC
              7489. The Public Suffix List is out, <code>pct=</code> is gone,
              and <code>np=</code> is in. Wraps ships the parser and generator
              changes today in{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-base">
                @wraps.dev/email-check@1.1.0
              </code>
              .
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <div className="flex items-center gap-2 rounded-full border bg-muted/30 px-4 py-2">
                <Shield className="text-brand" size={16} />
                <span className="text-foreground/80 text-sm">
                  Standards Track, May 2026
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-full border bg-muted/30 px-4 py-2">
                <Network className="text-brand" size={16} />
                <span className="text-foreground/80 text-sm">
                  Tree walk replaces the PSL
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-full border bg-muted/30 px-4 py-2">
                <FileCheck className="text-brand" size={16} />
                <span className="text-foreground/80 text-sm">
                  pct= removed, np= and t= added
                </span>
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-4xl space-y-16 px-6 py-16">
          {/* Status change */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">
              DMARC was never an IETF standard. Now it is.
            </h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              If you have ever argued with a mailbox provider about DMARC
              behavior, you have run into the awkward part: RFC 7489 was
              published as <span className="font-medium">Informational</span>.
              It described what the industry had converged on. It was not a
              specification you could hold anyone to.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              That ended in May 2026. RFC 9989 carries{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                Category: Standards Track
              </code>{" "}
              and{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                Obsoletes: 7489, 9091
              </code>{" "}
              in its header. DMARC is a Proposed Standard. The normative
              keywords in it are real ones, and the tag registry it defines is
              authoritative &mdash; per Section 4.7, only tags in that registry
              are to be processed, and unknown tags MUST be ignored.
            </p>

            <p className="mb-6 text-foreground/80 text-lg leading-relaxed">
              The work &mdash; known throughout its life as DMARCbis, and
              finalized as{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                draft-ietf-dmarc-dmarcbis-41
              </code>{" "}
              &mdash; shipped as three documents, not one:
            </p>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">RFC 9989</h3>
                <p className="text-foreground/80 text-sm leading-relaxed">
                  The core protocol. Policy records, discovery, identifier
                  alignment, the tag registry.
                </p>
              </div>
              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">RFC 9990</h3>
                <p className="text-foreground/80 text-sm leading-relaxed">
                  Aggregate Reporting. What <code>rua=</code> destinations
                  actually receive.
                </p>
              </div>
              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">RFC 9991</h3>
                <p className="text-foreground/80 text-sm leading-relaxed">
                  Failure Reporting. What <code>ruf=</code> destinations
                  actually receive.
                </p>
              </div>
            </div>

            <p className="mt-6 text-foreground/80 text-lg leading-relaxed">
              The second obsoletion is easy to miss. RFC 9091 was the
              experimental Public Suffix Domain extension &mdash; the one that
              gave us{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">np=</code> and
              the notion of a registry operator publishing policy on behalf of
              everything under it. It is no longer an experiment. It is folded
              into the base standard as the{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">psd=</code> tag.
            </p>
          </section>

          {/* Tree walk */}
          <section>
            <h2 className="mb-6 flex items-center gap-3 font-bold text-3xl">
              <Network className="text-brand" />
              The tree walk replaces the Public Suffix List
            </h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              This is the largest architectural change in the document, and it
              is the one nobody put in a release note.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              DMARC has always needed to answer one question before it can do
              anything else: what is the Organizational Domain for this name?
              That answer decides which record applies and whether an
              authenticated identifier is aligned. Under RFC 7489 the answer
              came from a Public Suffix List. RFC 9989 Section 4.10 explains, at
              some length, why that was a problem:
            </p>

            <div className="rounded-lg border-muted-foreground/30 border-l-4 bg-muted/30 p-5">
              <p className="text-foreground/80 italic leading-relaxed">
                &ldquo;[RFC7489] mandated no requirement for a specific PSL for
                Mail Receivers to use (though it did suggest the one found at
                https://publicsuffix.org/) nor did it provide any guidance for
                the frequency of regular retrieval of the PSL... [RFC7489]
                acknowledged the possibility of interoperability issues caused
                by Mail Receivers choosing different PSLs&rdquo;
              </p>
              <p className="mt-2 text-muted-foreground text-sm">
                &mdash; RFC 9989 &sect;4.10
              </p>
            </div>

            <p className="mt-4 mb-4 text-foreground/80 text-lg leading-relaxed">
              Two receivers with two different snapshots of a list maintained
              outside the IETF could legitimately disagree about your
              Organizational Domain, and therefore about whether your mail was
              aligned. RFC 9989 replaces the list with something every receiver
              already has: DNS.
            </p>

            <div className="rounded-lg border-muted-foreground/30 border-l-4 bg-muted/30 p-5">
              <p className="text-foreground/80 italic leading-relaxed">
                &ldquo;Rather than just using a PSL to help identify an
                Organizational Domain, this update defines a discovery technique
                known colloquially as the &lsquo;DNS Tree Walk&rsquo;.&rdquo;
              </p>
              <p className="mt-2 text-muted-foreground text-sm">
                &mdash; RFC 9989 &sect;4.10
              </p>
            </div>

            <h3 className="mt-8 mb-3 font-semibold text-xl">
              How the walk works
            </h3>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Section 4.10 lays it out in seven steps. Query{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                _dmarc.&lt;target&gt;
              </code>{" "}
              for a TXT record in DMARC Policy Record format. Discard anything
              that does not start with a <code>v</code> tag for the current
              version. If a single record remains and it carries{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">psd=n</code> or{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">psd=y</code>,
              stop. Otherwise count the labels, strip the leftmost one, and
              query again &mdash; repeating until you run out of labels.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              There is one shortcut in the middle of that loop, and the RFC is
              refreshingly blunt about why it exists:
            </p>

            <div className="rounded-lg border-muted-foreground/30 border-l-4 bg-muted/30 p-5">
              <p className="text-foreground/80 italic leading-relaxed">
                &ldquo;the potential exists for an ill-intentioned Domain Owner
                to send mail with Author Domains with tens or even hundreds of
                labels for the purpose of executing a denial-of-service attack
                on the Mail Receiver. To guard against such abuse of the DNS, a
                shortcut is built into the process so that Author Domains with
                more than eight labels do not result in more than eight DNS
                queries. Observed data at the time of publication showed that
                Author Domains with up to seven labels were in usage&rdquo;
              </p>
              <p className="mt-2 text-muted-foreground text-sm">
                &mdash; RFC 9989 &sect;4.10
              </p>
            </div>

            <p className="mt-4 mb-4 text-foreground/80 text-lg leading-relaxed">
              So a name with fewer than eight labels strips one label at a time.
              A name with eight or more jumps straight down to seven remaining
              labels and continues from there. The RFC works the pathological
              case through in full:
            </p>

            <CodeBlock
              code={`Author Domain: a.b.c.d.e.f.g.h.i.j.mail.example.com

_dmarc.a.b.c.d.e.f.g.h.i.j.mail.example.com
_dmarc.g.h.i.j.mail.example.com
_dmarc.h.i.j.mail.example.com
_dmarc.i.j.mail.example.com
_dmarc.j.mail.example.com
_dmarc.mail.example.com
_dmarc.example.com
_dmarc.com

= 8 queries, the hard cap`}
              lang="text"
              title="tree walk, worst case"
            />

            <p className="mt-4 mb-4 text-foreground/80 text-lg leading-relaxed">
              Eight is a ceiling, not a cost. A normal two- or three-label
              domain that publishes its own record resolves in one query and
              stops. Nobody is paying eight lookups per message.
            </p>

            <h3 className="mt-8 mb-3 font-semibold text-xl">
              It runs more than once per message
            </h3>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Section 4.10 opens by naming two distinct uses for the walk. The
              first is the obvious one: policy discovery (Section 4.10.1), when
              the Author Domain has no record of its own and the receiver needs
              to find the one it inherits from. The second is the one people
              forget &mdash; identifier alignment evaluation (Section 4.10.2),
              deciding whether the SPF- or DKIM-authenticated identifier and the
              Author Domain share an Organizational Domain. A receiver may run
              the walk several times while evaluating a single message.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Once the walk has collected records, Section 4.10.2 picks the
              Organizational Domain by going from the longest name to the
              shortest. A record with{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">psd=n</code> wins
              immediately &mdash; that name is the Organizational Domain, stop
              looking. A record other than the starting point carrying{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">psd=y</code>{" "}
              means the Organizational Domain is the domain one label below it.
              Failing both, it is the record found at the name with the fewest
              labels. If the process determines nothing at all, the initial
              target domain is the Organizational Domain.
            </p>

            <Card className="p-6">
              <p className="text-foreground/80 leading-relaxed">
                That first rule is the interesting one.{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">psd=n</code> is
                an escape hatch: per Section 4.7, it declares the domain is not
                a PSD and is the Organizational Domain for itself and its
                subdomains. A large organization whose boundary the PSL got
                wrong can now assert its own boundary in its own DNS instead of
                filing a pull request against a list. The default is{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">psd=u</code>{" "}
                &mdash; unknown, run the walk.
              </p>
            </Card>

            <div className="mt-6 rounded-lg border-destructive border-l-4 bg-destructive/10 p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium">
                    Two DMARC records at one name means zero DMARC records.
                  </p>
                  <p className="mt-2 text-foreground/80 leading-relaxed">
                    Step 2 of the walk is explicit: if multiple DMARC Policy
                    Records are returned for a single target, they are all
                    discarded. Not &ldquo;the first one wins&rdquo;, not
                    &ldquo;merge them&rdquo; &mdash; discarded. And per Section
                    4.10.1, if the walk finds no record, Mail Receivers MUST NOT
                    apply the DMARC mechanism to the message. A duplicated TXT
                    record left behind by a migration silently turns your policy
                    off.
                  </p>
                </div>
              </div>
            </div>

            <p className="mt-6 text-foreground/80 text-lg leading-relaxed">
              Two things this change is <span className="font-medium">not</span>
              . It is not a deprecation of the Public Suffix List &mdash; RFC
              9989 replaces the PSL for DMARC Organizational Domain discovery
              and says nothing about the list&rsquo;s many other consumers. And
              it is not a new obligation on you. There is no requirement that
              you publish a &ldquo;tree-walk discoverable&rdquo; record. Section
              5.1.4 notes that if the Organizational Domain differs from the
              Author Domain, a record also needs to be published for the
              Organizational Domain. That is a publishing recommendation, and
              the MUSTs in this area all land on the receiver.
            </p>
          </section>

          {/* pct */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">
              <code className="rounded bg-muted px-2 py-1 text-2xl">pct=</code>{" "}
              is gone
            </h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Not softened. Not discouraged in prose. Removed.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Section 4.7 lists the complete set of valid DMARC tags:{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">adkim</code>,{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">aspf</code>,{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">fo</code>,{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">np</code>,{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">p</code>,{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">psd</code>,{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">rua</code>,{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">ruf</code>,{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">sp</code>,{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">t</code>,{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">v</code>.{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">pct</code> is not
              on it. The IANA registry in Section 9.3 lists it as{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">historic</code>,
              with the reference column still pointing at RFC 7489 &mdash;
              IANA&rsquo;s way of saying this tag belongs to the old document.
              The registry defines that status as meaning &ldquo;the tag is
              considered deprecated and is not expected to be in use in any
              current implementation&rdquo;.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Combine that with the unknown-tag rule from the same section
              &mdash; only tags in the registry are to be processed, unknown
              tags MUST be ignored &mdash; and a{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">pct=25</code> in
              your record is now just text a conforming receiver steps over.
            </p>

            <h3 className="mt-8 mb-3 font-semibold text-xl">
              Why, in the RFC&rsquo;s own words
            </h3>

            <div className="rounded-lg border-muted-foreground/30 border-l-4 bg-muted/30 p-5">
              <p className="text-foreground/80 italic leading-relaxed">
                &ldquo;Operational experience showed that the &lsquo;pct&rsquo;
                tag was usually not accurately applied, unless the value
                specified was either 0 or 100 (the default), and the
                inaccuracies with other values varied widely from one
                implementation to another.&rdquo;
              </p>
              <p className="mt-2 text-muted-foreground text-sm">
                &mdash; RFC 9989, Appendix A.6
              </p>
            </div>

            <p className="mt-4 mb-4 text-foreground/80 text-lg leading-relaxed">
              Read that again if you have ever staged a rollout at{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">pct=25</code>.
              The percentage was not being applied the way you assumed, and it
              was being misapplied differently by every receiver. The dial you
              thought you were turning was painted on.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              What survived is the one value that did something reliable.
              Appendix A.6 records that some intermediaries treated{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">pct=0</code> as a
              signal to rewrite the{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                RFC5322.From
              </code>{" "}
              header, which meant a Domain Owner could compare aggregate reports
              before and after setting it and infer how much of its traffic
              flowed through non-rewriting intermediaries. That side effect was
              worth keeping. The tag wrapped around it was not:
            </p>

            <div className="rounded-lg border-muted-foreground/30 border-l-4 bg-muted/30 p-5">
              <p className="text-foreground/80 italic leading-relaxed">
                &ldquo;it didn&rsquo;t make sense to support a tag named
                &lsquo;pct&rsquo; that had only two valid values. This version
                of the DMARC mechanism, therefore, introduces the
                &lsquo;t&rsquo; tag as shorthand for &lsquo;testing&rsquo;, with
                the valid values of &lsquo;y&rsquo; and &lsquo;n&rsquo;, which
                are meant to be analogous in their application by mailbox
                providers and intermediaries to the &lsquo;pct&rsquo; tag values
                &lsquo;0&rsquo; and &lsquo;100&rsquo;, respectively.&rdquo;
              </p>
              <p className="mt-2 text-muted-foreground text-sm">
                &mdash; RFC 9989, Appendix A.6
              </p>
            </div>
          </section>

          {/* t= */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">
              <code className="rounded bg-muted px-2 py-1 text-2xl">t=</code>{" "}
              steps your policy down one level
            </h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Section 4.7 defines <code>t</code> as DMARC policy test mode,
              optional, defaulting to{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">n</code>. The
              semantics are more precise than &ldquo;testing&rdquo; suggests:
            </p>

            <div className="rounded-lg border-muted-foreground/30 border-l-4 bg-muted/30 p-5">
              <p className="text-foreground/80 italic leading-relaxed">
                &ldquo;if the policy is &lsquo;quarantine&rsquo; and the value
                of the &lsquo;t&rsquo; tag is &lsquo;y&rsquo;, a policy of
                &lsquo;none&rsquo; will be applied to failing messages; if the
                policy is &lsquo;reject&rsquo; and the value of the
                &lsquo;t&rsquo; tag is &lsquo;y&rsquo;, a policy of
                &lsquo;quarantine&rsquo; will be applied to failing
                messages&rdquo;
              </p>
              <p className="mt-2 text-muted-foreground text-sm">
                &mdash; RFC 9989 &sect;4.7
              </p>
            </div>

            <div className="mt-6 rounded-lg border-destructive border-l-4 bg-destructive/10 p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium">
                    <code>t=y</code> is not an off switch.
                  </p>
                  <p className="mt-2 text-foreground/80 leading-relaxed">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      p=reject; t=y
                    </code>{" "}
                    still quarantines failing mail. If you meant &ldquo;observe
                    and do nothing&rdquo;, you meant{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      p=quarantine; t=y
                    </code>{" "}
                    or plain{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      p=none
                    </code>
                    . Section 4.7 also notes the tag has no effect on any policy
                    that is already <code>none</code>, and does not affect the
                    generation of DMARC reports &mdash; so your aggregate feed
                    keeps flowing while you test.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* np / sp */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">
              <code className="rounded bg-muted px-2 py-1 text-2xl">np=</code>,{" "}
              <code className="rounded bg-muted px-2 py-1 text-2xl">sp=</code>,
              and what &ldquo;non-existent&rdquo; means
            </h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              These two tags carve the subdomain space in half.{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">np</code> takes
              the names that do not exist;{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">sp</code> takes
              the ones that do.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Section 4.7 defines <code>np</code> as the Domain Owner Assessment
              Policy for non-existent subdomains of the given Organizational
              Domain. Its syntax is identical to{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">p</code>. It
              applies only to non-existent subdomains &mdash; not to existing
              subdomains, and not to the domain itself. When it is absent, the
              policy from <code>sp</code> applies if <code>sp</code> is present,
              and the policy from <code>p</code> applies if it is not.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              That inheritance chain is why <code>np</code> is the cheapest
              hardening available to most domains. Attackers do not need a real
              subdomain to spoof you; they need a plausible-looking one.{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">np=reject</code>{" "}
              closes the entire space of names you never created, without
              touching any name you did.
            </p>

            <h3 className="mt-8 mb-3 font-semibold text-xl">
              &ldquo;Non-existent&rdquo; is narrower than you think
            </h3>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Appendix A.4 defines the test, and it is deliberately permissive:
            </p>

            <div className="rounded-lg border-muted-foreground/30 border-l-4 bg-muted/30 p-5">
              <p className="text-foreground/80 italic leading-relaxed">
                &ldquo;The DMARC mechanism makes no such requirement for the
                existence of specific DNS RRs in order for a domain to exist;
                instead, if any RR exists for a domain, then the domain
                exists.&rdquo;
              </p>
              <p className="mt-2 text-muted-foreground text-sm">
                &mdash; RFC 9989, Appendix A.4
              </p>
            </div>

            <p className="mt-4 mb-4 text-foreground/80 text-lg leading-relaxed">
              The appendix spells out the DNS distinction that this rests on: an{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">NXDOMAIN</code>{" "}
              response means the name does not exist, while a{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">NODATA</code>{" "}
              response &mdash; rcode{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">NOERROR</code>{" "}
              with no records of the queried type &mdash; means the type does
              not exist but the name does. It also carries the RFC 8020
              consequence forward: if a query for a name returns NXDOMAIN, every
              name below it in the hierarchy also does not exist.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Note what the RFC declined to do. It does not use the narrower
              &ldquo;resolvable&rdquo; definition from RFC 5321, which would
              have required MX, A, or AAAA records. A lone TXT record makes a
              name exist. A stale CNAME makes a name exist. Which means{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">np</code> will
              quietly not apply to a large number of names you assumed it
              covered &mdash; and{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">sp</code> will.
            </p>

            <h3 className="mt-8 mb-3 font-semibold text-xl">
              <code>sp=</code> got narrower, and gained a footgun
            </h3>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Section 4.7 now scopes <code>sp</code> to mail using an{" "}
              <span className="font-medium">existing</span> subdomain of the
              prevailing Organizational Domain, and not to the Organizational
              Domain itself. The non-existent half was carved out into{" "}
              <code>np</code>. The inheritance rule you already know still
              holds: with both <code>sp</code> absent and <code>np</code> absent
              or not applicable, the <code>p</code> policy MUST be applied for
              subdomains.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              The part worth writing on a sticky note is the last sentence of
              that definition:
            </p>

            <div className="rounded-lg border-muted-foreground/30 border-l-4 bg-muted/30 p-5">
              <p className="text-foreground/80 italic leading-relaxed">
                &ldquo;Note that &lsquo;sp&rsquo; will be ignored for DMARC
                Policy Records published on subdomains of Organizational Domains
                and PSDs due to the effect of the DMARC policy discovery
                (Section 4.10.1).&rdquo;
              </p>
              <p className="mt-2 text-muted-foreground text-sm">
                &mdash; RFC 9989 &sect;4.7
              </p>
            </div>

            <p className="mt-4 text-foreground/80 text-lg leading-relaxed">
              Publishing{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">sp=reject</code>{" "}
              at{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                _dmarc.mail.example.com
              </code>{" "}
              does nothing. It parses, it validates, it will show up green in
              most checkers, and it has no effect. Subdomain policy is a
              property of the Organizational Domain record.
            </p>
          </section>

          {/* p= */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">
              <code className="rounded bg-muted px-2 py-1 text-2xl">p=</code> is
              now RECOMMENDED, not required
            </h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              This one is under-reported and it changes what counts as a valid
              record. Section 4.7 marks <code>p</code> as{" "}
              <span className="font-medium">RECOMMENDED</span> for DMARC Policy
              Records, and adds that if the tag is not present in an otherwise
              syntactically valid record, the record is treated as if it
              included <code>p=none</code>.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Section 4.10.1 makes the receiver behavior normative. If a
              retrieved record has no valid <code>p</code> tag &mdash; or has an{" "}
              <code>sp</code> or <code>np</code> tag that is not valid &mdash;
              and a <code>rua</code> tag is present containing at least one
              syntactically valid reporting URI, the Mail Receiver MUST act as
              if a record containing <code>p=none</code> was retrieved and
              continue processing. Without that valid <code>rua</code>, the
              receiver applies no DMARC processing to the message at all.
            </p>

            <CodeBlock
              code={`; valid under RFC 9989. means p=none.
_dmarc.example.com. IN TXT "v=DMARC1; rua=mailto:dmarc@example.com"

; also valid: a broken p= with a working rua= degrades to p=none
_dmarc.example.com. IN TXT "v=DMARC1; p=bogus; rua=mailto:dmarc@example.com"

; no DMARC processing at all: broken p=, no rua= to fall back to
_dmarc.example.com. IN TXT "v=DMARC1; p=bogus"`}
              lang="text"
              title="dns records"
            />

            <p className="mt-4 text-foreground/80 text-lg leading-relaxed">
              The practical read: a monitoring-only record no longer needs to
              say so. It needs somewhere to send the reports. We will come back
              to this one &mdash; Wraps&rsquo; own parser gets it wrong today.
            </p>
          </section>

          {/* Reporting tags */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">
              Reporting moved out of the core document
            </h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              <code className="rounded bg-muted px-1.5 py-0.5">rua</code> and{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">ruf</code> are
              still active tags, but the formats they produce are no longer
              defined in the DMARC document. Section 4.7 points <code>rua</code>{" "}
              at RFC 9990 and <code>ruf</code> at RFC 9991. Both also gained a
              MUST: if the tag is not provided, Mail Receivers MUST NOT generate
              reports of that kind for the domain, and URIs using schemes a
              receiver does not support MUST be ignored.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Two tags did not survive the move. Section 9.3 marks both{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">rf</code>{" "}
              (failure report format) and{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">ri</code>{" "}
              (aggregate reporting interval) as{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">historic</code>,
              and neither appears in the Section 4.7 valid tag list.{" "}
              <code>ri</code> is the sharper loss of the two: report cadence is
              no longer something a sender asks for in its policy record. If you
              have been setting{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">ri=3600</code>{" "}
              and wondering why reports still arrive daily, that question is now
              settled by removal.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              <code className="rounded bg-muted px-1.5 py-0.5">fo</code>{" "}
              survives unchanged in shape &mdash; colon-separated values from{" "}
              <code>0</code>, <code>1</code>, <code>d</code>, <code>s</code>,
              defaulting to <code>0</code> &mdash; with one clarification worth
              knowing: Section 4.7 says its content MUST be ignored if a{" "}
              <code>ruf</code> tag is not also specified. A record with{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">fo=1</code> and
              no <code>ruf=</code> is doing nothing.
            </p>

            <h3 className="mt-8 mb-4 font-semibold text-xl">
              The tag registry, after RFC 9989
            </h3>

            <div className="divide-y overflow-hidden rounded-lg border">
              {tagRegistry.map((entry) => (
                <div
                  className="flex flex-col gap-2 p-4 sm:flex-row sm:items-baseline sm:gap-4"
                  key={entry.tag}
                >
                  <div className="flex shrink-0 items-center gap-2 sm:w-40">
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
                      {entry.tag}=
                    </code>
                    <span
                      className={
                        entry.status === "historic"
                          ? "font-medium text-destructive text-xs uppercase"
                          : "font-medium text-muted-foreground text-xs uppercase"
                      }
                    >
                      {entry.status}
                    </span>
                  </div>
                  <p className="text-foreground/80 leading-relaxed">
                    {entry.note}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* p=none */}
          <section>
            <h2 className="mb-6 flex items-center gap-3 font-bold text-3xl">
              <Shield className="text-brand" />
              What did not change, and one new protection
            </h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              The advice has not moved.{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">p=none</code> is
              still where Section 5.1.4 tells you to start, paired with a{" "}
              <code>rua</code> pointing at a mailbox you actually read. It is
              still not protection. But RFC 9989 added a normative guarantee
              around it that RFC 7489 did not have:
            </p>

            <div className="rounded-lg border-muted-foreground/30 border-l-4 bg-muted/30 p-5">
              <p className="text-foreground/80 italic leading-relaxed">
                &ldquo;To enable Domain Owners to receive DMARC feedback without
                impacting existing mail processing, discovered policies of
                &lsquo;p=none&rsquo; MUST NOT modify existing mail handling
                processes.&rdquo;
              </p>
              <p className="mt-2 text-muted-foreground text-sm">
                &mdash; RFC 9989 &sect;5.4
              </p>
            </div>

            <p className="mt-4 mb-4 text-foreground/80 text-lg leading-relaxed">
              That is a floor, not a ceiling: publishing monitoring mode is
              guaranteed not to make your deliverability worse than publishing
              nothing. It removes the last excuse for not turning DMARC on
              tomorrow. It does not make{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">p=none</code> do
              anything for you.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              The same section applies a check in the other direction, at anyone
              feeling triumphant about reaching{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">p=reject</code>:
              Mail Receivers SHOULD NOT reject messages solely because of a
              published policy of reject, and should apply other knowledge and
              analysis to avoid rejecting legitimate messages sent in ways DMARC
              cannot describe, harming mailing lists, and similar. Your policy
              is an input to a decision, not the decision.
            </p>

            <p className="text-foreground/80 text-lg leading-relaxed">
              And on the timeline, the RFC is sober. Section 5.1.7 says that
              depending on sending cadence, it may take{" "}
              <span className="font-medium">many months</span> of consuming
              aggregate reports before a Domain Owner is sure it is properly
              authenticating all of its mail. If a vendor promises you{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">p=reject</code>{" "}
              in a fortnight, that promise is not coming from the spec. The
              four-step ramp is covered in detail in{" "}
              <a
                className="text-brand underline underline-offset-4 hover:text-brand"
                href="/blog/your-dmarc-policy-is-useless"
              >
                Your DMARC Policy Is Useless
              </a>
              ; nothing in RFC 9989 changes the shape of it, only the tags you
              use along the way.
            </p>
          </section>

          {/* Record before/after */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">
              The record, before and after
            </h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Here is what a Wraps-generated DMARC record looked like before
              today, and what it looks like now:
            </p>

            <CodeBlock
              code={`; before
_dmarc.example.com. IN TXT "v=DMARC1; p=quarantine; rua=mailto:postmaster@mail.example.com"

; after
_dmarc.example.com. IN TXT "v=DMARC1; p=quarantine; sp=quarantine; np=reject; rua=mailto:postmaster@mail.example.com"`}
              lang="text"
              title="dns record"
            />

            <p className="mt-4 mb-4 text-foreground/80 text-lg leading-relaxed">
              Two additions, and only one of them changes behavior.{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                sp=quarantine
              </code>{" "}
              is a no-op in policy terms &mdash; Section 4.7 already says an
              absent <code>sp</code> inherits from <code>p</code>, so writing it
              out changes nothing except how the record reads. We write it
              because a record that states its subdomain policy is a record
              nobody has to reason about at 2am.
            </p>

            <p className="text-foreground/80 text-lg leading-relaxed">
              <code className="rounded bg-muted px-1.5 py-0.5">np=reject</code>{" "}
              is the real change. Under the old record, mail from a subdomain
              that has never existed inherited{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                p=quarantine
              </code>{" "}
              &mdash; a spoofed{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                billing.example.com
              </code>{" "}
              landed in the junk folder, where people read it. Now it is
              rejected at the door.
            </p>
          </section>

          {/* What Wraps shipped */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">
              What Wraps shipped today
            </h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Two packages went out this morning:{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                @wraps.dev/email-check@1.1.0
              </code>{" "}
              (the library) and{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                mail-audit@1.2.0
              </code>{" "}
              (the standalone CLI that bundles it). The change has two halves:
              the checker learned the new tags, and every place Wraps writes a
              DMARC record started writing the new one.
            </p>

            <h3 className="mt-8 mb-3 font-semibold text-xl">The parser</h3>

            <div className="space-y-4">
              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">
                  <code>np=</code>, <code>t=</code>, and <code>psd=</code> are
                  recognized
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  <code className="rounded bg-muted px-1.5 py-0.5">np</code> is
                  validated against the same three values as <code>p</code> and
                  surfaced as{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    nonExistentSubdomainPolicy
                  </code>
                  ; an invalid value gets a warning rather than being dropped
                  silently. <code>t=y</code> sets a{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    testing
                  </code>{" "}
                  flag. <code>psd</code> is validated against <code>y</code>/
                  <code>n</code>/<code>u</code>.
                </p>
              </div>

              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">
                  <code>pct</code> went from a knob to a nudge
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  It used to cost you 2 points when set below 100, on the theory
                  that you were under-enforcing. That was the wrong frame:{" "}
                  <code>pct</code> is not a weaker policy, it is a tag receivers
                  no longer read. It is now a 1-point deprecation nudge with a
                  warning that tells you to use{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">t=y</code>{" "}
                  while testing instead.
                </p>
              </div>

              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">
                  <code>np=reject</code> earns a point; missing <code>np</code>{" "}
                  earns a warning
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  Any record with an enforcing policy and no{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">np=</code>{" "}
                  now gets a recommendation. Set{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    np=reject
                  </code>{" "}
                  on an enforcing policy and you get a +1 bonus. Be clear-eyed
                  about what that buys: the letter grade is set by whether SPF,
                  DKIM, and an enforcing DMARC are all present, and bonuses move
                  you within a band, never across one. It will not turn a B into
                  an A. It is worth exactly one point, and it is the right thing
                  to do anyway.
                </p>
              </div>

              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">
                  Eight new tests, sixty green
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  Five parser cases and three scoring cases. One of them pins
                  the <code>pct</code> demotion at exactly 1 point, so a future
                  refactor cannot quietly promote it back to a penalty.
                </p>
              </div>
            </div>

            <h3 className="mt-8 mb-3 font-semibold text-xl">The generator</h3>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              The new record string replaced the old one in fifteen places:
              Pulumi&rsquo;s Route53, Cloudflare, and Vercel DNS resources; the
              CDK email construct; the CLI&rsquo;s Route53 preview and both
              create paths, its Cloudflare and Vercel paths, and its manual
              record builder; the CLI&rsquo;s success and status output; the
              console&rsquo;s copy-to-clipboard button; the CLI README; and the
              domain verification and Vercel setup guides in the docs. If Wraps
              tells you a DMARC record to publish, it is the DMARCbis one.
            </p>

            <h3 className="mt-8 mb-3 font-semibold text-xl">
              Why <code>np=reject</code> is safe as a default here
            </h3>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Defaulting a customer&rsquo;s domain to a reject policy deserves
              an argument, so here it is.{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">np</code> only
              applies to subdomains that return NXDOMAIN. Wraps&rsquo; MAIL FROM
              subdomain always carries MX and SPF records &mdash; that is how
              Wraps provisions it &mdash; and per Appendix A.4, any RR at a name
              makes that name exist. The subdomain Wraps sends from is
              therefore, by construction, not a name <code>np</code> can reach.{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">np=reject</code>{" "}
              cannot block Wraps sending.
            </p>

            <div className="rounded-lg border-destructive border-l-4 bg-destructive/10 p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium">
                    It is still a behavior change on your domain.
                  </p>
                  <p className="mt-2 text-foreground/80 leading-relaxed">
                    The safety argument covers the subdomain Wraps provisions.
                    It does not cover yours. If some system sends as a name that
                    exists only in a spreadsheet, or as a name that started
                    returning NXDOMAIN when someone pruned a CNAME last year,{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      np=reject
                    </code>{" "}
                    will start rejecting it. That is the tag working correctly.
                    It is also mail that used to be delivered. Read your
                    aggregate reports before you assume the answer.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* How to see it */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">
              How to see it on your own domain
            </h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              The standalone CLI is unscoped on npm and needs no account:
            </p>

            <CodeBlock
              code={`# full deliverability audit
npx mail-audit example.com

# the DMARCbis fields live here
npx mail-audit example.com --json

# same checks, via the Wraps CLI
wraps email check example.com`}
              lang="bash"
              title="terminal"
            />

            <p className="mt-4 mb-4 text-foreground/80 text-lg leading-relaxed">
              That{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">--json</code> is
              not optional advice. The human-readable output of both CLIs prints
              policy, reporting, and alignment, and stops there:
            </p>

            <CodeBlock
              code={`  ✓ DMARC            v=DMARC1; p=reject; rua=mailto:postmaster@mail.wraps.dev
                     Policy: reject • Reporting: enabled • Alignment: relaxed`}
              lang="text"
              title="terminal output"
            />

            <p className="mt-4 mb-4 text-foreground/80 text-lg leading-relaxed">
              No <code>np</code>, no <code>t</code>, no <code>psd</code>. The
              DMARCbis deductions are all one or two points and the ISSUES
              section only renders deductions of five or more, so they do not
              appear there either. The pretty output has not caught up with the
              parser yet. The structured output has:
            </p>

            <CodeBlock
              code={`{
  "nonExistentSubdomainPolicy": null,
  "testing": false,
  "psd": null,
  "warnings": [
    "No np= set — add np=reject to block spoofing from non-existent subdomains (DMARCbis)"
  ]
}`}
              lang="json"
              title="mail-audit --json, dmarc section"
            />

            <p className="mt-4 mb-4 text-foreground/80 text-lg leading-relaxed">
              The same fields come back from the public checker API, which needs
              no auth and is rate-limited by IP:
            </p>

            <CodeBlock
              code={"curl https://api.wraps.dev/tools/email-check/example.com"}
              lang="bash"
              title="terminal"
            />

            <p className="mt-4 mb-4 text-foreground/80 text-lg leading-relaxed">
              Or skip the install entirely and use the{" "}
              <a
                className="text-brand underline underline-offset-4 hover:text-brand"
                href="/tools"
              >
                checker on the site
              </a>
              , where the DMARC panel now has a{" "}
              <span className="font-medium">Non-Existent Subdomains</span> tile
              in the slot the old <code>pct=</code> tile used to occupy. When{" "}
              <code>np</code> is absent it renders{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">np=inherit</code>
              , which is the honest description of what happens.
            </p>

            <Card className="p-6">
              <p className="text-foreground/80 leading-relaxed">
                Run it against{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">
                  wraps.dev
                </code>{" "}
                and our own checker flags us. Our record is{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">
                  v=DMARC1; p=reject; rua=mailto:postmaster@mail.wraps.dev
                </code>{" "}
                &mdash; no <code>sp=</code>, no <code>np=</code>. The generator
                change applies to records Wraps creates going forward; it does
                not reach back and rewrite records that already exist, including
                ours.
              </p>
            </Card>
          </section>

          {/* Gaps */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">
              What &ldquo;DMARCbis-aware&rdquo; does not mean
            </h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Being explicit about the surface area, because &ldquo;RFC 9989
              support&rdquo; is going to appear on a lot of marketing pages this
              year and most of it will mean less than this does:
            </p>

            <div className="space-y-4">
              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">There is no tree walk</h3>
                <p className="text-foreground/80 leading-relaxed">
                  The record lookup does exactly one query &mdash;{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    _dmarc.&lt;domain&gt;
                  </code>{" "}
                  &mdash; and returns the first TXT record starting with{" "}
                  <code>v=DMARC1</code>. No parent walk, no eight-label cap, no
                  Organizational Domain discovery. If you check a subdomain that
                  inherits its policy from a parent, Wraps will tell you there
                  is no DMARC record. That is the largest gap on this list.
                </p>
              </div>

              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">
                  <code>psd=</code> is parsed and then ignored
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  The value is validated and reported. It steers nothing,
                  because there is no Organizational Domain selection for it to
                  steer.
                </p>
              </div>

              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">
                  Duplicate records are not discarded
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  Section 4.10 says multiple DMARC Policy Records at one name
                  are all discarded. Wraps takes the first match and moves on.
                  If you have two <code>_dmarc</code> TXT records, a conforming
                  receiver sees no policy and Wraps sees your first one. Wraps
                  is more optimistic than the standard here, and the standard is
                  right.
                </p>
              </div>

              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">
                  A record with no <code>p=</code> is reported as invalid
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  As covered above, RFC 9989 &sect;4.10.1 says{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    v=DMARC1; rua=mailto:x@example.com
                  </code>{" "}
                  MUST be treated as <code>p=none</code>. Wraps still treats a
                  missing <code>p</code> as a hard parse error. That is a
                  conformance bug on our side, not a finding about your domain.
                </p>
              </div>

              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">
                  <code>rf=</code> and <code>ri=</code> get no deprecation
                  warning
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  Both are <code>historic</code> in the IANA registry. Both are
                  still parsed as live tags with no notice. The treatment{" "}
                  <code>pct</code> got was not extended to them.
                </p>
              </div>

              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">
                  <code>t=y</code> is described loosely
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  Our warning says receivers will not enforce the policy.
                  Section 4.7 says they apply it one level down. Directionally
                  right, technically wrong, and on the list to fix.
                </p>
              </div>

              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">
                  It never evaluates a message
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  This is a DNS record auditor, not a mail receiver. Identifier
                  alignment, the second use of the tree walk, is not something
                  it does or could do &mdash; there is no message in scope.
                  Everything above is about what you published, not about what
                  happens to mail.
                </p>
              </div>
            </div>

            <p className="mt-6 text-foreground/80 text-lg leading-relaxed">
              One more limit worth naming, on the standard rather than on us: we
              have not verified which mailbox providers honor <code>np=</code>,{" "}
              <code>t=</code>, or the tree walk today, and RFC 9989 does not
              tell you. Publishing the tags is correct because the standard
              defines them. Assuming a specific receiver acts on them is a
              different claim, and not one we are making.
            </p>
          </section>

          {/* Sources */}
          <section>
            <h2 className="mb-4 font-bold text-2xl">Sources</h2>
            <Card className="p-6">
              <ul className="space-y-3 text-foreground/80 leading-relaxed">
                <li>
                  <a
                    className="text-brand underline underline-offset-4 hover:text-brand"
                    href="https://www.rfc-editor.org/rfc/rfc9989.txt"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    RFC 9989
                  </a>{" "}
                  &mdash; Domain-Based Message Authentication, Reporting, and
                  Conformance (DMARC), May 2026. Standards Track. Obsoletes
                  7489, 9091. Every section cited above.
                </li>
                <li>
                  <a
                    className="text-brand underline underline-offset-4 hover:text-brand"
                    href="https://www.rfc-editor.org/rfc/rfc9990.txt"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    RFC 9990
                  </a>{" "}
                  &mdash; DMARC Aggregate Reporting, May 2026.
                </li>
                <li>
                  <a
                    className="text-brand underline underline-offset-4 hover:text-brand"
                    href="https://www.rfc-editor.org/rfc/rfc9991.txt"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    RFC 9991
                  </a>{" "}
                  &mdash; DMARC Failure Reporting, May 2026.
                </li>
                <li>
                  <a
                    className="text-brand underline underline-offset-4 hover:text-brand"
                    href="https://datatracker.ietf.org/doc/draft-ietf-dmarc-dmarcbis/"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    draft-ietf-dmarc-dmarcbis
                  </a>{" "}
                  &mdash; IETF Datatracker history. Final revision 41; status
                  &ldquo;RFC - Proposed Standard (May 2026)&rdquo;.
                </li>
              </ul>
            </Card>
          </section>

          {/* Continue reading */}
          <section className="space-y-4">
            <h2 className="font-bold text-2xl">Continue reading</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <a
                className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
                href="/blog/your-dmarc-policy-is-useless"
              >
                <h3 className="font-semibold group-hover:text-primary">
                  Your DMARC Policy Is Useless
                </h3>
                <p className="text-muted-foreground text-sm">
                  Why <code>p=none</code> is not protection, and the four-step
                  ramp to enforcement
                </p>
              </a>
              <a
                className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
                href="/blog/spf-guide"
              >
                <h3 className="font-semibold group-hover:text-primary">
                  The SPF Guide
                </h3>
                <p className="text-muted-foreground text-sm">
                  The other half of DMARC alignment, lookup limits and all
                </p>
              </a>
              <a
                className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
                href="/docs/guides/domain-verification"
              >
                <h3 className="font-semibold group-hover:text-primary">
                  Domain Verification
                </h3>
                <p className="text-muted-foreground text-sm">
                  Every DNS record Wraps creates, including the new DMARC one
                </p>
              </a>
              <a
                className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
                href="/tools"
              >
                <h3 className="font-semibold group-hover:text-primary">
                  Email Deliverability Checker
                </h3>
                <p className="text-muted-foreground text-sm">
                  SPF, DKIM, and DMARC for any domain. No account needed
                </p>
              </a>
            </div>
          </section>

          {/* CTA */}
          <section className="relative">
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-brand/10 to-warning/10 blur-xl" />
            <Card className="relative p-8 text-center md:p-12">
              <h2 className="mb-4 font-bold text-3xl md:text-4xl">
                Check your record against RFC 9989
              </h2>
              <p className="mx-auto mb-8 max-w-lg text-muted-foreground">
                One command, no account, no data kept. It will tell you whether
                you are still shipping a <code>pct=</code> you think is doing
                something.
              </p>
              <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                <div className="rounded-xl border bg-muted/30 px-6 py-3 font-mono text-brand">
                  npx mail-audit example.com --json
                </div>
                <a
                  className="flex items-center gap-2 rounded-xl bg-brand px-6 py-3 font-semibold text-white transition-colors hover:bg-brand"
                  href="/tools"
                >
                  Run It in the Browser
                  <ChevronRight size={18} />
                </a>
              </div>
            </Card>
          </section>
        </main>

        <LandingFooter />
      </div>
    </>
  );
}
