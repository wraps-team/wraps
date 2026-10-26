import { CopyCommand } from "./copy-command";
import { HeroAnimatedCTA } from "./hero-cta";
import { HeroDotField } from "./hero-dot-field";
import { HeroSurvivalPanel } from "./hero-survival-panel";

// The rate used to sit in this row. It moved to the pricing section on
// purpose: price is the third value theme, and against the free open-source
// SES wrappers it is an argument we lose. See ops/sops/positioning.md.
const proofStats: { n: string; k: string }[] = [
  { n: "5% / 0.1%", k: "AWS bounce and complaint review lines" },
  { n: "50+", k: "blacklists checked per audit" },
  { n: "0", k: "credentials we store" },
];

// Static content - server rendered, visible immediately
export function HeroSection() {
  return (
    <section className="relative overflow-hidden border-border border-b pt-12 pb-20 md:pt-14 lg:pt-14">
      {/* Soft wash from the top edge, so the panel below has something to sit in. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-gradient-to-b from-brand/[0.05] to-transparent"
      />

      <HeroDotField />

      <div className="relative mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
          <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3.5 py-1.5 font-mono text-muted-foreground text-xs uppercase tracking-widest backdrop-blur">
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-brand"
            />
            The operations layer for Amazon SES
          </span>

          <h1 className="text-balance font-heading font-semibold text-5xl text-foreground leading-none tracking-tight md:text-6xl lg:text-7xl">
            Run Amazon SES without getting paused.
          </h1>

          <p className="mt-5 max-w-[44rem] text-balance text-lg text-muted-foreground leading-relaxed md:text-xl">
            Wraps tracks bounce and complaint rates against AWS&apos;s review
            and pause lines, inside your AWS account.{" "}
            <span className="whitespace-nowrap">
              Send from your app or your agent.
            </span>
          </p>

          <div className="mt-7">
            <HeroAnimatedCTA />
          </div>

          <div className="mt-4">
            <CopyCommand
              command="npx @wraps.dev/cli email init"
              location="hero"
            />
          </div>
        </div>

        <div className="mt-12 md:mt-16">
          <HeroSurvivalPanel />
        </div>

        {/* Proof stats */}
        <dl className="mx-auto mt-6 grid max-w-3xl grid-cols-1 border-border border-t sm:grid-cols-3 md:mt-20">
          {proofStats.map((stat, i) => (
            <div
              className={`py-4 text-center sm:px-5 ${i > 0 ? "border-border border-t sm:border-t-0 sm:border-l" : ""}`}
              key={stat.k}
            >
              <dt className="font-mono font-semibold text-xl text-foreground tracking-tight">
                {stat.n}
              </dt>
              <dd className="mt-0.5 text-pretty text-muted-foreground text-xs">
                {stat.k}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
