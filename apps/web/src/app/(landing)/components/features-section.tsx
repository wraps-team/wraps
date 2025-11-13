"use client";

import {
  ArrowRight,
  BarChart3,
  Crown,
  Database,
  Layout,
  Package,
  Palette,
  Users,
  Zap,
} from "lucide-react";
import { Image3D } from "@/components/image-3d";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const mainFeatures = [
  {
    icon: Package,
    title: "Curated Component Library",
    description:
      "Hand-picked blocks and templates for quality and reliability.",
  },
  {
    icon: Crown,
    title: "Free & Premium Options",
    description:
      "Start free, upgrade to premium collections when you need more.",
  },
  {
    icon: Layout,
    title: "Ready-to-Use Templates",
    description: "Copy-paste components that just work out of the box.",
  },
  {
    icon: Zap,
    title: "Regular Updates",
    description: "New blocks and templates added weekly to keep you current.",
  },
];

const secondaryFeatures = [
  {
    icon: BarChart3,
    title: "Multiple Frameworks",
    description:
      "React, Next.js, and Vite compatibility for flexible development.",
  },
  {
    icon: Palette,
    title: "Modern Tech Stack",
    description: "Built with shadcn/ui, Tailwind CSS, and TypeScript.",
  },
  {
    icon: Users,
    title: "Responsive Design",
    description: "Mobile-first components for all screen sizes and devices.",
  },
  {
    icon: Database,
    title: "Developer-Friendly",
    description:
      "Clean code, well-documented, easy integration and customization.",
  },
];

export function FeaturesSection() {
  return (
    <section className="bg-muted/30 py-24 sm:py-32" id="features">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <Badge className="mb-4" variant="outline">
            Marketplace Features
          </Badge>
          <h2 className="mb-4 font-bold text-3xl tracking-tight sm:text-4xl">
            Everything you need to build amazing web applications
          </h2>
          <p className="text-lg text-muted-foreground">
            Our marketplace provides curated blocks, templates, landing pages,
            and admin dashboards to help you build professional applications
            faster than ever.
          </p>
        </div>

        {/* First Feature Section */}
        <div className="mb-24 grid items-center gap-12 lg:grid-cols-2 lg:gap-8 xl:gap-16">
          {/* Left Image */}
          <Image3D
            alt="Analytics dashboard"
            darkSrc="/feature-1-dark.png"
            direction="left"
            lightSrc="/feature-1-light.png"
          />
          {/* Right Content */}
          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-balance font-semibold text-2xl tracking-tight sm:text-3xl">
                Components that accelerate development
              </h3>
              <p className="text-pretty text-base text-muted-foreground">
                Our curated marketplace offers premium blocks and templates
                designed to save time and ensure consistency across your admin
                projects.
              </p>
            </div>

            <ul className="grid gap-4 sm:grid-cols-2">
              {mainFeatures.map((feature, index) => (
                <li
                  className="group flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-accent/5"
                  key={index}
                >
                  <div className="mt-0.5 flex shrink-0 items-center justify-center">
                    <feature.icon
                      aria-hidden="true"
                      className="size-5 text-primary"
                    />
                  </div>
                  <div>
                    <h3 className="font-medium text-foreground">
                      {feature.title}
                    </h3>
                    <p className="mt-1 text-muted-foreground text-sm">
                      {feature.description}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex flex-col gap-4 pe-4 pt-2 sm:flex-row">
              <Button className="cursor-pointer" size="lg">
                <a
                  className="flex items-center"
                  href="https://shadcnstore.com/templates"
                >
                  Browse Templates
                  <ArrowRight aria-hidden="true" className="ms-2 size-4" />
                </a>
              </Button>
              <Button className="cursor-pointer" size="lg" variant="outline">
                <a href="https://shadcnstore.com/blocks">View Components</a>
              </Button>
            </div>
          </div>
        </div>

        {/* Second Feature Section - Flipped Layout */}
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-8 xl:gap-16">
          {/* Left Content */}
          <div className="order-2 space-y-6 lg:order-1">
            <div className="space-y-4">
              <h3 className="text-balance font-semibold text-2xl tracking-tight sm:text-3xl">
                Built for modern development workflows
              </h3>
              <p className="text-pretty text-base text-muted-foreground">
                Every component follows best practices with TypeScript,
                responsive design, and clean code architecture that integrates
                seamlessly into your projects.
              </p>
            </div>

            <ul className="grid gap-4 sm:grid-cols-2">
              {secondaryFeatures.map((feature, index) => (
                <li
                  className="group flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-accent/5"
                  key={index}
                >
                  <div className="mt-0.5 flex shrink-0 items-center justify-center">
                    <feature.icon
                      aria-hidden="true"
                      className="size-5 text-primary"
                    />
                  </div>
                  <div>
                    <h3 className="font-medium text-foreground">
                      {feature.title}
                    </h3>
                    <p className="mt-1 text-muted-foreground text-sm">
                      {feature.description}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex flex-col gap-4 pe-4 pt-2 sm:flex-row">
              <Button className="cursor-pointer" size="lg">
                <a className="flex items-center" href="#">
                  View Documentation
                  <ArrowRight aria-hidden="true" className="ms-2 size-4" />
                </a>
              </Button>
              <Button className="cursor-pointer" size="lg" variant="outline">
                <a
                  href="https://github.com/silicondeck/shadcn-dashboard-landing-template"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  GitHub Repository
                </a>
              </Button>
            </div>
          </div>

          {/* Right Image */}
          <Image3D
            alt="Performance dashboard"
            className="order-1 lg:order-2"
            darkSrc="/feature-2-dark.png"
            direction="right"
            lightSrc="/feature-2-light.png"
          />
        </div>
      </div>
    </section>
  );
}
