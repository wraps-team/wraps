import { DotPattern } from "@wraps/ui/components/dot-pattern";
import { Button } from "@wraps/ui/components/ui/button";
import { WrapsMotif } from "@/components/wraps-motif";
import { SectionKicker } from "./section-kicker";

type PanelAction = { label: string; href: string };

/**
 * The closing section: a square ink panel (the terminal tokens, dark in both
 * themes) with the orange W bleeding off the corner. Copy and buttons are
 * props, so every page closes with the same shape and its own words.
 *
 * `actions` replaces the two default buttons when a page needs its own
 * tracked controls. Rendered inside `.dark` so the semantic tokens resolve to
 * their dark values on the ink background.
 */
export function ClosingPanel({
  kicker = "Get started",
  title,
  body,
  primary,
  secondary,
  actions,
  id,
}: {
  kicker?: string;
  title: React.ReactNode;
  body: React.ReactNode;
  primary?: PanelAction;
  secondary?: PanelAction;
  actions?: React.ReactNode;
  id?: string;
}) {
  return (
    <section className="py-16 md:py-20" id={id}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="dark relative isolate grid min-h-88 content-center justify-items-start gap-5 overflow-hidden border border-terminal-border bg-terminal p-8 text-terminal-foreground sm:p-12 lg:p-16">
          <DotPattern
            className="-z-10"
            fadeStyle="ellipse"
            opacity="low"
            size="md"
          />
          <WrapsMotif
            aria-hidden="true"
            className="-right-12 -bottom-12 -z-10 absolute h-auto w-3/4 max-w-120 text-brand opacity-25 lg:w-1/2 lg:opacity-100"
          />
          <SectionKicker className="mb-0">{kicker}</SectionKicker>
          <h2 className="max-w-2xl text-balance font-heading font-semibold text-4xl text-terminal-foreground leading-tight tracking-tight md:text-5xl">
            {title}
          </h2>
          <p className="max-w-md text-pretty text-lg text-terminal-muted leading-relaxed">
            {body}
          </p>
          {actions ?? (
            <div className="flex flex-wrap gap-3">
              {primary && (
                <Button asChild size="lg" variant="brand">
                  <a href={primary.href}>{primary.label}</a>
                </Button>
              )}
              {secondary && (
                <Button asChild size="lg" variant="outline">
                  <a href={secondary.href}>{secondary.label}</a>
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
