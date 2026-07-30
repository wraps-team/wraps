import { DotPattern } from "@wraps/ui/components/dot-pattern";
import { HeroAnimatedCTA } from "@/app/landing/components/hero-cta";
import { ToolCallTrace } from "./tool-call-trace";

export function AgentsHeroSection() {
  return (
    <section className="relative overflow-hidden bg-linear-to-b from-background to-background/80 pt-20 pb-16 sm:pt-28">
      <div className="absolute inset-0">
        <DotPattern className="opacity-100" fadeStyle="ellipse" size="md" />
      </div>

      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-14">
          {/* Left column — mono-forward copy */}
          <div>
            {/* Mono tag, no marketing badge */}
            <div className="mb-5 inline-flex items-center gap-2 font-mono text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
              <span className="size-1.5 rounded-full bg-orange-500" />
              <span>wraps · for agents</span>
            </div>

            <h1 className="mb-6 text-pretty font-heading font-semibold text-4xl leading-tight tracking-tight sm:text-5xl">
              Give your agent an email address.{" "}
              <span className="text-orange-500">Keep the leash.</span>
            </h1>

            {/* Mono anchor: the return type IS the marketing. Every send has
                three possible endings, and one of them is "a human decides". */}
            <pre className="mb-6 overflow-x-auto rounded-lg border border-border bg-card/60 px-4 py-3 font-mono text-[13px] leading-relaxed text-foreground/90">
              <span className="text-muted-foreground">tool</span>{" "}
              <span className="text-orange-500">email.send</span>
              {"("}
              {"\n  "}from: <span className="text-foreground/60">string</span>,
              {"\n  "}to: <span className="text-foreground/60">string</span>,
              {"\n  "}subject:{" "}
              <span className="text-foreground/60">string</span>,{"\n  "}html:{" "}
              <span className="text-foreground/60">string</span>,{"\n"}
              {"): { status: "}
              <span className="text-emerald-700 dark:text-emerald-400">
                {'"sent"'}
              </span>
              {" | "}
              <span className="text-amber-700 dark:text-amber-400">
                {'"pending_approval"'}
              </span>
              {" | "}
              <span className="text-red-700 dark:text-red-400">
                {'"blocked"'}
              </span>
              {" }"}
            </pre>

            <p className="mb-6 max-w-md text-muted-foreground">
              An agent with a raw API key can email anyone, at any volume. A
              Wraps agent gets its own address, a cap, an allowlist, and a kill
              switch, enforced in your AWS account before SES ever sees the
              send.
            </p>

            <HeroAnimatedCTA />
          </div>

          {/* Right column — animated tool-call trace */}
          <div className="relative">
            <div className="absolute -inset-4 rounded-3xl bg-orange-500/10 opacity-60 blur-2xl" />
            <div className="relative">
              <ToolCallTrace />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
