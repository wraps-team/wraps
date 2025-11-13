"use client";

import { Cloud, Github, Lock, Package, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CardDecorator } from "@/components/ui/card-decorator";

const values = [
  {
    icon: Package,
    title: "Infrastructure Wrappers",
    description:
      "We wrap AWS services in beautiful developer experiences. Same power, 10x better DX.",
  },
  {
    icon: Lock,
    title: "Zero Lock-In",
    description:
      "Infrastructure stays in your AWS account. Stop paying us, keep using AWS. Your choice, always.",
  },
  {
    icon: Cloud,
    title: "Your AWS Account",
    description:
      "Deploy to your account, pay AWS directly. You own the infrastructure and data. We just make it easy.",
  },
  {
    icon: Zap,
    title: "SaaS-Quality DX",
    description:
      "One-command deployments, beautiful dashboards, clean APIs. AWS power with delightful developer experience.",
  },
];

export function AboutSection() {
  return (
    <section className="py-24 sm:py-32" id="about">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto mb-16 max-w-4xl text-center">
          <Badge className="mb-4" variant="outline">
            Our Mission
          </Badge>
          <h2 className="mb-6 font-bold text-3xl tracking-tight sm:text-4xl">
            The Best of AWS and SaaS, None of the Downsides
          </h2>
          <p className="mb-8 text-lg text-muted-foreground">
            Wraps brings SaaS-quality developer experience to AWS
            infrastructure. Deploy to your own AWS account, pay AWS directly,
            and keep full control. We're building the infrastructure layer the
            cloud deserves.
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
              Open source. Forever free local console. Deploy in 30 seconds.
            </span>
          </div>
          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <Button asChild className="cursor-pointer" size="lg">
              <a
                href="https://github.com/wraps-team/wraps"
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
              <a href="#pricing">View Pricing</a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
