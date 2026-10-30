import { DotPattern } from "@wraps/ui/components/dot-pattern";
import { Badge } from "@wraps/ui/components/ui/badge";
import { Button } from "@wraps/ui/components/ui/button";
import { ArrowRight, BookOpen } from "lucide-react";
import Link from "next/link";

const tools = [
  {
    name: "list_recent_sends",
    description: "Recent sends from your email history",
    write: false,
  },
  {
    name: "get_email_event_log",
    description: "Full delivery timeline for a message",
    write: false,
  },
  {
    name: "verify_domain_status",
    description: "DKIM + verification status of a domain",
    write: false,
  },
  {
    name: "list_suppressions",
    description: "Bounce and complaint suppression list",
    write: false,
  },
  {
    name: "estimate_cost",
    description: "Real Wraps + AWS cost for a volume",
    write: false,
  },
  {
    name: "send_email",
    description: "Send via your SES account, once write is on",
    write: true,
  },
  {
    name: "check_send_status",
    description: "Poll a send awaiting approval (enforced mode)",
    write: false,
  },
];

export function McpHeroSection() {
  return (
    <section className="relative overflow-hidden bg-linear-to-b from-background to-background/80 pt-20 pb-16 sm:pt-28">
      <div className="absolute inset-0">
        <DotPattern className="opacity-100" fadeStyle="ellipse" size="md" />
      </div>

      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-14">
          {/* Left column — mono-forward copy */}
          <div>
            <div className="mb-5 inline-flex items-center gap-2 font-mono text-2xs text-muted-foreground uppercase tracking-eyebrow">
              <span className="size-1.5 rounded-full bg-brand" />
              <span>wraps · mcp server</span>
            </div>

            <h1 className="mb-6 text-pretty font-heading font-semibold text-4xl leading-tight tracking-tight sm:text-5xl">
              The MCP server for email{" "}
              <span className="text-brand-text">your agent owns.</span>
            </h1>

            {/* Mono anchor: the install command IS the marketing */}
            <pre className="mb-6 overflow-x-auto rounded-lg border border-border bg-card/60 px-4 py-3 font-mono text-sm leading-relaxed text-foreground/90">
              <span className="text-muted-foreground">$</span> npx -y{" "}
              <span className="text-brand-text">@wraps.dev/mcp</span>
            </pre>

            <p className="mb-6 max-w-md text-muted-foreground">
              Six tools over the AWS SES stack in your account — seven in
              enforced mode — covering send history, delivery events, domain
              status, suppressions, and guarded sending. Runs locally over
              stdio; your credentials never leave your machine.
            </p>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" variant="brand">
                <Link href="/docs/mcp-reference">
                  Read the MCP docs
                  <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a
                  href="https://www.npmjs.com/package/@wraps.dev/mcp"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <BookOpen className="size-4" />
                  View on npm
                </a>
              </Button>
            </div>
          </div>

          {/* Right column — the tool surface */}
          <div className="relative">
            <div className="absolute -inset-4 rounded-3xl bg-brand/10 opacity-60 blur-2xl" />
            <div className="relative overflow-hidden rounded-xl border border-border bg-card/80 shadow-sm backdrop-blur">
              <div className="flex items-center gap-2 border-border border-b px-4 py-2.5">
                <span className="size-1.5 rounded-full bg-brand" />
                <span className="font-mono text-muted-foreground text-xs">
                  wraps · 6 tools · 7 in enforced mode
                </span>
              </div>
              <ul className="divide-y divide-border">
                {tools.map((tool) => (
                  <li
                    className="flex items-center justify-between gap-3 px-4 py-3"
                    key={tool.name}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm text-foreground/90">
                        {tool.name}
                      </p>
                      <p className="truncate text-muted-foreground text-xs">
                        {tool.description}
                      </p>
                    </div>
                    <Badge
                      className="shrink-0"
                      variant={tool.write ? "brand" : "outline"}
                    >
                      {tool.write ? "write" : "read"}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
