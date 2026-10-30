"use client";

import Image from "next/image";
import { assetUrl, cn } from "@/lib/utils";

type Image3DProps = {
  lightSrc: string;
  darkSrc: string;
  alt: string;
  className?: string;
  direction?: "left" | "right";
};

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
      <div className="perspective-distant transform-3d size-full">
        {/* Animated background glow */}
        <div className="sm:-inset-8 absolute rounded-3xl bg-linear-to-r from-brand/10 via-brand/5 to-brand/10 opacity-0 blur-2xl transition-all duration-1000 group-hover:opacity-100" />

        {/* Main 3D container */}
        <div
          className={cn(
            "transform-3d group-hover:translate-z-16 relative size-full transition-all duration-700 ease-out group-hover:rotate-x-8",
            isRight ? "group-hover:-rotate-y-12" : "group-hover:rotate-y-12"
          )}
        >
          {/* The image itself, with no card, shadow or ring around it: product
              media sits straight on the page across wraps.dev. */}
          <div className="relative z-10 size-full overflow-hidden">
            {/* Shimmer effect */}
            <div
              className={cn(
                "-skew-x-12 pointer-events-none absolute inset-0 z-20 bg-linear-to-r from-transparent via-white/20 to-transparent transition-transform duration-1000 ease-out",
                isRight
                  ? "group-hover:-translate-x-full translate-x-full"
                  : "-translate-x-full group-hover:translate-x-full"
              )}
            />

            {/* Theme-aware images */}
            <Image
              alt={`${alt} - Light Mode`}
              className={cn(
                "block size-full object-cover transition-transform duration-700 group-hover:scale-105 dark:hidden",
                isRight ? "object-center" : "object-left"
              )}
              fill
              loading="lazy"
              sizes="(max-width: 768px) 100vw, 50vw"
              src={assetUrl(lightSrc)}
            />

            <Image
              alt={`${alt} - Dark Mode`}
              className={cn(
                "hidden size-full object-cover transition-transform duration-700 group-hover:scale-105 dark:block",
                isRight ? "object-center" : "object-left"
              )}
              fill
              loading="lazy"
              sizes="(max-width: 768px) 100vw, 50vw"
              src={assetUrl(darkSrc)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
