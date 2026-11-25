const styles = {
  tip: "border-success",
  warning: "border-warning",
  danger: "border-destructive",
};

const iconStyles = {
  tip: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
};

const labels = {
  tip: "Tip",
  warning: "Warning",
  danger: "Important",
};

/** The label cuts the border, so its fill must match what the card sits on. */
const surfaces = {
  background: "bg-background",
  card: "bg-card",
};

export const InfoCard = ({
  type = "tip",
  icon: Icon,
  title,
  surface = "background",
  children,
}: {
  type?: "tip" | "warning" | "danger";
  icon: React.ElementType;
  title: string;
  /** What the card sits on: the page (default) or inside a `Card`. */
  surface?: keyof typeof surfaces;
  children: React.ReactNode;
}) => (
  <div className={`relative my-6 border px-4 pt-5 pb-4 ${styles[type]}`}>
    <span
      className={`absolute -top-2.5 left-3 px-2 font-sans font-semibold text-2xs text-muted-foreground uppercase tracking-eyebrow ${surfaces[surface]}`}
    >
      {labels[type]}
    </span>
    <div
      className={`mb-2 flex items-center gap-2 font-semibold ${iconStyles[type]}`}
    >
      <Icon className="h-4 w-4" />
      {title}
    </div>
    <div className="text-foreground/80 text-sm">{children}</div>
  </div>
);
