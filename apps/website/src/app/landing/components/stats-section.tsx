"use client";

import { Clock, DollarSign, Gauge, Zap } from "lucide-react";
import { DotPattern } from "@/components/dot-pattern";
import { Card, CardContent } from "@/components/ui/card";

const stats = [
  {
    icon: Clock,
    value: "<2 min",
    label: "Deploy Time",
    description: "From zero to production",
  },
  {
    icon: DollarSign,
    value: "90%",
    label: "Cost Savings",
    description: "vs email SaaS at scale",
  },
  {
    icon: Zap,
    value: "$0.10",
    label: "Per 1K Emails",
    description: "AWS SES pricing",
  },
  {
    icon: Gauge,
    value: "100%",
    label: "Open Source",
    description: "CLI, SDK, Console",
  },
];

export function StatsSection() {
  return (
    <section className="relative py-12 sm:py-16">
      {/* Background with transparency */}
      <div className="absolute inset-0 bg-linear-to-r from-primary/8 via-transparent to-secondary/20" />
      <DotPattern className="opacity-75" fadeStyle="circle" size="md" />

      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-6 md:gap-8 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card
              className="border-border/50 bg-background/60 py-0 text-center backdrop-blur-sm"
              key={stat.label}
            >
              <CardContent className="p-6">
                <div className="mb-4 flex justify-center">
                  <div className="rounded-xl bg-primary/10 p-3">
                    <stat.icon className="h-6 w-6 text-primary" />
                  </div>
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-2xl text-foreground sm:text-3xl">
                    {stat.value}
                  </h3>
                  <p className="font-semibold text-foreground">{stat.label}</p>
                  <p className="text-muted-foreground text-sm">
                    {stat.description}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
