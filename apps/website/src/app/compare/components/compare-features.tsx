import {
  Check,
  ChevronRight,
  Circle,
  type LucideIcon,
  Minus,
  X,
} from "lucide-react";

/** `na` is for "not applicable" and "not documented": a grey dot, never a claim. */
export type FeatureStatus = "yes" | "no" | "partial" | "na";

export type FeatureCellValue = {
  status: FeatureStatus;
  /** Shown beside the dot. Defaults to the status word. */
  text?: string;
};

export type FeatureRow = {
  name: string;
  competitor: FeatureCellValue;
  wraps: FeatureCellValue;
};

export type FeatureGroup = {
  title: string;
  rows?: FeatureRow[];
  /** Free-form content for a group that is prose, not rows. */
  children?: React.ReactNode;
};

const MARK: Record<FeatureStatus, { Icon: LucideIcon; tone: string }> = {
  yes: { Icon: Check, tone: "text-success" },
  no: { Icon: X, tone: "text-muted-foreground" },
  partial: { Icon: Minus, tone: "text-warning" },
  na: { Icon: Circle, tone: "text-muted-foreground" },
};

const WORD: Record<FeatureStatus, string> = {
  yes: "Yes",
  no: "No",
  partial: "Partial",
  na: "Not applicable",
};

/**
 * Status never rests on colour: each status has its own icon shape (check,
 * cross, dash, hollow circle), and a custom cell also carries the status word
 * for screen readers ("Partial: Available on qualifying plans").
 */
function Cell({ label, value }: { label: string; value: FeatureCellValue }) {
  const { Icon, tone } = MARK[value.status];
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <Icon
        aria-hidden="true"
        className={`mt-0.5 size-4 shrink-0 ${tone}`}
        strokeWidth={value.status === "na" ? 1.5 : 2.5}
      />
      <span className="min-w-0 text-sm [overflow-wrap:anywhere]">
        <span className="font-semibold text-muted-foreground text-xs uppercase tracking-eyebrow sm:sr-only">
          {label}:{" "}
        </span>
        {value.text ? (
          <>
            <span className="sr-only">{WORD[value.status]}: </span>
            {value.text}
          </>
        ) : (
          WORD[value.status]
        )}
      </span>
    </div>
  );
}

/** One collapsible group: a native <details>, keyboard and screen-reader ready. */
export function CompareDisclosure({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  count?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      className="group min-w-0 border-b last:border-b-0"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4 font-semibold outline-none marker:hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none"
        />
        <span className="min-w-0 flex-1">{title}</span>
        {count ? (
          <span className="shrink-0 font-normal text-muted-foreground text-xs">
            {count}
          </span>
        ) : null}
      </summary>
      <div className="min-w-0 px-4 pb-4">{children}</div>
    </details>
  );
}

/**
 * Grouped feature rows with yes / no / partial dots. Put the marketing groups
 * first and the developer group last. The first group opens by default.
 * `min-width: 0` on every item keeps long cells from widening the page.
 */
export function CompareFeatures({
  competitor,
  groups,
}: {
  competitor: string;
  groups: FeatureGroup[];
}) {
  return (
    <div className="min-w-0 border">
      {groups.map((group, index) => (
        <CompareDisclosure
          count={group.rows ? `${group.rows.length} rows` : undefined}
          defaultOpen={index === 0}
          key={group.title}
          title={group.title}
        >
          {group.rows ? (
            <div>
              <div
                aria-hidden="true"
                className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4 border-b pb-2 font-semibold text-muted-foreground text-xs sm:grid"
              >
                <span>Feature</span>
                <span>{competitor}</span>
                <span className="text-brand-text">Wraps</span>
              </div>
              <ul className="divide-y">
                {group.rows.map((row) => (
                  <li
                    className="grid min-w-0 gap-2 py-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] sm:gap-4"
                    key={row.name}
                  >
                    <span className="min-w-0 font-medium text-sm [overflow-wrap:anywhere]">
                      {row.name}
                    </span>
                    <Cell label={competitor} value={row.competitor} />
                    <Cell label="Wraps" value={row.wraps} />
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            group.children
          )}
        </CompareDisclosure>
      ))}
    </div>
  );
}
