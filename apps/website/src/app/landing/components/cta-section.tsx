"use client";

import { ArrowRight, Github, Rocket, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function CTASection() {
  return (
    <section className="bg-gradient-to-b from-background via-muted/50 to-background py-16 lg:py-24">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <div className="text-center">
            <div className="space-y-8">
              {/* Badge */}
              <div className="flex flex-col items-center gap-4">
                <Badge className="flex items-center gap-2" variant="outline">
                  <Sparkles className="size-3" />
                  Ready to Deploy
                </Badge>
              </div>

              {/* Main Content */}
              <div className="space-y-6">
                <h1 className="text-balance font-bold text-4xl tracking-tight sm:text-5xl lg:text-6xl">
                  Own your email
                  <span className="flex justify-center sm:inline-flex">
                    <span className="relative mx-2">
                      <span className="bg-linear-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                        infrastructure
                      </span>
                      <div className="-bottom-2 absolute start-0 h-1 w-full bg-linear-to-r from-primary/30 to-primary/10" />
                    </span>
                  </span>
                  <span className="flex justify-center sm:inline-flex">
                    today
                  </span>
                </h1>

                <p className="mx-auto max-w-2xl text-balance text-muted-foreground lg:text-xl">
                  Deploy production-ready AWS SES infrastructure in one command.
                  Pay AWS directly, keep full control, and never lock in.
                </p>
              </div>

              {/* CTA Buttons */}
              <div className="flex flex-col justify-center gap-4 sm:flex-row sm:gap-6">
                <Button
                  asChild
                  className="cursor-pointer px-8 py-6 font-medium text-lg"
                  size="lg"
                >
                  <a href="/docs/quickstart">
                    <Rocket className="me-2 size-5" />
                    Get Started Free
                  </a>
                </Button>
                <Button
                  asChild
                  className="group cursor-pointer px-8 py-6 font-medium text-lg"
                  size="lg"
                  variant="outline"
                >
                  <a
                    href="https://github.com/wraps-team/wraps"
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
                  <span>Forever free local console</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="me-1 size-2 rounded-full bg-blue-600 dark:bg-blue-400" />
                  <span>Open source (AGPLv3)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="me-1 size-2 rounded-full bg-purple-600 dark:bg-purple-400" />
                  <span>Zero vendor lock-in</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
