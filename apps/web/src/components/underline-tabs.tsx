import { Badge } from "@wraps/ui/components/ui/badge";
import { type KeyboardEvent, useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Underline tabs: a baseline rule under the row, and a 2px brand underline
 * under the active tab. The hub's section links and the review lists share
 * this look. Colour comes from theme tokens only.
 */
export function underlineTabClass(active: boolean): string {
  return cn(
    "inline-flex items-center gap-2 whitespace-nowrap rounded-none border-b-2 px-1 pt-1 pb-2.5 font-medium text-sm transition-colors focus-visible:outline-1 focus-visible:outline-ring focus-visible:ring-3 focus-visible:ring-ring/50",
    active
      ? "border-brand text-foreground"
      : "border-transparent text-muted-foreground hover:text-foreground"
  );
}

export type UnderlineTab<T extends string> = {
  value: T;
  label: string;
  /** A count chip after the label. Null or absent shows none. */
  count?: number | null;
  /** The chip's variant. Defaults to secondary. */
  countVariant?: "secondary" | "warning";
};

const NAV_KEYS = ["ArrowLeft", "ArrowRight", "Home", "End"];

/**
 * A tab list that selects on click and on the arrow keys, like a Radix tab
 * list in automatic mode. It is plain markup so the look can be underline
 * without restyling the shared tabs component.
 */
export function UnderlineTabs<T extends string>({
  label,
  tabs,
  value,
  onValueChange,
  idPrefix,
}: {
  label: string;
  tabs: UnderlineTab<T>[];
  value: T;
  onValueChange: (next: T) => void;
  idPrefix?: string;
}) {
  const fallbackId = useId();
  const prefix = idPrefix ?? fallbackId;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!NAV_KEYS.includes(event.key)) {
      return;
    }
    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    );
    const current = buttons.indexOf(
      document.activeElement as HTMLButtonElement
    );
    if (current === -1) {
      return;
    }
    event.preventDefault();
    let next: number;
    if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = buttons.length - 1;
    } else {
      const step = event.key === "ArrowRight" ? 1 : -1;
      next = (current + step + buttons.length) % buttons.length;
    }
    buttons[next]?.focus();
    buttons[next]?.click();
  };

  return (
    <div
      aria-label={label}
      className="flex w-full flex-wrap gap-x-6 gap-y-2 border-b"
      onKeyDown={onKeyDown}
      role="tablist"
    >
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            aria-selected={active}
            className={underlineTabClass(active)}
            id={`${prefix}-${tab.value}`}
            key={tab.value}
            onClick={() => onValueChange(tab.value)}
            role="tab"
            tabIndex={active ? 0 : -1}
            type="button"
          >
            {tab.label}
            {tab.count === null || tab.count === undefined ? null : (
              <>
                {" "}
                <Badge variant={tab.countVariant ?? "secondary"}>
                  {tab.count}
                </Badge>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
