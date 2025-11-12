"use client";

import { ArrowRight, Star } from "lucide-react";
import { DotPattern } from "@/components/dot-pattern";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { assetUrl } from "@/lib/utils";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-linear-to-b from-background to-background/80 pt-20 pb-16 sm:pt-32">
      {/* Background Pattern */}
      <div className="absolute inset-0">
        {/* Dot pattern overlay using reusable component */}
        <DotPattern className="opacity-100" fadeStyle="ellipse" size="md" />
      </div>

      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          {/* Announcement Badge */}
          <div className="mb-8 flex justify-center">
            <Badge className="border-foreground px-4 py-2" variant="outline">
              <Star className="mr-2 h-3 w-3 fill-current" />
              Open Source • Zero Stored Credentials
              <ArrowRight className="ml-2 h-3 w-3" />
            </Badge>
          </div>

          {/* Main Headline */}
          <h1 className="mb-6 font-bold text-4xl tracking-tight sm:text-6xl lg:text-7xl">
            Deploy Email Infrastructure
            <span className="bg-linear-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              {" "}
              to Your AWS Account{" "}
            </span>
            in 30 Seconds
          </h1>

          {/* Subheading */}
          <p className="mx-auto mb-10 max-w-2xl text-lg text-muted-foreground sm:text-xl">
            One command deploys production-ready AWS SES infrastructure with
            Resend-like developer experience. You own the infrastructure, pay
            AWS directly (pennies vs dollars), and never lock in.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
            <Button asChild className="cursor-pointer text-base" size="lg">
              <a href="/docs/quickstart">
                Get Started
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
            <Button
              asChild
              className="cursor-pointer text-base"
              size="lg"
              variant="outline"
            >
              <a
                href="https://github.com/wraps-team/wraps"
                rel="noopener noreferrer"
                target="_blank"
              >
                <Star className="mr-2 h-4 w-4" />
                Star on GitHub
              </a>
            </Button>
          </div>

          {/* Quick Install */}
          <div className="mx-auto mt-8 max-w-md">
            <p className="mb-2 text-muted-foreground text-sm">Quick install:</p>
            <div className="flex items-center gap-2 rounded-lg border bg-card p-3">
              <code className="flex-1 text-sm">npx wraps init</code>
              <Button
                className="shrink-0"
                onClick={() => {
                  navigator.clipboard.writeText("npx wraps init");
                }}
                size="sm"
                variant="ghost"
              >
                Copy
              </Button>
            </div>
          </div>
        </div>

        {/* Hero Image/Visual */}
        <div className="mx-auto mt-20 max-w-6xl">
          <div className="group relative">
            {/* Top background glow effect - positioned above the image */}
            <div className="lg:-top-8 -translate-x-1/2 absolute top-2 left-1/2 mx-auto h-24 w-[90%] transform rounded-full bg-primary/50 blur-3xl lg:h-80" />

            <div className="relative rounded-xl border bg-card shadow-2xl">
              {/* Light mode dashboard image */}
              <img
                alt="Dashboard Preview - Light Mode"
                className="block w-full rounded-xl object-cover dark:hidden"
                src={assetUrl("dashboard-light.png")}
              />

              {/* Dark mode dashboard image */}
              <img
                alt="Dashboard Preview - Dark Mode"
                className="hidden w-full rounded-xl object-cover dark:block"
                src={assetUrl("dashboard-dark.png")}
              />

              {/* Bottom fade effect - gradient overlay that fades the image to background */}
              <div className="absolute bottom-0 left-0 h-32 w-full rounded-b-xl bg-linear-to-b from-background/0 via-background/70 to-background md:h-40 lg:h-48" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
