"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { CheckIcon, CopyIcon } from "lucide-react";
import {
  AnimatePresence,
  type HTMLMotionProps,
  motion,
  useReducedMotion,
} from "motion/react";
import * as React from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        muted: "bg-muted text-muted-foreground",
        destructive:
          "bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
      },
      size: {
        default: "size-8 rounded-lg [&_svg]:size-4",
        sm: "size-6 [&_svg]:size-3",
        md: "size-10 rounded-lg [&_svg]:size-5",
        lg: "size-12 rounded-xl [&_svg]:size-6",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

type CopyButtonProps = Omit<HTMLMotionProps<"button">, "children" | "onCopy"> &
  VariantProps<typeof buttonVariants> & {
    content?: string;
    delay?: number;
    /** Called after successful copy. Return false to prevent copy action. */
    onCopy?: (content: string) => undefined | boolean;
    isCopied?: boolean;
    onCopyChange?: (isCopied: boolean) => void;
  };

function CopyButton({
  content,
  className,
  size,
  variant,
  delay = 3000,
  onClick,
  onCopy,
  isCopied,
  onCopyChange,
  ...props
}: CopyButtonProps) {
  const [localIsCopied, setLocalIsCopied] = React.useState(isCopied ?? false);
  const shouldReduceMotion = useReducedMotion();
  const Icon = localIsCopied ? CheckIcon : CopyIcon;

  React.useEffect(() => {
    setLocalIsCopied(isCopied ?? false);
  }, [isCopied]);

  const handleIsCopied = React.useCallback(
    (isCopied: boolean) => {
      setLocalIsCopied(isCopied);
      onCopyChange?.(isCopied);
    },
    [onCopyChange]
  );

  const handleCopy = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (isCopied) {
        return;
      }
      if (content) {
        // Call onCopy first to allow preventing the copy action
        const shouldCopy = onCopy?.(content);
        if (shouldCopy === false) {
          onClick?.(e);
          return;
        }
        navigator.clipboard
          .writeText(content)
          .then(() => {
            handleIsCopied(true);
            setTimeout(() => handleIsCopied(false), delay);
          })
          .catch(() => {
            /*
             * audit L4: this was a `console.error` in a production code path
             * (the repo logs through Pino, and a client component has no
             * Pino), and the user was told nothing at all - the icon simply
             * never became a checkmark. A denied clipboard permission or a
             * non-secure origin is the common cause and neither is something
             * the user can act on without being told it happened.
             */
            toast.error("Couldn't copy to clipboard", {
              description:
                "Your browser blocked clipboard access. Select the text and copy it manually.",
            });
          });
      }
      onClick?.(e);
    },
    [isCopied, content, delay, onClick, onCopy, handleIsCopied]
  );

  /*
   * audit H3 (WCAG 4.1.2, Level A): the button's only child is an SVG, so
   * without a name of its own it had none at all - a screen reader announced
   * "button", once per instance, and the contacts table renders 50 of them.
   * The name belongs to the caller, which is the only side that knows what is
   * being copied ("Copy ada@example.com"); this generic fallback is the floor,
   * not the goal, and is applied after the prop spread so a caller's own
   * `aria-label` always wins.
   */
  const accessibleName = props["aria-label"] ?? "Copy";

  return (
    <>
      <motion.button
        className={cn(buttonVariants({ variant, size }), className)}
        data-slot="copy-button"
        onClick={handleCopy}
        whileHover={shouldReduceMotion ? undefined : { scale: 1.05 }}
        whileTap={shouldReduceMotion ? undefined : { scale: 0.95 }}
        {...(props as any)}
        aria-label={accessibleName}
      >
        <AnimatePresence mode="wait">
          <motion.span
            animate={{ scale: 1 }}
            data-slot="copy-button-icon"
            exit={{ scale: 0 }}
            initial={{ scale: 0 }}
            key={localIsCopied ? "check" : "copy"}
            transition={{ duration: shouldReduceMotion ? 0 : 0.15 }}
          >
            <Icon />
          </motion.span>
        </AnimatePresence>
      </motion.button>
      {/*
        audit H3: success was conveyed only by the icon swapping to a
        checkmark, which is nothing to a screen reader - the copy either
        happened or it didn't and there was no way to tell. A sibling rather
        than a child of the button: `sr-only` is absolutely positioned, so it
        stays out of the caller's flex layout, and a live region inside a
        control is not reliably announced.
      */}
      <span
        aria-live="polite"
        className="sr-only"
        data-slot="copy-button-status"
      >
        {localIsCopied ? "Copied" : ""}
      </span>
    </>
  );
}

export { CopyButton, buttonVariants, type CopyButtonProps };
