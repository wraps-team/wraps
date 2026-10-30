import { cn } from "@wraps/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

/**
 * A square box whose label sits in its top border, the way wraps.dev labels
 * "YOUR AWS ACCOUNT" in the hero. Panels sit straight on the page: there is no
 * card around them.
 *
 * `own` marks data that lives in the customer's AWS account and that Wraps only
 * reads (SES reputation, the DynamoDB history table, suppression lists). It is
 * the one place the dashboard spends a dashed orange border, so keep it for that
 * meaning; anything Wraps computes or stores uses `default`.
 */
const panelVariants = cva("relative min-w-0 border px-4 pt-6 pb-4", {
  variants: {
    variant: {
      default: "border-border bg-card text-card-foreground",
      own: "border-brand/70 border-dashed bg-brand/5 text-card-foreground",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

const panelLabelVariants = cva(
  "absolute -top-2.5 left-3 flex items-center gap-1 bg-background px-2 font-mono text-2xs uppercase leading-5 tracking-eyebrow",
  {
    variants: {
      variant: {
        default: "text-muted-foreground",
        own: "text-brand-text",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

/**
 * The label's mirror at the right of the top border: a status line or a link or
 * two, short enough to sit on the line. Buttons and anything wider belong in
 * `actions`, which takes a row inside the panel.
 */
const panelMetaClassName =
  "absolute -top-2.5 right-3 flex items-center gap-3 bg-background px-2 leading-5";

type PanelProps = Omit<React.ComponentProps<"section">, "title"> &
  VariantProps<typeof panelVariants> & {
    /** Rendered in the top border. Usually a `<PanelTitle>`, plus an optional info trigger. */
    label: React.ReactNode;
    /** Rendered in the top border, right side. See `panelMetaClassName`. */
    meta?: React.ReactNode;
    /** Muted line at the top of the panel, where a card's description went. */
    description?: React.ReactNode;
    /** Controls at the top right of the panel, where a card's header actions went. */
    actions?: React.ReactNode;
  };

function Panel({
  className,
  variant,
  label,
  meta,
  description,
  actions,
  children,
  ...props
}: PanelProps) {
  return (
    <section
      className={cn(panelVariants({ variant }), className)}
      data-slot="panel"
      data-variant={variant ?? "default"}
      {...props}
    >
      <div className={panelLabelVariants({ variant })} data-slot="panel-label">
        {label}
      </div>
      {meta ? (
        <div className={panelMetaClassName} data-slot="panel-meta">
          {meta}
        </div>
      ) : null}
      {description || actions ? (
        <div
          className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2"
          data-slot="panel-header"
        >
          {description ? (
            <div className="min-w-0 flex-1 text-muted-foreground text-sm">
              {description}
            </div>
          ) : null}
          {actions ? (
            <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
              {actions}
            </div>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/**
 * The heading inside a panel label: a real heading for the outline, set in the
 * label's monospace caps rather than as a page heading. `level` keeps the
 * outline correct where a panel sits under another heading.
 */
function PanelTitle({
  level = 2,
  className,
  ...props
}: React.ComponentProps<"h2"> & { level?: 2 | 3 | 4 }) {
  const Heading = `h${level}` as "h2";
  return (
    <Heading
      className={cn(
        "font-mono font-normal text-2xs leading-5 tracking-eyebrow",
        className
      )}
      data-slot="panel-title"
      {...props}
    />
  );
}

/**
 * The monospace line at the foot of a panel saying where its data came from
 * and how fresh it is, e.g. "Account reputation · all time" / "Updated 2 min ago".
 */
function PanelSource({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "mt-4 flex flex-wrap justify-between gap-x-4 gap-y-1 border-t pt-2.5 font-mono text-muted-foreground text-xs",
        className
      )}
      data-slot="panel-source"
      {...props}
    />
  );
}

export { Panel, PanelSource, PanelTitle, panelVariants };
