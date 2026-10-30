"use client";

import { cn } from "../lib/utils";

type DotPatternProps = {
  className?: string;
  size?: "sm" | "md" | "lg";
  opacity?: "low" | "medium" | "high";
  fadeStyle?: "ellipse" | "circle" | "none";
};

const sizeMap = {
  sm: "[background-size:12px_12px]",
  md: "[background-size:16px_16px]",
  lg: "[background-size:20px_20px]",
};

const fadeMap = {
  ellipse:
    "[mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,black_70%,transparent_100%)]",
  circle:
    "[mask-image:radial-gradient(circle_at_50%_50%,black_70%,transparent_100%)]",
  none: "",
};

export function DotPattern({
  className,
  size = "md",
  opacity = "medium",
  fadeStyle = "ellipse",
}: DotPatternProps) {
  const opacityMap = {
    low: "opacity-30",
    medium: "opacity-50",
    high: "opacity-70",
  };

  return (
    <div
      className={cn(
        "absolute inset-0 bg-[radial-gradient(var(--border)_1px,transparent_1px)] dark:bg-[radial-gradient(var(--input)_1px,transparent_1px)]",
        sizeMap[size],
        fadeMap[fadeStyle],
        opacityMap[opacity],
        className
      )}
    />
  );
}

export function DotPatternLight({
  className,
  size = "md",
  opacity = "medium",
  fadeStyle = "ellipse",
}: DotPatternProps) {
  const opacityMap = {
    low: "opacity-20",
    medium: "opacity-40",
    high: "opacity-60",
  };

  return (
    <div
      className={cn(
        "absolute inset-0 bg-[radial-gradient(var(--input)_1px,transparent_1px)]",
        sizeMap[size],
        fadeMap[fadeStyle],
        opacityMap[opacity],
        className
      )}
    />
  );
}

export function DotPatternDark({
  className,
  size = "md",
  opacity = "medium",
  fadeStyle = "ellipse",
}: DotPatternProps) {
  const opacityMap = {
    low: "opacity-30",
    medium: "opacity-50",
    high: "opacity-70",
  };

  return (
    <div
      className={cn(
        "absolute inset-0 bg-[radial-gradient(var(--muted-foreground)_1px,transparent_1px)]",
        sizeMap[size],
        fadeMap[fadeStyle],
        opacityMap[opacity],
        className
      )}
    />
  );
}
