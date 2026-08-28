import { Lock, Mail, ShieldCheck, TerminalSquare } from "lucide-react";
import { SectionKicker } from "./section-kicker";

type Check = {
  icon: typeof Lock;
  title: string;
  description: React.ReactNode;
};

const checks: Check[] = [
  {
    icon: TerminalSquare,
    title: "One-command deploy",
    description: (
      <>
        Run <code>wraps email init</code> and the full stack is production-ready
        in under two minutes.
      </>
    ),
  },
  {
    icon: Mail,
    title: "TypeScript-first SDK",
    description: (
      <>
        <code>email.send()</code> — full type inference, no boilerplate, no
        wrappers.
      </>
    ),
  },
  {
    icon: ShieldCheck,
    title: "Reputation protection",
    description:
      "Bounces and complaints are tracked automatically; suppression prevents re-sends.",
  },
  {
    icon: Lock,
    title: "Zero stored credentials",
    description:
      "Access is an OIDC-federated IAM role. Your AWS keys never leave your account.",
  },
];

export function FeatureBlockSection() {
  return (
    <section className="border-border border-b py-20 md:py-24" id="features">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 max-w-[620px]">
          <SectionKicker>The platform</SectionKicker>
          <h2 className="font-heading font-semibold text-[30px] text-foreground leading-[1.08] tracking-[-0.022em] md:text-[40px]">
            One command stands up the whole sending stack.
          </h2>
          <p className="mt-4 max-w-[52ch] text-[17px] text-muted-foreground leading-[1.55]">
            Wraps deploys SES, DynamoDB, Lambda, EventBridge, and scoped IAM
            roles into your AWS account. Every event streams to tables you own —
            query them yourself, or watch them in the dashboard.
          </p>
        </div>

        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Visual */}
          <div className="aspect-[4/3] overflow-hidden rounded-xl border border-border bg-zinc-950">
            <video
              autoPlay
              className="size-full object-cover"
              loop
              muted
              playsInline
              poster="/landing/posters/PlatformStack.jpg"
              preload="metadata"
              src="/landing/PlatformStack.mp4"
            >
              <track
                kind="descriptions"
                label="wraps email init deploying the IAM role, SES config set, EventBridge rule, Lambda processor, and DynamoDB table, then delivery events streaming into that table"
              />
            </video>
          </div>

          {/* Checks */}
          <ul className="grid gap-7">
            {checks.map((check) => {
              const Icon = check.icon;
              return (
                <li className="flex items-start gap-3.5" key={check.title}>
                  <Icon
                    aria-hidden="true"
                    className="mt-0.5 size-5 shrink-0 text-orange-600 dark:text-orange-500"
                  />
                  <div>
                    <h3 className="mb-1 font-semibold text-[15px] text-foreground">
                      {check.title}
                    </h3>
                    <p className="text-[13.5px] text-muted-foreground leading-[1.55] [&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:text-foreground">
                      {check.description}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
