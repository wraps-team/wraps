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
    ? "flex min-h-screen items-center justify-center"
    : "flex h-full items-center justify-center pt-8";

  return (
    <div className={containerClass}>
      <Loader2
        className={cn(
          "animate-spin text-primary",
          sizeClasses[size],
          className
        )}
      />
    </div>
  );
}
