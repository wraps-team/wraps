import { DotPattern } from "@wraps/ui/components/dot-pattern";
import { Button } from "@wraps/ui/components/ui/button";
import Link from "next/link";

const heroSnippet = `import { WrapsEmail } from '@wraps.dev/email';

const email = new WrapsEmail();

await email.send({
  from: 'hello@yourdomain.com',
  to: 'user@example.com',
  subject: 'Welcome to our app!',
  html: '<h1>Welcome!</h1>',
});`;

export function SdkHeroSection() {
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
              <span>wraps · typescript sdk</span>
            </div>

            <h1 className="mb-6 text-pretty font-heading font-semibold text-4xl leading-tight tracking-tight sm:text-5xl">
              Communication <span className="text-brand-text">as code.</span>
            </h1>

            <p className="mb-5 max-w-md text-muted-foreground">
              TypeScript SDKs that send through your AWS account. Define
              templates in React, automate with workflows, trigger from custom
              events.
            </p>

            <p className="mb-7 font-mono text-muted-foreground text-xs">
              @wraps.dev/email &middot; @wraps.dev/sms &middot;
              @wraps.dev/client
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="lg" variant="brand">
                <Link href="/docs/quickstart/email">Get Started</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/docs/sdk-reference">SDK Reference</Link>
              </Button>
            </div>
          </div>

          {/* Right column — the API itself, no chrome */}
          <div className="relative">
            <div className="overflow-hidden rounded-lg border border-border bg-card/60">
              <div className="flex items-center gap-2 border-border border-b px-4 py-2.5 font-mono text-2xs text-muted-foreground uppercase tracking-eyebrow">
                <span className="size-1.5 rounded-full bg-brand" />
                app/send.ts
              </div>
              <pre className="overflow-x-auto px-4 py-4 font-mono text-sm text-foreground/90 leading-relaxed">
                <code>{heroSnippet}</code>
              </pre>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
