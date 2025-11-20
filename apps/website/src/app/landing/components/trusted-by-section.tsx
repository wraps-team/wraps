"use client";

import { DotPattern } from "@/components/dot-pattern";

const projects = [
  {
    name: "Lilikoi",
    logo: "/lilikoi.png",
    website: "https://lilikoi.io",
  },
  {
    name: "Passel",
    logo: "/passel.webp",
    website: "https://passel.email",
  },
];

export function TrustedBySection() {
  return (
    <section className="relative py-12 sm:py-16">
      {/* Background with transparency */}
      <div className="absolute inset-0 bg-linear-to-r from-secondary/10 via-transparent to-primary/10" />
      <DotPattern className="opacity-60" fadeStyle="circle" size="sm" />

      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mb-8 text-center sm:mb-12">
          <h2 className="font-bold text-2xl text-foreground sm:text-3xl">
            Trusted By
          </h2>
          <p className="mt-2 text-muted-foreground">
            Projects sending emails with Wraps
          </p>
        </div>

        {/* Logos Grid */}
        <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-12 lg:gap-16">
          {projects.map((project) => (
            <a
              key={project.name}
              href={project.website}
              target="_blank"
              rel="noopener noreferrer"
              className="group transition-opacity hover:opacity-80"
              aria-label={`Visit ${project.name}`}
            >
              <div className="flex h-16 items-center sm:h-20">
                <img
                  src={project.logo}
                  alt={`${project.name} logo`}
                  className="h-full w-auto max-w-[120px] object-contain grayscale transition-all group-hover:grayscale-0 sm:max-w-[160px]"
                />
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
