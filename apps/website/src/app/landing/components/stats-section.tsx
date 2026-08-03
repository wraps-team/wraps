"use client";

import { Clock, ShieldCheck, Zap } from "lucide-react";
import { Github } from "@/components/ui/svgs/brand-icons";

const stats = [
  {
    icon: Clock,
    value: "<2 min",
    label: "Deploy Time",
    description: "One command, full infrastructure",
  },
  {
    icon: Zap,
    value: "AWS",
    label: "Direct Pricing",
    description: "Pay AWS directly, no markup",
  },
  {
    icon: ShieldCheck,
    value: "Zero",
    label: "Stored Credentials",
    description: "Your keys never leave your machine",
  },
  {
    icon: Github,
    value: "100%",
    label: "Open Source",
    description: "CLI, SDK, and Console",
    href: "https://github.com/wraps-team/wraps",
  },
];

export function StatsSection() {
  return (
    <section className="py-12 sm:py-16">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-4 md:gap-6 lg:grid-cols-4">
          {stats.map((stat) => {
            const cardContent = (
              <div className="rounded-xl border bg-background p-6 text-center transition-all hover:border-orange-500/50">
                <div className="mb-3 flex justify-center">
                  <div className="flex aspect-square size-12 items-center justify-center rounded-full border-2 border-orange-500 bg-orange-500/5">
                    <stat.icon className="size-6 text-orange-500" />
                  </div>
                </div>
                <h3 className="font-bold text-2xl text-foreground sm:text-3xl">
                  {stat.value}
                </h3>
                <p className="font-medium text-foreground">{stat.label}</p>
                <p className="mt-1 text-muted-foreground text-sm">
                  {stat.description}
                </p>
              </div>
            );

            if (stat.href) {
              return (
                <a
                  href={stat.href}
                  key={stat.label}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {cardContent}
                </a>
              );
            }

            return <div key={stat.label}>{cardContent}</div>;
          })}
        </div>
      </div>
    </section>
  );
}
