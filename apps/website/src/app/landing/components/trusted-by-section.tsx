"use client";

import type * as React from "react";

function GridPattern() {
  return (
    <svg
      className="absolute inset-0 size-full opacity-4 dark:opacity-3"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern
          height="32"
          id="trusted-by-grid"
          patternUnits="userSpaceOnUse"
          width="32"
        >
          <path
            d="M0 32V0h32"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
          />
        </pattern>
      </defs>
      <rect fill="url(#trusted-by-grid)" height="100%" width="100%" />
    </svg>
  );
}

function DotGrid() {
  const rows = 8;
  const cols = 12;

  return (
    <div className="absolute -right-4 -top-4">
      <div className="grid grid-cols-12 gap-3">
        {Array.from({ length: rows * cols }).map((_, i) => {
          const row = Math.floor(i / cols);
          const col = i % cols;

          // Top-right corner: fade as we go down-left
          const distance = (row + (cols - 1 - col)) / (rows + cols - 2);
          const opacity = Math.max(0, 1 - distance * 1.2);

          if (opacity <= 0.05) {
            return <div className="size-1" key={i} />;
          }

          return (
            <div
              className="size-1 rounded-full bg-brand opacity-(--dot-opacity)"
              key={i}
              style={{ "--dot-opacity": opacity * 0.5 } as React.CSSProperties}
            />
          );
        })}
      </div>
    </div>
  );
}

export function TrustedBySection() {
  return (
    <section className="relative overflow-hidden pt-12 pb-6 sm:pt-16 sm:pb-8">
      {/* Background Grid */}
      <GridPattern />

      {/* Top-left Dot Grid */}
      <DotGrid />

      {/* <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn className="mb-8 text-center sm:mb-10">
          <p className="mb-2 font-medium text-brand-text text-sm">Built On</p>
          <h2 className="font-bold text-xl text-foreground sm:text-2xl">
            Battle-tested infrastructure
          </h2>
        </FadeIn>

        <StaggerContainer
          className="flex flex-wrap items-center justify-center gap-8 sm:gap-12 lg:gap-16"
          staggerDelay={0.15}
        >
          <StaggerItem>
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  aria-label="Learn more about Pulumi"
                  className="group transition-opacity hover:opacity-70"
                  href="https://www.pulumi.com"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <PulumiLogo className="h-12 w-auto text-muted-foreground transition-colors group-hover:text-foreground sm:h-14" />
                </a>
              </TooltipTrigger>
              <TooltipContent>Pulumi</TooltipContent>
            </Tooltip>
          </StaggerItem>

          <StaggerItem>
            <AWSWithServices />
          </StaggerItem>

          <StaggerItem>
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  aria-label="Learn more about Vercel"
                  className="group transition-opacity hover:opacity-70"
                  href="https://vercel.com"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <VercelLogo className="h-8 w-auto text-muted-foreground transition-colors group-hover:text-foreground sm:h-10" />
                </a>
              </TooltipTrigger>
              <TooltipContent>Vercel</TooltipContent>
            </Tooltip>
          </StaggerItem>
        </StaggerContainer>
      </div> */}
    </section>
  );
}
