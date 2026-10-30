import { DotPattern } from "@wraps/ui/components/dot-pattern";
import { Button } from "@wraps/ui/components/ui/button";

export function DashboardHeroSection() {
  return (
    <section className="relative overflow-hidden bg-linear-to-b from-background to-background/80 pt-20 pb-20 sm:pt-28">
      {/* Background Pattern */}
      <div className="absolute inset-0">
        <DotPattern className="opacity-100" fadeStyle="ellipse" size="md" />
      </div>

      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          {/* Mono tag, no marketing badge */}
          <div className="mb-5 inline-flex items-center gap-2 font-mono text-2xs text-muted-foreground uppercase tracking-eyebrow">
            <span className="size-1.5 rounded-full bg-brand" />
            <span>wraps · platform</span>
          </div>

          {/* Main Headline */}
          <h1 className="mb-6 text-pretty font-heading font-semibold text-4xl leading-tight tracking-tight sm:text-5xl">
            Stop overpaying to send{" "}
            <span className="text-brand-text">newsletters and campaigns.</span>
          </h1>

          {/* Subheading */}
          <p className="mb-8 max-w-xl text-lg text-muted-foreground">
            Wraps deploys email infrastructure to your AWS account. You pay AWS
            prices — not Mailchimp prices.
          </p>

          {/* CTA */}
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="lg" variant="brand">
              <a href="https://app.wraps.dev/auth?mode=signup">Get Started</a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#templates">See the platform</a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
