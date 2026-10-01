import { Card } from "@wraps/ui/components/ui/card";
import {
  AlertTriangle,
  Bot,
  ChevronRight,
  FileText,
  Link2,
  Terminal,
} from "lucide-react";
import type { Metadata } from "next";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { JsonLd } from "@/components/json-ld";
import { CodeBlock } from "./page-content";

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Making Our Docs Agent-Readable",
  description:
    "Per-page markdown over content negotiation, well-known discovery documents, an in-browser tool surface, and AI crawl signals. What we shipped, what it does not do, and which of it is actually a standard.",
  datePublished: "2026-05-21T00:00:00.000Z",
  dateModified: "2026-10-01T00:00:00.000Z",
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
    "@id": "https://wraps.dev/blog/agent-readable-docs",
  },
};

export const metadata: Metadata = {
  title: "Making Our Docs Agent-Readable",
  description:
    "Per-page markdown over content negotiation, well-known discovery documents, an in-browser tool surface, and AI crawl signals. What we shipped, what it does not do, and which of it is actually a standard.",
  openGraph: {
    title: "Making Our Docs Agent-Readable | Wraps",
    description:
      "Ask wraps.dev for text/markdown and you get the page, not the HTML. Here is how it works and what it does not do.",
    type: "article",
    url: "https://wraps.dev/blog/agent-readable-docs",
    publishedTime: "2026-05-21T00:00:00.000Z",
    authors: ["Wraps Team"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Making Our Docs Agent-Readable | Wraps",
    description:
      "Ask wraps.dev for text/markdown and you get the page, not the HTML. Here is how it works and what it does not do.",
  },
  alternates: {
    canonical: "https://wraps.dev/blog/agent-readable-docs",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={articleSchema} />
      <div className="min-h-screen bg-background text-foreground">
        <LandingNavbar />

        {/* Hero */}
        <header className="relative overflow-hidden">
          <div className="absolute inset-0 bg-radial-top from-brand/20 via-transparent to-transparent" />
          <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=%2260%22 height=%2260%22 viewBox=%220 0 60 60%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cg fill=%22none%22 fill-rule=%22evenodd%22%3E%3Cg fill=%22%239C92AC%22 fill-opacity=%220.03%22%3E%3Cpath d=%22M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-50" />

          <div className="relative mx-auto max-w-4xl px-6 pt-20 pb-16">
            <div className="mb-4 flex items-center gap-2 font-medium text-brand text-sm">
              <Bot size={16} />
              <span>Engineering</span>
              <span className="text-muted-foreground/50">&bull;</span>
              <span className="text-muted-foreground">11 min read</span>
              <span className="text-muted-foreground/50">&bull;</span>
              <span className="text-muted-foreground">Wraps Team</span>
              <span className="text-muted-foreground/50">&bull;</span>
              <span className="text-muted-foreground">May 21, 2026</span>
            </div>

            <h1 className="mb-6 font-bold text-4xl leading-tight md:text-5xl lg:text-6xl">
              Making Our Docs
              <span className="block bg-gradient-to-r from-brand to-warning bg-clip-text text-transparent dark:to-warning">
                Agent-Readable
              </span>
            </h1>

            <p className="max-w-2xl text-muted-foreground text-xl leading-relaxed">
              Send{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-base">
                Accept: text/markdown
              </code>{" "}
              to any page on wraps.dev and you get that page as markdown. Here
              is how it works, what else shipped with it, and the parts that are
              still a bet.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <div className="flex items-center gap-2 rounded-full border bg-muted/30 px-4 py-2">
                <FileText className="text-brand" size={16} />
                <span className="text-foreground/80 text-sm">
                  Per-page markdown for 11 pages
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-full border bg-muted/30 px-4 py-2">
                <Link2 className="text-brand" size={16} />
                <span className="text-foreground/80 text-sm">
                  RFC 9727 api-catalog
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-full border bg-muted/30 px-4 py-2">
                <Bot className="text-brand" size={16} />
                <span className="text-foreground/80 text-sm">
                  Content-Signal: ai-train=no
                </span>
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-4xl space-y-16 px-6 py-16">
          {/* Problem */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">
              What an agent actually gets from a docs page
            </h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Someone points an agent at{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                wraps.dev/docs/quickstart/email
              </code>{" "}
              and asks it to send an email. The agent fetches the URL and gets
              back a Next.js document: a nav tree, a sidebar, a footer, a
              command palette, three hydration payloads, and&mdash;somewhere in
              there&mdash;four commands it actually needed. The signal is
              present. It is just buried in markup that exists for human eyes
              and a mouse.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              We already had a partial answer. A{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">llms.txt</code>{" "}
              and a{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                llms-full.txt
              </code>{" "}
              have been live on wraps.dev since February, following the
              community convention of the same name. The first is a 185-line
              index of what Wraps is and where things live. The second is the
              whole corpus in one 920-line file, and{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">llms.txt</code>{" "}
              tells agents to fetch it once instead of crawling.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              That is the right shape for one job: an agent that wants to learn
              the product from scratch. It is the wrong shape for the far more
              common one. An agent that landed on a single deep link does not
              want 920 lines to scan. It wants that page. Today we shipped the
              layer that gives it that page&mdash;plus the discovery documents
              that let a machine find any of it without parsing HTML at all.
            </p>
          </section>

          {/* Content negotiation */}
          <section>
            <h2 className="mb-6 flex items-center gap-3 font-bold text-3xl">
              <FileText className="text-brand" />
              Ask for markdown, get markdown
            </h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              There is no new URL scheme here, no{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">.md</code> suffix
              to remember, no separate agent subdomain. The URL an agent already
              has is the URL that works. It just has to say what it wants in the{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">Accept</code>{" "}
              header, which is what content negotiation has been for since
              HTTP/1.1.
            </p>

            <CodeBlock
              code={`$ curl -H "Accept: text/markdown" https://wraps.dev/docs/quickstart/email

HTTP/2 200
content-type: text/markdown; charset=utf-8
vary: Accept
cache-control: public, max-age=3600

# Email Quickstart

Deploy production-ready email infrastructure to your AWS account in under 2 minutes.

## What You'll Build

- AWS SES with DKIM, SPF, and DMARC configured automatically
- A verified sending domain in your AWS account
- Your first email sent via the TypeScript SDK`}
              title="terminal"
            />

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              The same URL with a browser&apos;s default{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">Accept</code>{" "}
              returns the full HTML page, unchanged. Nothing about the human
              experience moved.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              The whole mechanism is a middleware that inspects one header and
              rewrites:
            </p>

            <CodeBlock
              code={`export async function middleware(request: NextRequest) {
  const accept = request.headers.get("accept") ?? "";
  if (!accept.includes("text/markdown")) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  // Route the request to /api/md/<path> so dynamic route params carry the page path
  const mdPath = pathname === "/" ? "/api/md/root" : \`/api/md\${pathname}\`;
  const mdUrl = new URL(mdPath, request.nextUrl.origin);

  return NextResponse.rewrite(mdUrl);
}`}
              lang="typescript"
              title="src/middleware.ts"
            />

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              A rewrite, not a redirect. The agent&apos;s URL bar&mdash;or
              whatever an agent has instead of one&mdash;never changes, and it
              gets a 200 on the URL it asked for. On the other end is a
              catch-all route handler that does the lookup:
            </p>

            <CodeBlock
              code={`const MD_HEADERS = {
  "Content-Type": "text/markdown; charset=utf-8",
  Vary: "Accept",
  "Cache-Control": "public, max-age=3600",
} as const;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  // "root" is a sentinel for "/" since Next.js dynamic routes can't match empty segments
  const pagePath =
    path[0] === "root" && path.length === 1 ? "/" : \`/\${path.join("/")}\`;
  const content = AGENT_CONTENT[pagePath] ?? getLlmsFallback();

  return new NextResponse(content, { headers: MD_HEADERS });
}`}
              lang="typescript"
              title="src/app/api/md/[...path]/route.ts"
            />

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Two details worth calling out.{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                Vary: Accept
              </code>{" "}
              is not optional&mdash;without it, any cache between us and the
              agent is free to hand the markdown body to the next browser that
              asks for the same URL. And{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">root</code> is a
              sentinel, because a Next.js catch-all segment cannot match the
              empty path that{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">/</code>{" "}
              produces. Unknown paths fall through to{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">llms.txt</code>{" "}
              read off disk, and if even that read fails, to the homepage entry.
              An agent asking for a page we have not written markdown for still
              gets something oriented rather than an error.
            </p>
          </section>

          {/* The first cut */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">
              The first cut returned the site index
            </h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              That is the second version. The first one shipped a few hours
              earlier the same morning and was wrong in an instructive way:
            </p>

            <CodeBlock
              code={`// Serve llms.txt as markdown for any page request from an AI agent
const llmsUrl = new URL("/llms.txt", request.nextUrl.origin);
const res = await fetch(llmsUrl, { next: { revalidate: 3600 } });

if (!res.ok) {
  return NextResponse.next();
}

const body = await res.text();

return new NextResponse(body, {
  headers: {
    "Content-Type": "text/markdown; charset=utf-8",
    Vary: "Accept",
    "Cache-Control": "public, max-age=3600",
  },
});`}
              lang="typescript"
              title="src/middleware.ts (first version)"
            />

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Content negotiation: correct. Headers: correct. Behavior: an agent
              that asked for{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                /docs/guides/webhooks
              </code>{" "}
              got the site index. Every page returned the same body. We had
              built the plumbing for per-page markdown and then piped every page
              to the one file we already had.
            </p>

            <Card className="p-6">
              <p className="text-foreground/80 leading-relaxed">
                It is a tidy illustration of the whole problem. Serving markdown
                is the easy half. Serving <em>the right</em> markdown means
                someone has to have written a page-scoped document for that
                route, and no header trick creates one.
              </p>
            </Card>
          </section>

          {/* Eleven pages */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">
              Eleven pages, written by hand
            </h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              The corpus behind{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">/api/md</code> is
              deliberately unclever. It is one exported object:
            </p>

            <CodeBlock
              code={`export const AGENT_CONTENT: Record<string, string> = {
  "/": \`# Wraps
  ...\`,
  "/docs/quickstart/email": \`# Email Quickstart
  ...\`,
};`}
              lang="typescript"
              title="src/lib/agent-content.ts"
            />

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Route path in, markdown string out. No build step, no MDX, no
              renderer that walks the TSX pages and tries to reconstruct prose
              from JSX. Our docs are React components&mdash;there is no MDX
              pipeline on this site&mdash;so there is no source of truth to
              extract from. That means this is a hand-maintained parallel
              corpus, with everything that implies. It is the honest description
              and the obvious cost.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Eleven routes have hand-written markdown today, chosen because
              they are what an agent doing real work actually lands on:
            </p>

            <div className="mb-4 grid gap-2 sm:grid-cols-2">
              {[
                "/",
                "/docs/quickstart/email",
                "/docs/quickstart/email/agents",
                "/docs/quickstart/email/nextjs",
                "/docs/quickstart/sms",
                "/docs/quickstart/platform",
                "/docs/sdk-reference",
                "/docs/cli-reference",
                "/docs/cli-reference/email",
                "/docs/guides/domain-verification",
                "/docs/guides/webhooks",
              ].map((route) => (
                <div className="rounded-lg border px-4 py-2" key={route}>
                  <code className="text-sm">{route}</code>
                </div>
              ))}
            </div>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Eleven, out of a site with more than a hundred and fifty page
              routes. Everything else still resolves&mdash;to{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">llms.txt</code>,
              via the fallback&mdash;but it is not page-scoped, and pretending
              otherwise would be the kind of claim that costs you a reader the
              first time they check.
            </p>
          </section>

          {/* Discovery */}
          <section>
            <h2 className="mb-6 flex items-center gap-3 font-bold text-3xl">
              <Link2 className="text-brand" />
              How a machine finds any of this
            </h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Markdown that nobody knows about is not discoverable, it is just
              polite. The rest of this ship is three documents whose entire job
              is to be found by something that has never seen wraps.dev before
              and cannot read a nav bar.
            </p>

            <h3 className="mt-8 mb-3 font-semibold text-xl">
              A Link header on the homepage
            </h3>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              RFC 8288 &mdash; Web Linking &mdash; lets a response advertise
              related resources in headers, no body parsing required. Fetch the
              homepage and the answer is in the response head:
            </p>

            <CodeBlock
              code={`$ curl -D- https://wraps.dev/

link: </docs>; rel="service-doc", </.well-known/api-catalog>; rel="api-catalog"`}
              title="terminal"
            />

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Two IANA-registered relation types.{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                service-doc
              </code>{" "}
              is documentation intended for humans;{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                service-desc
              </code>{" "}
              is its machine-readable sibling, and the distinction matters in a
              moment. This header is configured on{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                source: &quot;/&quot;
              </code>{" "}
              in{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                next.config.ts
              </code>
              , which means it is on the homepage and only the homepage. Not
              every page advertises. A crawler that starts at the root finds it;
              one that starts at a deep link does not.
            </p>

            <h3 className="mt-8 mb-3 font-semibold text-xl">
              An API catalog at a well-known URI
            </h3>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              RFC 9727 defines{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                /.well-known/api-catalog
              </code>{" "}
              as the place to publish what APIs an organization has and where
              their descriptions live. It went to Proposed Standard in June
              2025, and it requires the{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                application/linkset+json
              </code>{" "}
              media type from RFC 9264. Ours is a static route handler:
            </p>

            <CodeBlock
              code={`export function GET() {
  const catalog = {
    linkset: [
      {
        anchor: "https://api.wraps.dev",
        "service-desc": [
          {
            href: "https://api.wraps.dev/swagger/json",
            type: "application/openapi+json",
          },
        ],
        "service-doc": [{ href: "https://wraps.dev/docs" }],
        status: [{ href: "https://api.wraps.dev/health" }],
      },
    ],
  };

  return Response.json(catalog, {
    headers: { "Content-Type": "application/linkset+json" },
  });
}`}
              lang="typescript"
              title="src/app/.well-known/api-catalog/route.ts"
            />

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Three links, three audiences. A machine that wants to call the API
              follows{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                service-desc
              </code>{" "}
              to the OpenAPI document and can generate a client from it. A model
              that wants to explain the API to a human follows{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                service-doc
              </code>{" "}
              to the docs. Anything that wants to know whether we are up follows{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">status</code> to
              the health endpoint. The{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">anchor</code> is{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                api.wraps.dev
              </code>{" "}
              while the document is served from the marketing origin, which is
              exactly the split RFC 9727 is designed for: the catalog describes
              the API, it does not have to live on it.
            </p>

            <h3 className="mt-8 mb-3 font-semibold text-xl">
              OAuth metadata, so a client can configure itself
            </h3>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              A CLI has no browser. An agent has no safe place to hold a
              password. Both need to authenticate anyway, and the answer since
              2019 has been the OAuth 2.0 Device Authorization Grant (RFC 8628):
              the client asks for a short user code, prints it, a human approves
              it in a browser on any device, and the client polls until a token
              comes back. No secret is ever typed into the client or stored by
              it.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              What we added is the part that makes it self-configuring. Instead
              of a client hardcoding our endpoints, it fetches one document and
              learns them:
            </p>

            <CodeBlock
              code={`export function GET() {
  const metadata = {
    issuer: "https://api.wraps.dev",
    device_authorization_endpoint:
      "https://app.wraps.dev/api/auth/device/code",
    token_endpoint: "https://app.wraps.dev/api/auth/device/token",
    grant_types_supported: [
      "urn:ietf:params:oauth:grant-type:device_code",
    ],
    token_endpoint_auth_methods_supported: ["none"],
    service_documentation: "https://wraps.dev/docs",
  };

  return Response.json(metadata);
}`}
              lang="typescript"
              title="src/app/.well-known/oauth-authorization-server/route.ts"
            />

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Four facts in one fetch: the device grant is supported at all,
              where to start it, where to exchange the code, and&mdash;from{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                token_endpoint_auth_methods_supported: [&quot;none&quot;]
              </code>
              &mdash;that this is a public client with no secret to leak. The
              endpoints it advertises are real, backed by better-auth&apos;s
              device authorization plugin behind{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                app.wraps.dev
              </code>
              . The same document is served from both{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">wraps.dev</code>{" "}
              and{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                api.wraps.dev
              </code>
              , where the API copy carries an OpenAPI description and is
              explicitly marked unauthenticated&mdash;discovery has to be public
              or it is not discovery.
            </p>

            <div className="rounded-lg border-destructive border-l-4 bg-destructive/10 p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium">
                    We follow RFC 8414. We are not going to claim we are
                    compliant with it.
                  </p>
                  <p className="mt-2 text-foreground/80 leading-relaxed">
                    Two things a careful reader will catch. RFC 8414 lists{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      response_types_supported
                    </code>{" "}
                    as REQUIRED and we do not emit it&mdash;defensible for a
                    device-only server that never touches the authorization
                    endpoint, but it is a literal omission. And the spec ties
                    the metadata location to the issuer identifier, so the
                    conformant copy is the one on{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      api.wraps.dev
                    </code>
                    . The copy on{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      wraps.dev
                    </code>{" "}
                    is a convenience mirror for anything that starts at the
                    marketing origin.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* WebMCP */}
          <section>
            <h2 className="mb-6 flex items-center gap-3 font-bold text-3xl">
              <Bot className="text-brand" />
              Five tools for a browser API that does not exist yet
            </h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Everything above assumes the agent is fetching URLs. A different
              case is the agent that is already driving a browser tab, looking
              at our page the way a person would. WebMCP is a proposal for that
              case: a page calls{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                document.modelContext.registerTool()
              </code>{" "}
              once per tool and hands the browser a named function, so the agent
              can call it instead of guessing which button to click.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              wraps.dev now registers five, site-wide, from a component mounted
              in the root layout:{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                get_pricing
              </code>
              ,{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                estimate_cost
              </code>
              ,{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                get_quickstart
              </code>
              ,{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                search_docs
              </code>
              , and{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                build_spf_record
              </code>
              . The definitions live in{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                src/lib/webmcp-tools.ts
              </code>
              ; the component only registers them.
            </p>

            <CodeBlock
              code={`export function WebMCP() {
  useEffect(() => {
    const modelContext = document.modelContext;
    if (!modelContext) {
      return;
    }

    const controller = new AbortController();

    for (const tool of webMcpTools()) {
      modelContext
        .registerTool(tool, { signal: controller.signal })
        .catch(() => {
          // Registration refused by policy — the page works without it.
        });
    }

    return () => controller.abort();
  }, []);

  return null;
}`}
              lang="typescript"
              title="src/components/webmcp.tsx"
            />

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              The component renders{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">null</code>; it
              is a pure side effect. The guard at the top is the whole
              compatibility story:{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                modelContext
              </code>{" "}
              is optional on the{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">Document</code>{" "}
              type and checked at runtime, so in a browser without the API this
              code returns immediately and does nothing at all. Every
              registration shares one{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                AbortController
              </code>
              , and the effect&apos;s cleanup aborts it, which unregisters all
              five tools on unmount. A registration the browser refuses, such as
              under a Permissions-Policy that disables the tools permission, is
              caught so it does not log an error on every page.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Two of the five names promise more than the implementations
              deliver.{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                search_docs
              </code>{" "}
              does not search&mdash;it takes no query and returns the entire{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                llms-full.txt
              </code>
              .{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                get_quickstart
              </code>{" "}
              declares a{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">service</code>{" "}
              enum of email, sms, and cdn, then ignores it and returns{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">llms.txt</code>{" "}
              for every value. The other three do what they say.{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                get_pricing
              </code>{" "}
              returns{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                /pricing.md
              </code>
              .{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                estimate_cost
              </code>{" "}
              runs the same cost engine as the SES calculator, in the page, with
              no network call.{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                build_spf_record
              </code>{" "}
              uses the same builder as the SPF tool and reports the
              record&apos;s DNS lookup count against the limit of 10. Wiring{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                search_docs
              </code>{" "}
              and{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                get_quickstart
              </code>{" "}
              to the per-page markdown route is the obvious next move.
            </p>

            <Card className="p-6">
              <p className="text-foreground/80 leading-relaxed">
                <strong>Editor&apos;s note.</strong> WebMCP was proposed by
                Microsoft and Google in the W3C Web Machine Learning Community
                Group. It is a Community Group draft, not a W3C standard, and it
                is not Anthropic&apos;s Model Context Protocol&mdash;it borrows
                MCP&apos;s tool-description shape and nothing else. There is no
                server, no transport, and no handshake; it is a page handing
                objects to a browser. As of this writing it exists behind a flag
                in one browser, with no signal from Mozilla or WebKit. The code
                above follows the current draft, which puts the API on{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">document</code>
                , and a draft can still change.
              </p>
            </Card>
          </section>

          {/* robots */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">
              Saying out loud what crawlers may do
            </h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              The last piece is the one that goes the other direction. If you
              are going to make your docs easy for models to read, you should be
              specific about which uses you want.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              This cost us a file. Next.js generates{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">robots.txt</code>{" "}
              from a{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                MetadataRoute.Robots
              </code>{" "}
              export, and that API has no way to emit an arbitrary line. So the
              metadata export and the old static{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                public/robots.txt
              </code>{" "}
              both got deleted and replaced with a plain route handler that
              returns a string:
            </p>

            <CodeBlock
              code={`# Wraps - Email Infrastructure for Developers
# https://wraps.dev

# Content Signals (https://contentsignals.org/)
Content-Signal: ai-train=no, search=yes, ai-input=yes

User-agent: *
Allow: /
Disallow: /api/
Disallow: /ingest/
Disallow: /_next/

Sitemap: https://wraps.dev/sitemap.xml`}
              lang="text"
              title="robots.txt"
            />

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Three declarations, and the stance is coherent:{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                ai-train=no
              </code>{" "}
              &mdash; do not train or fine-tune on this.{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">search=yes</code>{" "}
              &mdash; index it and link to it.{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                ai-input=yes
              </code>{" "}
              &mdash; read it at answer time and ground a response in it. Docs
              exist to be read when someone has a question. That is precisely
              the use we want, and it is a different use from becoming training
              weights.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Content Signals is a Cloudflare proposal from September 2025,
              released under CC0. It is not an IETF or W3C standard, there is no
              RFC, and the IETF working group on AI preferences has not
              published one either. It is also not enforced by anything: it is a
              request, and compliance is entirely voluntary. We publish it
              because stating the preference costs one line and not stating it
              means nobody can honor it even if they want to.
            </p>
          </section>

          {/* Standards status */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">
              Which of these are actually standards
            </h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              This corner of the web is full of things that look like specs.
              Some of them are. Sorted from most settled to least:
            </p>

            <div className="space-y-3">
              {[
                {
                  name: "RFC 8288 — Web Linking",
                  status: "IETF Proposed Standard, October 2017",
                  note: "Defines the Link header and the IANA link relation registry.",
                },
                {
                  name: "RFC 8414 — OAuth 2.0 Authorization Server Metadata",
                  status: "IETF Proposed Standard, June 2018",
                  note: "The /.well-known/oauth-authorization-server document.",
                },
                {
                  name: "RFC 8628 — OAuth 2.0 Device Authorization Grant",
                  status: "IETF Proposed Standard, August 2019",
                  note: "The grant our CLI and agent clients use.",
                },
                {
                  name: "RFC 9264 — Linkset",
                  status: "IETF Proposed Standard, July 2022",
                  note: "Defines application/linkset+json.",
                },
                {
                  name: "RFC 9727 — api-catalog",
                  status: "IETF Proposed Standard, June 2025",
                  note: "The newest of these, and a real Standards Track RFC — though Proposed Standard is not the same as an Internet Standard.",
                },
                {
                  name: "RFC 8631 — Link Relation Types for Web Services",
                  status: "IETF Informational, July 2019",
                  note: "Registers service-doc and service-desc. Not Standards Track.",
                },
                {
                  name: "Content Signals",
                  status: "Cloudflare proposal, September 2025",
                  note: "No RFC, no standards body, voluntary compliance.",
                },
                {
                  name: "llms.txt",
                  status: "Community convention, September 2024",
                  note: "Not a spec. No standards body has touched it.",
                },
                {
                  name: "WebMCP",
                  status: "W3C Community Group draft",
                  note: "Proposed by Microsoft and Google. A CG draft is not on the Recommendation track.",
                },
              ].map((row) => (
                <div className="rounded-lg border p-5" key={row.name}>
                  <h3 className="mb-1 font-medium">{row.name}</h3>
                  <p className="mb-1 text-muted-foreground text-sm">
                    {row.status}
                  </p>
                  <p className="text-foreground/80 leading-relaxed">
                    {row.note}
                  </p>
                </div>
              ))}
            </div>

            <p className="mt-6 mb-4 text-foreground/80 text-lg leading-relaxed">
              The bottom half of that list is why this whole ship is best
              described as cheap insurance rather than a strategy. Five ratified
              RFCs and four bets.
            </p>
          </section>

          {/* Not in v1 */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">
              What this doesn&apos;t do
            </h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Being explicit about the surface area:
            </p>

            <div className="space-y-4">
              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">
                  We have no idea whether anything reads it
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  There is no telemetry on the markdown route, the well-known
                  documents, or the WebMCP tools. Not sampled, not logged, not
                  counted. So we cannot tell you that agents found us, and we
                  are not going to imply it. Worth knowing more broadly:
                  Google&apos;s John Mueller said publicly in June 2025 that no
                  AI system he was aware of used{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    llms.txt
                  </code>
                  , and no vendor has since confirmed consuming a third
                  party&apos;s. Publishing these files is a low-cost bet, not a
                  demonstrated channel.
                </p>
              </div>

              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">
                  The markdown is a parallel corpus and it will drift
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    AGENT_CONTENT
                  </code>{" "}
                  is not generated from the docs pages and nothing keeps the two
                  in sync. Change a CLI flag in the TSX and the markdown keeps
                  serving the old one until a human notices. Eleven documents is
                  a maintainable number; a hundred would not be, and getting
                  past that means generating them rather than writing them.
                </p>
              </div>

              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">
                  The WebMCP tools are a no-op for essentially every visitor
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  The API exists behind a flag in one browser. The feature guard
                  means the overwhelming majority of page loads run a single
                  feature check and return. We shipped it because the cost is a
                  few kilobytes and an unmount handler, not because anyone is
                  calling these tools today.
                </p>
              </div>

              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">
                  Discovery is homepage-first and static
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  The Link header is on{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">/</code>{" "}
                  only, so a client that arrives at a deep link has to know to
                  look at{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    /.well-known/
                  </code>{" "}
                  on its own. Both well-known documents are hand-written static
                  responses with hardcoded URLs&mdash;change an endpoint and you
                  change it in two places. Neither is generated from the API it
                  describes.
                </p>
              </div>

              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">
                  Content Signals is a preference, not a control
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    ai-train=no
                  </code>{" "}
                  stops nothing. It is a stated preference in a text file that a
                  crawler may read and may honor. If you need enforcement, you
                  need auth or a WAF, not a directive.
                </p>
              </div>
            </div>
          </section>

          {/* Try it */}
          <section>
            <h2 className="mb-6 flex items-center gap-3 font-bold text-3xl">
              <Terminal className="text-brand" />
              Try it
            </h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Everything here is public and unauthenticated. Nothing to install.
            </p>

            <CodeBlock
              code={`# a page as markdown instead of HTML
curl -H "Accept: text/markdown" https://wraps.dev/docs/quickstart/email

# the same for the agent quickstart
curl -H "Accept: text/markdown" https://wraps.dev/docs/quickstart/email/agents

# what links the homepage advertises
curl -sD- -o /dev/null https://wraps.dev/ | grep -i '^link:'

# the API catalog and the OAuth metadata
curl https://wraps.dev/.well-known/api-catalog
curl https://api.wraps.dev/.well-known/oauth-authorization-server`}
              title="terminal"
            />

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              If you run a docs site, the middleware in this post is about
              fifteen lines and the hard part is the writing. That ratio is the
              whole point.
            </p>
          </section>

          {/* Continue reading */}
          <section className="space-y-4">
            <h2 className="font-bold text-2xl">Continue reading</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <a
                className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
                href="/docs/quickstart/email/agents"
              >
                <h3 className="font-semibold group-hover:text-primary">
                  Send Email from Your Agent
                </h3>
                <p className="text-muted-foreground text-sm">
                  The quickstart written for agents, also served as markdown
                </p>
              </a>
              <a
                className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
                href="/docs/cli-reference"
              >
                <h3 className="font-semibold group-hover:text-primary">
                  CLI Reference
                </h3>
                <p className="text-muted-foreground text-sm">
                  Every command, and one of the eleven markdown documents
                </p>
              </a>
              <a
                className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
                href="/docs/guides/webhooks"
              >
                <h3 className="font-semibold group-hover:text-primary">
                  Webhooks Guide
                </h3>
                <p className="text-muted-foreground text-sm">
                  Delivery, bounce, and complaint events from EventBridge
                </p>
              </a>
              <a
                className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
                href="/blog/signed-reply-threading"
              >
                <h3 className="font-semibold group-hover:text-primary">
                  Signed Reply-To for Agents
                </h3>
                <p className="text-muted-foreground text-sm">
                  Cryptographic conversation correlation for email agents
                </p>
              </a>
            </div>
          </section>

          {/* CTA */}
          <section className="relative">
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-brand/10 to-warning/10 blur-xl" />
            <Card className="relative p-8 text-center md:p-12">
              <h2 className="mb-4 font-bold text-3xl md:text-4xl">
                Read the docs the way an agent does
              </h2>
              <p className="mx-auto mb-8 max-w-lg text-muted-foreground">
                One header, no new URLs, no SDK. The same page you would read,
                without the markup you would not.
              </p>
              <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                <div className="rounded-xl border bg-muted/30 px-6 py-3 font-mono text-brand text-sm">
                  curl -H &quot;Accept: text/markdown&quot;
                  wraps.dev/docs/quickstart/email
                </div>
                <a
                  className="flex items-center gap-2 rounded-xl bg-brand px-6 py-3 font-semibold text-white transition-colors hover:bg-brand"
                  href="/docs/quickstart/email/agents"
                >
                  Agent Quickstart
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
