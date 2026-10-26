import {
  Bot,
  Code2,
  GitBranch,
  type LucideIcon,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";

type Principle = {
  icon: LucideIcon;
  title: string;
  description: string;
  href?: string;
};

const principles: Principle[] = [
  {
    icon: Code2,
    title: "Code you can review",
    description:
      "Templates and workflows live in your repo. Roll back a bad send in a pull request.",
  },
  {
    icon: ShieldCheck,
    title: "Type-safe end to end",
    description:
      "Typed SDK, typed templates, typed workflows. Errors surface at build, not in inboxes.",
  },
  {
    icon: Users,
    title: "No more email tickets",
    description:
      "Engineers own the code, marketers own the content, both ship through one pipeline.",
  },
  {
    icon: GitBranch,
    title: "Open source",
    description:
      "AGPL-3.0. Read the code that touches your AWS account before it does.",
  },
  {
    icon: Bot,
    title: "Built for Agents Too",
    href: "/agents",
    description:
      "Agents write TypeScript and open PRs. Your agent ships what your team ships.",
  },
];

export function PrinciplesSection() {
  return (
    <section className="border-border border-b py-20 md:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <h2 className="sr-only">Why teams run email on Wraps</h2>
        <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-5">
          {principles.map((principle) => {
            const Icon = principle.icon;
            const body = (
              <>
                <Icon
                  aria-hidden="true"
                  className="mb-4 size-5 text-foreground"
                />
                <h3 className="mb-2 font-semibold text-base text-foreground">
                  {principle.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {principle.description}
                </p>
              </>
            );

            if (principle.href) {
              return (
                <Link
                  className="block border-foreground border-t pt-5 transition-colors hover:border-brand"
                  href={principle.href}
                  key={principle.title}
                >
                  {body}
                </Link>
              );
            }

            return (
              <div
                className="border-foreground border-t pt-5"
                key={principle.title}
              >
                {body}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
