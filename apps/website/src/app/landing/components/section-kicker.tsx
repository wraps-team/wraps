import { cn } from "@/lib/utils";

/**
 * Sans uppercase section label preceded by a short orange rule.
 * The quiet "kicker" used at the top of every landing section header.
 */
export function SectionKicker({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "mb-5 inline-flex items-center gap-2.5 font-sans font-semibold text-muted-foreground text-xs uppercase tracking-eyebrow",
        className
      )}
    >
      <span aria-hidden="true" className="h-px w-6 bg-brand" />
      {children}
    </span>
  );
}
