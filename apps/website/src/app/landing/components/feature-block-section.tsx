import {
  Database,
  type LucideIcon,
  Mail,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";
import type * as React from "react";
import { SectionKicker } from "./section-kicker";

type Check = {
  icon: LucideIcon;
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
        in about two minutes.
      </>
    ),
  },
  {
    icon: ShieldCheck,
    title: "Nothing you have gets touched",
    description:
      "Every resource is new and prefixed wraps-email-. What is already in the account is left alone.",
  },
  {
    icon: Database,
    title: "Events land in tables you own",
    description:
      "Sends, deliveries, opens and clicks stream into DynamoDB in your account. Query them yourself, or watch them in the dashboard.",
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
];

/*
 * Light and dark renders of the same clip, swapped on the site's `.dark` class
 * — the tile sits on the page background, so a single dark clip read as a hole
 * punched in the light theme. The still is a CSS background rather than the
 * `poster` attribute: a poster downloads even when the video is display:none,
 * a background-image does not.
 */
function StackVideo({ theme }: { theme: "light" | "dark" }) {
  const suffix = theme === "light" ? "-light" : "";

  return (
    <video
      autoPlay
      className={
        theme === "light"
          ? "size-full bg-cover bg-center object-cover bg-(image:--poster) dark:hidden"
          : "hidden size-full bg-cover bg-center object-cover bg-(image:--poster) dark:block"
      }
      loop
      muted
      playsInline
      preload="metadata"
      src={`/landing/PlatformStack${suffix}.mp4`}
      style={
        {
          "--poster": `url(/landing/posters/PlatformStack${suffix}.jpg)`,
        } as React.CSSProperties
      }
    >
      <track
        kind="descriptions"
        label="wraps email init deploying the IAM role, SES config set, EventBridge rule, Lambda processor, and DynamoDB table, then delivery events streaming into that table"
      />
    </video>
  );
}

export function FeatureBlockSection() {
  return (
    <section className="border-border border-b py-20 md:py-24" id="features">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 max-w-[620px]">
          <SectionKicker>The first step</SectionKicker>
          <h2 className="font-heading font-semibold text-3xl text-foreground leading-none tracking-tight md:text-4xl">
            One command stands up the whole sending stack.
          </h2>
          <p className="mt-4 max-w-[52ch] text-lg text-muted-foreground leading-relaxed">
            Wraps deploys SES, DynamoDB, Lambda, EventBridge, and scoped IAM
            roles into your AWS account.
          </p>
        </div>

        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Visual */}
          <div className="aspect-[4/3] overflow-hidden rounded-xl border border-border bg-background">
            <StackVideo theme="light" />
            <StackVideo theme="dark" />
          </div>

          {/* Checks */}
          <ul className="grid gap-7">
            {checks.map((check) => {
              const Icon = check.icon;
              return (
                <li className="flex items-start gap-3.5" key={check.title}>
                  <Icon
                    aria-hidden="true"
                    className="mt-0.5 size-5 shrink-0 text-brand"
                  />
                  <div>
                    <h3 className="mb-1 font-semibold text-base text-foreground">
                      {check.title}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed [&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:text-foreground">
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
