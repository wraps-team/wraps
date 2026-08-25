import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type LoaderProps = {
  size?: "sm" | "md" | "lg";
  className?: string;
  fullScreen?: boolean;
};

export default function Loader({
  size = "md",
  className,
  fullScreen = false,
}: LoaderProps) {
  const sizeClasses = {
    sm: "size-4",
    md: "size-8",
    lg: "size-12",
  };

  const containerClass = fullScreen
    ? "flex min-h-dvh items-center justify-center"
    : "flex h-full items-center justify-center pt-8";

  return (
    // A bare spinning icon is invisible to assistive tech: no role, no name.
    // <output> is an implicit `status` live region; with the visually hidden
    // label it announces the wait instead of nothing at all (WCAG 4.1.3).
    <output className={containerClass}>
      <Loader2
        aria-hidden="true"
        className={cn(
          "animate-spin text-primary",
          sizeClasses[size],
          className
        )}
      />
      <span className="sr-only">Loading...</span>
    </output>
  );
}
