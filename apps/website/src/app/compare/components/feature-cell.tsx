import { Check, Minus, X } from "lucide-react";

type FeatureValue = boolean | "yes" | "no" | "partial" | string;

/**
 * Renders a feature comparison cell with consistent icon/text treatment.
 * Supports boolean, "yes"/"no"/"partial" strings, and free-text values.
 */
export function FeatureCell({ value }: { value: FeatureValue }) {
  if (value === true || value === "yes") {
    return <Check aria-label="Yes" className="size-4 text-success" />;
  }
  if (value === false || value === "no") {
    return <X aria-label="No" className="size-4 text-muted-foreground" />;
  }
  if (value === "partial") {
    return <Minus aria-label="Partial" className="size-4 text-brand-text" />;
  }
  return <span className="text-muted-foreground text-sm">{value}</span>;
}
