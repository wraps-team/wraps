"use client";

import { assetUrl, cn } from "@/lib/utils";

interface Image3DProps {
  lightSrc: string;
  darkSrc: string;
  alt: string;
  className?: string;
  direction?: "left" | "right";
}

export function Image3D({
  lightSrc,
  darkSrc,
  alt,
  className,
  direction = "left",
}: Image3DProps) {
  const isRight = direction === "right";

  return (
    <div className={cn("group relative aspect-4/3 w-full", className)}>
      <div className="perspective-distant transform-3d">
        {/* Animated background glow */}
        <div className="sm:-inset-8 absolute rounded-3xl bg-linear-to-r from-primary/10 via-blue-500/10 to-purple-500/10 opacity-0 blur-2xl transition-all duration-1000 group-hover:opacity-100" />

        {/* Main 3D container */}
        <div className="transform-3d group-hover:translate-z-16 relative size-full transition-all duration-700 ease-out group-hover:rotate-x-8 group-hover:rotate-y-12">
          {/* Depth layers for 3D effect */}
          <div className="-translate-z-8 absolute inset-0 translate-x-2 translate-y-4 rounded-2xl">
            <div className="size-full rounded-2xl border border-primary/30 bg-linear-to-br from-primary/10 via-background/40 to-secondary/10 shadow-xl" />
          </div>

          {/* Main image container */}
          <div className="relative z-10 size-full overflow-hidden rounded-2xl shadow-2xl shadow-primary/20">
            {/* Shimmer effect */}
            <div
              className={cn(
                "-skew-x-12 pointer-events-none absolute inset-0 z-20 bg-linear-to-r from-transparent via-white/20 to-transparent transition-transform duration-1000 ease-out",
                isRight
                  ? "group-hover:-translate-x-full translate-x-full"
                  : "-translate-x-full group-hover:translate-x-full"
              )}
            />

            {/* Content fade mask */}
            <div
              className={cn(
                "pointer-events-none absolute inset-0 z-15",
                isRight
                  ? "bg-linear-to-l from-0% from-background via-15% via-background/85 to-40% to-transparent"
                  : "bg-linear-to-r from-0% from-background via-15% via-background/85 to-40% to-transparent"
              )}
            />

            {/* Theme-aware images */}
            <img
              alt={`${alt} - Light Mode`}
              className={cn(
                "block size-full object-cover transition-transform duration-700 group-hover:scale-105 dark:hidden",
                isRight ? "object-center" : "object-left"
              )}
              decoding="async"
              loading="lazy"
              src={assetUrl(lightSrc)}
            />

            <img
              alt={`${alt} - Dark Mode`}
              className={cn(
                "hidden size-full object-cover transition-transform duration-700 group-hover:scale-105 dark:block",
                isRight ? "object-center" : "object-left"
              )}
              decoding="async"
              loading="lazy"
              src={assetUrl(darkSrc)}
            />

            {/* Border highlight */}
            <div className="absolute inset-0 rounded-2xl ring-1 ring-white/20 transition-all duration-500 group-hover:ring-primary/40 dark:ring-white/10" />
          </div>
        </div>
      </div>
    </div>
  );
}
