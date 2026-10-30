import { cn } from "@wraps/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

const textareaVariants = cva(
  "field-sizing-content flex min-h-16 w-full px-3 py-2 text-base outline-none transition-[color,box-shadow] placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:ring-destructive/40",
  {
    variants: {
      variant: {
        default:
          "rounded-md border border-input bg-transparent focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring",
        seamless:
          "rounded-xl rounded-b-none border-none bg-foreground/5 focus-visible:ring-0",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

function Textarea({
  className,
  variant,
  ...props
}: React.ComponentProps<"textarea"> & VariantProps<typeof textareaVariants>) {
  return (
    <textarea
      className={cn(textareaVariants({ variant }), className)}
      data-slot="textarea"
      {...props}
    />
  );
}

export { Textarea, textareaVariants };
