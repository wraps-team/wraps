"use client";

import { Cloud } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Docker } from "@/components/ui/svgs/docker";
import { Nodejs } from "@/components/ui/svgs/nodejs";
import { Pnpm } from "@/components/ui/svgs/pnpm";
import { Pulumi } from "@/components/ui/svgs/pulumi";
import { ReactLight } from "@/components/ui/svgs/reactLight";
import { Tailwindcss } from "@/components/ui/svgs/tailwindcss";
import { TurborepoIconLight } from "@/components/ui/svgs/turborepoIconLight";
import { Typescript } from "@/components/ui/svgs/typescript";
import { Vercel } from "@/components/ui/svgs/vercel";
import { Vitejs } from "@/components/ui/svgs/vitejs";
import { Vitest } from "@/components/ui/svgs/vitest";

interface TechItem {
  name: string;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  color: string;
}

interface TechCategory {
  category: string;
  description: string;
  technologies: TechItem[];
}

interface Platform {
  name: string;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  description: string;
}

const techCategories: TechCategory[] = [
  {
    category: "Frontend",
    description: "Beautiful, type-safe dashboard built with modern tooling",
    technologies: [
      {
        name: "React",
        Icon: ReactLight,
        color: "#61DAFB",
      },
      {
        name: "TypeScript",
        Icon: Typescript,
        color: "#3178C6",
      },
      {
        name: "Vite",
        Icon: Vitejs,
        color: "#646CFF",
      },
      {
        name: "Tailwind CSS",
        Icon: Tailwindcss,
        color: "#06B6D4",
      },
      {
        name: "shadcn/ui",
        Icon: () => (
          <svg fill="currentColor" viewBox="0 0 256 256">
            <rect fill="none" height="256" width="256" />
            <line
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="16"
              x1="208"
              x2="128"
              y1="128"
              y2="208"
            />
            <line
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="16"
              x1="192"
              x2="40"
              y1="40"
              y2="192"
            />
          </svg>
        ),
        color: "#000000",
      },
    ],
  },
  {
    category: "AWS Infrastructure",
    description: "Production-grade AWS services deployed to your account",
    technologies: [
      {
        name: "AWS SES",
        Icon: Cloud,
        color: "#FF9900",
      },
      {
        name: "DynamoDB",
        Icon: Cloud,
        color: "#FF9900",
      },
      {
        name: "Lambda",
        Icon: Cloud,
        color: "#FF9900",
      },
      {
        name: "EventBridge",
        Icon: Cloud,
        color: "#FF9900",
      },
    ],
  },
  {
    category: "Infrastructure as Code",
    description: "Automated deployment and configuration management",
    technologies: [
      {
        name: "Pulumi",
        Icon: Pulumi,
        color: "#8A3391",
      },
      {
        name: "Node.js",
        Icon: Nodejs,
        color: "#339933",
      },
    ],
  },
  {
    category: "Developer Tools",
    description: "Best-in-class tooling for development and testing",
    technologies: [
      {
        name: "Turborepo",
        Icon: TurborepoIconLight,
        color: "#EF4444",
      },
      {
        name: "pnpm",
        Icon: Pnpm,
        color: "#F69220",
      },
      {
        name: "Vitest",
        Icon: Vitest,
        color: "#6E9F18",
      },
      {
        name: "Biome",
        Icon: () => (
          <svg fill="currentColor" viewBox="0 0 128 128">
            <path d="M61.37 76.5H33.13c-.43 0-.74.3-.74.75 0 .43.31.74.74.74h28.24c.43 0 .74-.31.74-.74 0-.45-.31-.75-.74-.75zM61.37 85.57H33.13c-.43 0-.74.31-.74.75s.31.75.74.75h28.24c.43 0 .74-.31.74-.75s-.31-.75-.74-.75zM61.37 94.65H33.13c-.43 0-.74.31-.74.75s.31.75.74.75h28.24c.43 0 .74-.31.74-.75s-.31-.75-.74-.75zM94.13 76.5H65.89c-.43 0-.74.3-.74.75 0 .43.31.74.74.74h28.24c.43 0 .74-.31.74-.74 0-.45-.31-.75-.74-.75zM94.13 85.57H65.89c-.43 0-.74.31-.74.75s.31.75.74.75h28.24c.43 0 .74-.31.74-.75s-.31-.75-.74-.75zM94.13 94.65H65.89c-.43 0-.74.31-.74.75s.31.75.74.75h28.24c.43 0 .74-.31.74-.75s-.31-.75-.74-.75z" />
          </svg>
        ),
        color: "#60A5FA",
      },
    ],
  },
];

