"use client";

import { ArrowRight, Github, Package, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export function CTASection() {
  return (
    <section className="bg-muted/80 py-16 lg:py-24">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <div className="text-center">
            <div className="space-y-8">
              {/* Badge and Stats */}
              <div className="flex flex-col items-center gap-4">
                <Badge className="flex items-center gap-2" variant="outline">
                  <TrendingUp className="size-3" />
                  Productivity Suite
                </Badge>

                <div className="flex items-center gap-4 text-muted-foreground text-sm">
                  <span className="flex items-center gap-1">
                    <div className="size-2 rounded-full bg-green-500" />
                    150+ Blocks
                  </span>
                  <Separator className="!h-4" orientation="vertical" />
                  <span>25K+ Downloads</span>
                  <Separator className="!h-4" orientation="vertical" />
                  <span>4.9★ Rating</span>
                </div>
              </div>

              {/* Main Content */}
              <div className="space-y-6">
                <h1 className="text-balance font-bold text-4xl tracking-tight sm:text-5xl lg:text-6xl">
                  Supercharge your team&apos;s
                  <span className="flex justify-center sm:inline-flex">
                    <span className="relative mx-2">
                      <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                        performance
                      </span>
                      <div className="-bottom-2 absolute start-0 h-1 w-full bg-gradient-to-r from-primary/30 to-secondary/30" />
                    </span>
                    today
                  </span>
                </h1>

                <p className="mx-auto max-w-2xl text-balance text-muted-foreground lg:text-xl">
                  Stop building from scratch. Get production-ready components,
                  templates and dashboards that integrate seamlessly with your
                  shadcn/ui projects.
                </p>
              </div>

              {/* CTA Buttons */}
              <div className="flex flex-col justify-center gap-4 sm:flex-row sm:gap-6">
                <Button
                  asChild
                  className="cursor-pointer px-8 py-6 font-medium text-lg"
                  size="lg"
                >
                  <a
                    href="https://shadcnstore.com/blocks"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <Package className="me-2 size-5" />
                    Browse Components
                  </a>
                </Button>
                <Button
                  asChild
                  className="group cursor-pointer px-8 py-6 font-medium text-lg"
                  size="lg"
                  variant="outline"
                >
                  <a
                    href="https://github.com/silicondeck/shadcn-dashboard-landing-template"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <Github className="me-2 size-5" />
                    View on GitHub
                    <ArrowRight className="ms-2 size-4 transition-transform group-hover:translate-x-1" />
                  </a>
                </Button>
              </div>

              {/* Trust Indicators */}
              <div className="flex flex-wrap items-center justify-center gap-6 text-muted-foreground text-sm">
                <div className="flex items-center gap-2">
                  <div className="me-1 size-2 rounded-full bg-green-600 dark:bg-green-400" />

                  <span>Free components available</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="me-1 size-2 rounded-full bg-blue-600 dark:bg-blue-400" />

                  <span>Commercial license included</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="me-1 size-2 rounded-full bg-purple-600 dark:bg-purple-400" />

                  <span>Regular updates & support</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
