import { cn } from "@wraps/ui/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-accent motion-reduce:animate-none",
        className
      )}
      data-slot="skeleton"
      {...props}
    />
  );
}

export { Skeleton };
