import { CopyCommand } from "./copy-command";
import { HeroAnimatedCTA, HeroDocsLink } from "./hero-cta";
import { HeroDotField } from "./hero-dot-field";
import { HeroProductPanel } from "./hero-product-panel";

// The rate used to sit in this row. It moved to the pricing section on
// purpose: price is the third value theme, and against the free open-source
// SES wrappers it is an argument we lose. See ops/sops/positioning.md.
const proofStats: { n: string; k: string; short: string }[] = [
  { n: "~2 min", k: "to deploy into your AWS account", short: "to deploy" },
  { n: "50+", k: "blacklists checked per audit", short: "blacklists checked" },
  { n: "0", k: "credentials we store", short: "credentials stored" },
];

// Static content - server rendered, visible immediately
export function HeroSection() {
  return (
    <section className="relative overflow-hidden border-border border-b pt-10 pb-14 sm:pt-12 sm:pb-20 md:pt-14 lg:pt-14">
      {/* Soft wash from the top edge, so the panel below has something to sit in. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-gradient-to-b from-brand/[0.05] to-transparent"
      />

      <HeroDotField />

      <div className="relative mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-10">
          <div className="mx-auto flex max-w-4xl flex-col items-center text-center lg:col-span-5 lg:mx-0 lg:items-start lg:text-left">
            <h1 className="text-balance font-heading font-semibold text-4xl text-foreground leading-none tracking-tight sm:text-5xl md:text-6xl lg:text-5xl xl:text-6xl">
              Email for teams on AWS.
            </h1>

            <p className="mt-5 max-w-[44rem] text-balance text-base text-muted-foreground leading-relaxed sm:text-lg md:text-xl">
              One command deploys Amazon SES into your AWS account. Then send,
              broadcast and automate, from your app or your agent.
            </p>

            <div className="mt-6 w-full sm:mt-7 sm:w-auto">
              <HeroAnimatedCTA />
            </div>

            <div className="mt-4 hidden sm:block">
              <CopyCommand
                command="npx @wraps.dev/cli email init"
                location="hero"
              />
            </div>

            <HeroDocsLink />
          </div>

          <div className="md:mt-6 lg:col-span-7 lg:mt-0">
            <HeroProductPanel />
          </div>
        </div>

        {/* Proof stats */}
        <dl className="mx-auto mt-10 grid max-w-3xl grid-cols-3 border-border border-t md:mt-16">
          {proofStats.map((stat, i) => (
            <div
              className={`px-2 py-3 text-center sm:px-5 sm:py-4 ${i > 0 ? "border-border border-l" : ""}`}
              key={stat.k}
            >
              <dt className="font-mono font-semibold text-foreground text-sm tracking-tight sm:text-xl">
                {stat.n}
              </dt>
              <dd className="mt-0.5 text-pretty text-muted-foreground text-xs">
                <span className="sm:hidden">{stat.short}</span>
                <span className="hidden sm:inline">{stat.k}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
