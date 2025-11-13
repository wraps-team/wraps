"use client";

import { Code, Crown, Github, Layout, Palette } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CardDecorator } from "@/components/ui/card-decorator";

const values = [
  {
    icon: Code,
    title: "Developer First",
    description:
      "Every component is built with the developer experience in mind, ensuring clean code and easy integration.",
  },
  {
    icon: Palette,
    title: "Design Excellence",
    description:
      "We maintain the highest design standards, following shadcn/ui principles and modern UI patterns.",
  },
  {
    icon: Layout,
    title: "Production Ready",
    description:
      "Battle-tested components used in real applications with proven performance and reliability across different environments.",
  },
  {
    icon: Crown,
    title: "Premium Quality",
    description:
      "Hand-crafted with attention to detail and performance optimization, ensuring exceptional user experience and accessibility.",
  },
];

export function AboutSection() {
  return (
    <section className="py-24 sm:py-32" id="about">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto mb-16 max-w-4xl text-center">
          <Badge className="mb-4" variant="outline">
            About ShadcnStore
          </Badge>
          <h2 className="mb-6 font-bold text-3xl tracking-tight sm:text-4xl">
            Built for developers, by developers
          </h2>
          <p className="mb-8 text-lg text-muted-foreground">
            We&apos;re passionate about creating the best marketplace for
            shadcn/ui components and templates. Our mission is to accelerate
            development and help developers build beautiful admin interfaces
            faster.
          </p>
        </div>

        {/* Modern Values Grid with Enhanced Design */}
        <div className="mb-12 grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 xl:grid-cols-4">
          {values.map((value, index) => (
            <Card className="group py-2 shadow-xs" key={index}>
              <CardContent className="p-8">
                <div className="flex flex-col items-center text-center">
                  <CardDecorator>
                    <value.icon aria-hidden className="h-6 w-6" />
                  </CardDecorator>
                  <h3 className="mt-6 text-balance font-medium">
                    {value.title}
                  </h3>
                  <p className="mt-3 text-muted-foreground text-sm">
                    {value.description}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Call to Action */}
        <div className="mt-16 text-center">
          <div className="mb-6 flex items-center justify-center gap-2">
            <span className="text-muted-foreground">
              ❤️ Made with love for the developer community
            </span>
          </div>
          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <Button asChild className="cursor-pointer" size="lg">
              <a
                href="https://github.com/silicondeck/shadcn-dashboard-landing-template"
                rel="noopener noreferrer"
                target="_blank"
              >
                <Github className="mr-2 h-4 w-4" />
                Star on GitHub
              </a>
            </Button>
            <Button
              asChild
              className="cursor-pointer"
              size="lg"
              variant="outline"
            >
              <a
                href="https://discord.com/invite/XEQhPc9a6p"
                rel="noopener noreferrer"
                target="_blank"
              >
                Join Discord Community
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
