import { cn } from "@wraps/ui/lib/utils";
import { Check, X } from "lucide-react";

type ChecklistItemProps = {
  label: string;
  detail?: string;
  pass: boolean;
};

export function ChecklistItem({ label, detail, pass }: ChecklistItemProps) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
          pass
            ? "bg-success/15 text-success"
            : "bg-destructive/15 text-destructive"
        )}
      >
        {pass ? (
          <Check aria-hidden="true" className="size-3.5" />
        ) : (
          <X aria-hidden="true" className="size-3.5" />
        )}
        <span className="sr-only">{pass ? "Pass" : "Fail"}:</span>
      </span>
      <div className="min-w-0 space-y-0.5">
        <p className="font-medium text-sm leading-tight">{label}</p>
        {detail ? (
          <p className="text-muted-foreground text-xs leading-snug">{detail}</p>
        ) : null}
      </div>
    </li>
  );
}
