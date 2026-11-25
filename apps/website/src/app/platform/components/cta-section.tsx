import { Button } from "@wraps/ui/components/ui/button";

export function DashboardCtaSection() {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-2xl bg-foreground px-8 py-16 text-background">
          <div className="mb-5 inline-flex items-center gap-2 font-mono text-2xs text-background/60 uppercase tracking-eyebrow">
            <span className="size-1.5 rounded-full bg-brand" />
            <span>Start Your Journey</span>
          </div>

          <h2 className="mb-4 font-heading font-semibold text-3xl tracking-tight md:text-4xl">
            Create. Reach. Scale.
          </h2>
          <p className="mb-8 max-w-xl text-background/70">
            Your AWS handles sending. We handle the DX. Unlimited contacts,
            infrastructure you own.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="lg" variant="brand">
              <a href="https://app.wraps.dev/auth?mode=signup">Get Started</a>
            </Button>
            <Button
              asChild
              className="border-background/30 bg-transparent text-background hover:bg-background/10 hover:text-background"
              size="lg"
              variant="outline"
            >
              <a href="/#pricing">View Pricing</a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
