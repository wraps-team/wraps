import { BoxLabel } from "@/app/landing/components/flow-primitives";

const styles = {
  tip: "border-success/50",
  warning: "border-warning/50",
  danger: "border-destructive/50",
};

const iconStyles = {
  tip: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
};

export const InfoCard = ({
  type = "tip",
  icon: Icon,
  title,
  children,
}: {
  type?: "tip" | "warning" | "danger";
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) => (
  <div className={`relative my-6 border px-4 pt-5 pb-4 ${styles[type]}`}>
    <BoxLabel tone="text-muted-foreground">{type}</BoxLabel>
    <div
      className={`mb-2 flex items-center gap-2 font-semibold ${iconStyles[type]}`}
    >
      <Icon className="h-4 w-4" />
      {title}
    </div>
    <div className="text-foreground/80 text-sm">{children}</div>
  </div>
);
