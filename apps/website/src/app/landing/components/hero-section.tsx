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
              Open Source • Forever Free Local Console
              <ArrowRight className="ml-2 h-3 w-3" />
            </Badge>
          </div>

          {/* Main Headline */}
          <h1 className="mb-6 font-bold text-4xl tracking-tight sm:text-6xl lg:text-7xl">
            Deploy AWS Infrastructure
            <span className="bg-linear-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              {" "}
              To Your Account{" "}
            </span>
            with Zero Vendor Lock-In
          </h1>

          {/* Subheading */}
          <p className="mx-auto mb-10 max-w-2xl text-lg text-muted-foreground sm:text-xl">
            Get Resend-like developer experience with AWS pricing. Deploy email,
            SMS, queues, and IoT infrastructure to your own AWS account in 30
            seconds. You own it, you control it, you pay AWS directly.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
            <Button asChild className="cursor-pointer text-base" size="lg">
              <a href="#pricing">
                Get Started Free
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
                View on GitHub
              </a>
            </Button>
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
