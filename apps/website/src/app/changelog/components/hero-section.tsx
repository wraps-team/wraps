import { DotPattern } from "@wraps/ui/components/dot-pattern";

export function ChangelogHeroSection() {
  return (
    <section className="relative overflow-hidden bg-linear-to-b from-background to-background/80 pt-20 pb-16 sm:pt-32">
      {/* Background Pattern */}
      <div className="absolute inset-0">
        <DotPattern className="opacity-100" fadeStyle="ellipse" size="md" />
      </div>

      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          {/* Mono tag, no marketing badge */}
          <div className="mb-5 inline-flex items-center gap-2 font-mono text-2xs text-muted-foreground uppercase tracking-eyebrow">
            <span className="size-1.5 rounded-full bg-brand" />
            <span>wraps · changelog</span>
          </div>

          {/* Main Headline */}
          <h1 className="mb-6 text-pretty font-heading font-semibold text-4xl leading-tight tracking-tight sm:text-5xl">
            What&apos;s new <span className="text-brand-text">in Wraps.</span>
          </h1>

          {/* Subheading */}
          <p className="max-w-2xl text-pretty text-lg text-muted-foreground">
            Stay up to date with the latest features, improvements, and fixes
            across the Wraps CLI, SDK, and Dashboard.
          </p>
        </div>
      </div>
    </section>
  );
}
