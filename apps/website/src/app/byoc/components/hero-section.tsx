import { DotPattern } from "@wraps/ui/components/dot-pattern";
import { Button } from "@wraps/ui/components/ui/button";
import Link from "next/link";

export function ByocHeroSection() {
  return (
    <section className="relative overflow-hidden bg-linear-to-b from-background to-background/80 pt-20 pb-20 sm:pt-28">
      <div className="absolute inset-0">
        <DotPattern className="opacity-100" fadeStyle="ellipse" size="md" />
      </div>

      <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <div className="mb-5 inline-flex items-center gap-2 font-mono text-2xs text-muted-foreground uppercase tracking-eyebrow">
            <span className="size-1.5 rounded-full bg-brand" />
            <span>wraps · byoc</span>
          </div>

          <h1 className="mb-6 text-pretty font-heading font-semibold text-4xl leading-tight tracking-tight sm:text-5xl">
            BYOC sending <span className="text-brand">infrastructure.</span>
          </h1>

          <p className="mb-8 max-w-xl text-lg text-muted-foreground">
            Wraps deploys email sending infrastructure into your AWS account
            with one CLI command. Your SES, your reputation, your delivery data.
            Self-serve, no Kubernetes, no sales call.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="lg" variant="brand">
              <a href="https://app.wraps.dev/auth?mode=signup">Start sending</a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/docs/quickstart/email">Read the docs</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