const supportedPlatforms: Platform[] = [
  {
    name: "Vercel",
    Icon: Vercel,
    description: "OIDC authentication with zero-config",
  },
  {
    name: "AWS Lambda",
    Icon: Cloud,
    description: "Native IAM role support",
  },
  {
    name: "AWS ECS",
    Icon: Cloud,
    description: "Container-based deployments",
  },
  {
    name: "AWS EC2",
    Icon: Cloud,
    description: "Traditional server deployments",
  },
  {
    name: "Node.js",
    Icon: Nodejs,
    description: "Any Node.js runtime",
  },
  {
    name: "Docker",
    Icon: Docker,
    description: "Containerized applications",
  },
];

export function TechStackSection() {
  return (
    <section className="bg-background py-24 sm:py-32" id="tech-stack">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <Badge className="mb-4" variant="outline">
            Technology Stack
          </Badge>
          <h2 className="mb-4 font-bold text-3xl tracking-tight sm:text-4xl">
            Built with Modern, Production-Ready Tools
          </h2>
          <p className="text-lg text-muted-foreground">
            Wraps leverages best-in-class technologies to deliver a reliable,
            performant, and developer-friendly email infrastructure platform.
          </p>
        </div>

        {/* Tech Categories Grid */}
        <div className="mb-20 grid gap-8 md:grid-cols-2">
          {techCategories.map((category) => (
            <div
              className="rounded-xl border bg-card p-6 transition-shadow hover:shadow-lg"
              key={category.category}
            >
              <h3 className="mb-2 font-semibold text-xl">
                {category.category}
              </h3>
              <p className="mb-6 text-muted-foreground text-sm">
                {category.description}
              </p>
              <div className="flex flex-wrap gap-4">
                {category.technologies.map((tech) => (
                  <div
                    className="group flex items-center gap-3 rounded-lg border bg-background p-3 transition-all hover:scale-105 hover:border-primary/50 hover:shadow-md"
                    key={tech.name}
                  >
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded"
                      style={{
                        backgroundColor: `${tech.color}15`,
                      }}
                    >
                      <tech.Icon
                        className="h-5 w-5 object-contain"
                        style={{
                          color: tech.color,
                        }}
                      />
                    </div>
                    <span className="font-medium text-sm">{tech.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Supported Platforms Section */}
        <div className="mx-auto max-w-4xl">
          <div className="mb-8 text-center">
            <Badge className="mb-4" variant="outline">
              Deployment Platforms
            </Badge>
            <h3 className="mb-2 font-bold text-2xl tracking-tight sm:text-3xl">
              Deploy Anywhere You Need
            </h3>
            <p className="text-muted-foreground">
              Use Wraps with your favorite hosting platform or runtime
              environment
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {supportedPlatforms.map((platform) => (
              <div
                className="group flex items-start gap-3 rounded-lg border bg-card p-4 transition-all hover:border-primary/50 hover:shadow-md"
                key={platform.name}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <platform.Icon className="h-6 w-6 object-contain" />
                </div>
                <div className="flex-1">
                  <h4 className="mb-1 font-semibold text-sm">
                    {platform.name}
                  </h4>
                  <p className="text-muted-foreground text-xs">
                    {platform.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="mt-12 text-center">
          <p className="text-muted-foreground text-sm">
            All open source and built with love by the Wraps team
          </p>
        </div>
      </div>
    </section>
  );
}
