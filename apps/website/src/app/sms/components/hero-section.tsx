import { DotPattern } from "@wraps/ui/components/dot-pattern";
import { Button } from "@wraps/ui/components/ui/button";
import { BookOpen } from "lucide-react";
import Link from "next/link";

export function SmsHeroSection() {
  return (
    <section className="relative overflow-hidden bg-linear-to-b from-background to-background/80 pt-20 pb-16 sm:pt-28">
      {/* Background Pattern */}
      <div className="absolute inset-0">
        <DotPattern className="opacity-100" fadeStyle="ellipse" size="md" />
      </div>

      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-14">
          {/* Left column — copy */}
          <div>
            {/* Mono tag, no marketing badge */}
            <div className="mb-5 inline-flex items-center gap-2 font-mono text-2xs text-muted-foreground uppercase tracking-eyebrow">
              <span className="size-1.5 rounded-full bg-brand" />
              <span>wraps · sms</span>
            </div>

            {/* Main Headline */}
            <h1 className="mb-6 text-pretty font-heading font-semibold text-4xl leading-tight tracking-tight sm:text-5xl">
              AWS SMS, <span className="text-brand-text">simplified.</span>
            </h1>

            {/* Subheading */}
            <p className="mb-8 max-w-md text-lg text-muted-foreground">
              Deploy self-hosted SMS infrastructure to your AWS account.
              Toll-free first, TypeScript SDK, zero vendor lock-in.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="lg" variant="brand">
                <Link href="/docs/quickstart/sms">Get Started</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/docs/cli-reference/sms">
                  <BookOpen aria-hidden="true" className="me-2 size-4" />
                  CLI Reference
                </Link>
              </Button>
            </div>
          </div>

          {/* Right column — code preview */}
          <div className="w-full lg:justify-self-end">
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              {/* Code header */}
              <div className="flex items-center gap-2 border-border border-b px-4 py-3">
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full bg-brand"
                />
                <span className="font-mono text-2xs text-muted-foreground uppercase tracking-eyebrow">
                  index.ts
                </span>
              </div>
              {/* Code content */}
              <pre className="overflow-x-auto p-5 text-left font-mono text-sm text-foreground/90 leading-relaxed">
                <code>
                  <span className="text-muted-foreground">import</span>
                  {" { "}
                  <span className="text-foreground">WrapsSMS</span>
                  {" } "}
                  <span className="text-muted-foreground">from</span>{" "}
                  <span className="text-brand-text">'@wraps.dev/sms'</span>
                  {";\n\n"}
                  <span className="text-muted-foreground">const</span> sms ={" "}
                  <span className="text-muted-foreground">new</span>{" "}
                  <span className="text-foreground">WrapsSMS</span>();
                  {"\n\n"}
                  <span className="text-muted-foreground">await</span> sms.
                  <span className="text-brand-text">send</span>({"{"}
                  {"\n  "}
                  <span className="text-muted-foreground">to</span>:{" "}
                  <span className="text-foreground">'+14155551234'</span>,
                  {"\n  "}
                  <span className="text-muted-foreground">message</span>:{" "}
                  <span className="text-foreground">'Your code is 123456'</span>
                  ,{"\n"}
                  {"});"}
                </code>
              </pre>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
