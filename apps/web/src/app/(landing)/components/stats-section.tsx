"use client";

import { Download, Package, Star, Users } from "lucide-react";
import { DotPattern } from "@/components/dot-pattern";
import { Card, CardContent } from "@/components/ui/card";

const stats = [
  {
    icon: Package,
    value: "500+",
    label: "Components",
    description: "Ready-to-use blocks",
  },
  {
    icon: Download,
    value: "25K+",
    label: "Downloads",
    description: "Trusted worldwide",
  },
  {
    icon: Users,
    value: "10K+",
    label: "Developers",
    description: "Active community",
  },
  {
    icon: Star,
    value: "4.9",
    label: "Rating",
    description: "User satisfaction",
  },
];

export function StatsSection() {
  return (
    <section className="relative py-12 sm:py-16">
      {/* Background with transparency */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary/8 via-transparent to-secondary/20" />
      <DotPattern className="opacity-75" fadeStyle="circle" size="md" />

      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-6 md:gap-8 lg:grid-cols-4">
          {stats.map((stat, index) => (
            <Card
              className="border-border/50 bg-background/60 py-0 text-center backdrop-blur-sm"
              key={index}
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
