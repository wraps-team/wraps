"use client";

import { useQuery } from "@tanstack/react-query";
import { ButtonGroup } from "@wraps/ui/components/ui/button-group";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@wraps/ui/components/ui/chart";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@wraps/ui/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wraps/ui/components/ui/select";
import { Skeleton } from "@wraps/ui/components/ui/skeleton";
import { formatDistance } from "date-fns";
import { CircleAlert, Info, Loader2, RotateCw } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  type ContactAnalytics as ContactAnalyticsData,
  type ContactListHealth,
  getContactAnalytics,
} from "@/actions/contacts-analytics";
import { Button } from "@/components/ui/button";
import { RefreshButton } from "@/components/ui/refresh-button";
import { useIsMobile } from "@/hooks/use-mobile";
import { countYAxisProps } from "@/lib/chart-axis";
import { SERIES_COLOR } from "@/lib/chart-series";
import {
  CONTACTS_TABLE_HEADING_ID,
  type EmailStatus,
  isEmailStatus,
} from "@/lib/contacts";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/utils";
import { captureContactsFilterChanged } from "./lib/analytics";

const chartConfig = {
  count: {
    label: "New Contacts",
    color: SERIES_COLOR.success,
  },
} satisfies ChartConfig;

const TIME_RANGES = [
  { value: "30d", days: 30, label: "30 days", long: "Last 30 days" },
  { value: "7d", days: 7, label: "7 days", long: "Last 7 days" },
] as const;

type TimeRangeValue = (typeof TIME_RANGES)[number]["value"];

/**
 * One height for the plot, the skeleton and the error state.
 *
 * The plot was pinned at 250px beside a 200px text column whose height is
 * data-dependent — `ListHealth` grows a row when anything is suppressed and a
 * line when anything has no email status, and the period tile grows a chip when
 * growth is non-zero — so the column ran roughly 400-500px and left up to 222px
 * of the chart's own grid cell empty. No single height could have fixed that
 * (audit H1); the summary is a horizontal rail now, so the chart owns the full
 * width and this is the only height in play.
 *
 * Shrunk from 260/320: a chart is a supporting figure on a page whose subject is
 * the table underneath it, and on a phone the old height pushed the first
 * contact row well below the fold. The no-activity notice does not use this at
 * all — see NOTICE_HEIGHT.
 */
const PLOT_HEIGHT = "h-[200px] @[540px]/card:h-[280px]";

/**
 * The no-activity notice is one sentence. It used to sit in a full PLOT_HEIGHT
 * box, which made "No new contacts in this period" the largest element on the
 * card. A legible band is enough; there is nothing here to plot.
 */
const NOTICE_HEIGHT = "h-24 @[540px]/card:h-28";

/**
 * "Updated N minutes ago", in a leaf of its own so a clock tick repaints one
 * line of text rather than the whole card. Starting at null keeps the server
 * and first client render identical.
 */
function UpdatedAgo({ generatedAt }: { generatedAt: number }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (now === null) {
    return null;
  }

  return (
    <>
      Updated{" "}
      {formatDistance(new Date(generatedAt), new Date(now), {
        addSuffix: true,
      })}
    </>
  );
}

/**
 * Which population the figures after the divider describe, behind a disclosure.
 *
 * The card mixes two scopes under one time-range toggle: the chart and "New in
 * the last N days" move with the toggle, while the totals, list health and
 * engagement are all-time and organization-wide and do not (audit M4) — pressing
 * "7 days" and watching `Engagement 38.8% opens` sit still reads as a bug. This
 * is reference material rather than a caveat about any one number, so it lives
 * behind a trigger.
 *
 * A popover rather than a tooltip: a tooltip cannot be opened by touch.
 */
function AllTimeScope() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label="What these figures cover"
          className="-my-2 text-muted-foreground"
          size="icon-sm"
          variant="ghost"
        >
          <Info className="size-3.5" />
        </Button>
      </PopoverTrigger>
      {/* Opens upward, into the header's whitespace: anchored below, the panel
          covered the figures it exists to explain. */}
      <PopoverContent align="start" className="w-72 text-sm" side="top">
        <p>
          Contact totals, list health and engagement are all-time figures for
          every contact in this organization.
        </p>
        <p className="mt-2 text-muted-foreground">
          They do not change when you switch the time range — only the chart and
          the new-contact count above are scoped to the selected window.
        </p>
      </PopoverContent>
    </Popover>
  );
}

function Figure({
  label,
  value,
  aside,
  caption,
}: {
  label: ReactNode;
  value: string;
  aside?: ReactNode;
  caption?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1 text-muted-foreground text-xs">
        {label}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="font-semibold text-2xl leading-none tabular-nums">
          {value}
        </span>
        {aside ? <span className="text-sm leading-none">{aside}</span> : null}
      </div>
      {caption ? (
        <p className="mt-1.5 text-muted-foreground text-xs">{caption}</p>
      ) : null}
    </div>
  );
}

/** A `value label` pair on one line, matching the rates row on the emails card. */
function InlineStat({
  value,
  label,
  tone,
}: {
  value: number | string;
  label: string;
  tone?: string;
}) {
  return (
    <span className={cn("font-medium tabular-nums", tone)}>
      {typeof value === "number" ? value.toLocaleString() : value}{" "}
      <span className="font-normal text-muted-foreground">{label}</span>
    </span>
  );
}

/**
 * The contacts URL with one health bucket applied as the table's filter.
 *
 * Copies `updateSearchParams`' clone-set-delete shape (contacts-table.tsx) rather
 * than concatenating an href: a hand-built `?emailStatus=` drops `sortBy`,
 * `sortDir` and `pageSize` and throws away the view the reader was in.
 *
 * `search`, `topicId` and `contactId` are cleared on purpose. These buckets are
 * organization-wide counts; inheriting a search term would land "78 bounced" on
 * a table showing three rows, which is the contradiction these links exist to
 * remove. `page` resets for the same reason the status <Select> resets it —
 * page 5 of the old result set is not page 5 of this one.
 */
function healthFilterHref(
  orgSlug: string,
  searchParams: URLSearchParams,
  status: EmailStatus,
  /**
   * The bucket already applied links back to the unfiltered list, so the
   * affordance that switched the filter on is the one that switches it off.
   * Without this, clicking the current bucket navigated to the URL it was
   * already on — a control that looks interactive, is announced as current,
   * and does nothing. Clearing was only reachable from the table's "All
   * Statuses" <Select>, which is a different control in a different place.
   */
  clears = false
): string {
  const params = new URLSearchParams(searchParams.toString());
  if (clears) {
    params.delete("emailStatus");
  } else {
    params.set("emailStatus", status);
  }
  params.set("page", "1");
  params.delete("search");
  params.delete("topicId");
  params.delete("contactId");
  return `/${orgSlug}/contacts?${params.toString()}`;
}

/**
 * One health bucket: a link into the table's own status filter when there is
 * something to look at, plain text when there is not.
 *
 * A zero-count bucket deliberately does not link. The table's filtered-empty
 * state is a bare "No contacts found" with no filter context and no way back,
 * so a link that can only ever land there is worse than no link.
 *
 * `Button asChild` over a hand-styled anchor: it inherits the 40px touch target
 * and the focus ring from `buttonVariants`, and the <Link> inside keeps Enter,
 * cmd-click and middle-click.
 *
 * The `{" "}` between the two spans is load-bearing, not formatting. JSX strips
 * the newline between adjacent elements, so without it the accessible name is
 * "80bounced" — the link still looks right (the `gap-2` from `buttonVariants`
 * draws the space) but every name-based query misses it and the zero-count
 * branch has no space at all. `InlineStat` above carries the same separator for
 * the same reason.
 *
 * `scroll={false}`: the destination change this click intends is the focus move
 * onto the table's sr-only heading. Next's default scroll handling re-scrolls to
 * the top of the first Page element whenever that Page is not visible in the
 * viewport — on a phone that throws the reader back above the card they just
 * clicked in, undoing the focus move's whole point.
 *
 * The bucket matching the status already on the URL gets `aria-current` and the
 * `secondary` variant. Without it, five identical links sit on a card whose
 * whole claim is that these numbers are filters, with nothing saying which one
 * is applied.
 */
function HealthStat({
  href,
  isCurrent,
  onNavigate,
  status,
  tone,
  value,
}: {
  href?: string;
  isCurrent?: boolean;
  onNavigate?: () => void;
  status: EmailStatus;
  tone: string;
  value: number;
}) {
  const body = (
    <>
      <span className={cn("font-medium tabular-nums", tone)}>
        {value.toLocaleString()}
      </span>{" "}
      <span className="text-muted-foreground">{status}</span>
    </>
  );

  if (href === undefined) {
    return (
      <span className="inline-flex h-10 items-center gap-2 px-2 text-sm md:h-9">
        {body}
      </span>
    );
  }

  return (
    <Button
      asChild
      className="px-2 font-normal"
      size="touch"
      // `outline`, not `secondary`: the filled secondary surface measures 1.09:1
      // against the card, so on an ordinary screen the applied filter was
      // indistinguishable from the four that were not. `outline` keeps
      // bg-background and carries a border at --border — a non-colour affordance
      // that clears 3:1 and reads at a glance in both themes.
      variant={isCurrent ? "outline" : "ghost"}
    >
      <Link
        aria-current={isCurrent ? "true" : undefined}
        href={href}
        onClick={onNavigate}
        scroll={false}
      >
        {body}
      </Link>
    </Button>
  );
}

/**
 * Contacts by email status.
 *
 * For someone who owns the SES account this is the most useful number on the
 * page — bounces and complaints are what cost them their sending reputation.
 * It used to be a bordered tile inside the card, which is a card nested in a
 * card, and its conditional rows are half of why the column out-grew the chart
 * (audit H1). Unboxed and horizontal now; the hierarchy is type size, not a
 * border.
 */
function ListHealth({
  health,
  orgSlug,
  searchParams,
}: {
  health: ContactListHealth;
  orgSlug: string;
  searchParams: URLSearchParams;
}) {
  const stats: Array<{ status: EmailStatus; value: number; tone: string }> = [
    { status: "active", value: health.active, tone: "text-success" },
    {
      status: "unsubscribed",
      value: health.unsubscribed,
      tone: "text-muted-foreground",
    },
    { status: "bounced", value: health.bounced, tone: "text-destructive" },
    {
      status: "complained",
      value: health.complained,
      tone: "text-destructive",
    },
  ];

  if (health.suppressed > 0) {
    stats.push({
      status: "suppressed",
      value: health.suppressed,
      tone: "text-warning",
    });
  }

  const rawStatus = searchParams.get("emailStatus");
  const currentStatus = isEmailStatus(rawStatus) ? rawStatus : "all";

  return (
    <div className="mt-4">
      <div className="text-muted-foreground text-xs">List health</div>
      {/*
       * One wrapping row, not a grid. The buckets own the card's full width
       * here, so on any ordinary viewport all five sit on one line and wrap
       * only when the card genuinely runs out of room. The 2-column grid this
       * replaced existed to tame the ragged wrapping the old rail slot caused,
       * which is a layout problem better solved by giving the series its width
       * back than by imposing a shape on it.
       */}
      <div className="-mx-2 mt-1 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-sm">
        {stats.map((stat) => (
          <HealthStat
            href={
              stat.value > 0
                ? healthFilterHref(
                    orgSlug,
                    searchParams,
                    stat.status,
                    currentStatus === stat.status
                  )
                : undefined
            }
            isCurrent={currentStatus === stat.status}
            key={stat.status}
            onNavigate={() => {
              // Capture before the navigation, in the same handler, exactly as
              // the table's status <Select> does. Re-clicking the applied
              // bucket clears the filter, so it reports `to: "all"` — the same
              // transition the <Select> reports when it returns to "All
              // Statuses". It is a real filter change, not a no-op, so the
              // funnel must see it.
              captureContactsFilterChanged({
                control: "health_bucket",
                from: currentStatus,
                to: currentStatus === stat.status ? "all" : stat.status,
              });
              // Focusing the table's heading both moves the keyboard user onto
              // the rows this number describes and announces the destination —
              // which is why nothing is written to the card's live region here.
              document.getElementById(CONTACTS_TABLE_HEADING_ID)?.focus();
            }}
            status={stat.status}
            tone={stat.tone}
            value={stat.value}
          />
        ))}
      </div>
      {/* Stays on the surface rather than going into the popover: contacts the
          buckets above cannot account for is a caveat about those numbers, not
          background reading. Not a link — there is no `?emailStatus=` value for
          "no status" and the repository's filter builders have no isNull branch. */}
      {health.noEmailStatus > 0 && (
        <p className="mt-1.5 text-muted-foreground text-xs">
          {health.noEmailStatus.toLocaleString()} without an email status
        </p>
      )}
    </div>
  );
}

/**
 * The card's numbers, as one horizontal rail above the plot.
 *
 * They were a 200px column of four bordered tiles beside the chart, with
 * nothing distinguishing the window-scoped figure from the three all-time ones
 * (audit M4). Here the split is carried by a rule and by type size, and nothing
 * is boxed.
 */
function ContactSummary({
  analytics,
  rangeLabel,
  generatedAt,
  orgSlug,
  searchParams,
}: {
  analytics: ContactAnalyticsData;
  rangeLabel: string;
  generatedAt: number | undefined;
  orgSlug: string;
  searchParams: URLSearchParams;
}) {
  const growth = analytics.growthPercent;

  return (
    <div className="border-b pb-5">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
          <Figure
            aside={
              growth === 0 ? undefined : (
                <span
                  className={growth > 0 ? "text-success" : "text-destructive"}
                >
                  {growth > 0 ? "+" : ""}
                  {growth}%
                </span>
              )
            }
            label={`New in the last ${rangeLabel}`}
            value={`+${analytics.newContactsThisPeriod.toLocaleString()}`}
          />

          {/* A different population starts here: everything after this rule is
            all-time and organization-wide (audit M4). */}
          <div
            aria-hidden="true"
            className="@[540px]/card:block hidden h-10 w-px bg-border"
          />

          <Figure
            // The number is organization-wide while the table below is filtered,
            // so it read "1,993" over a table saying "Showing 50 of 173". Say
            // which one it is, on the surface.
            caption="Whole organization, not the filtered list below"
            label={
              <>
                All contacts
                <AllTimeScope />
              </>
            }
            value={analytics.totalContacts.toLocaleString()}
          />

          <div>
            <div className="text-muted-foreground text-xs">Engagement</div>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm leading-none">
              <InlineStat label="opens" value={`${analytics.avgOpenRate}%`} />
              <InlineStat label="clicks" value={`${analytics.avgClickRate}%`} />
            </div>
          </div>
        </div>

        {generatedAt === undefined ? null : (
          <p className="text-muted-foreground text-xs">
            <UpdatedAgo generatedAt={generatedAt} />
          </p>
        )}
      </div>

      {/*
       * List health gets its own band rather than a slot in the rail above.
       * Five small categorical counts and a hero number are different kinds of
       * thing: sharing one `items-end` flex row, the buckets took whatever
       * width was left over, wrapped into ragged two-per-line stacks, and
       * bottom-aligned a tall block against short ones. On its own full-width
       * line they read as one horizontal series, which is what they are.
       */}
      <ListHealth
        health={analytics.listHealth}
        orgSlug={orgSlug}
        searchParams={searchParams}
      />
    </div>
  );
}

/**
 * A failed chart fetch used to render "Failed to load analytics" in a 250px box
 * with no retry and no hint at whose fault it was (audit M3) — a dead end on
 * the only surface that could recover itself.
 */
function ChartErrorState({
  isRetrying,
  onRetry,
}: {
  isRetrying: boolean;
  onRetry: () => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 text-center",
        PLOT_HEIGHT
      )}
    >
      <CircleAlert className="size-6 text-muted-foreground" />
      <div className="space-y-1">
        <p className="font-medium text-sm">Couldn't load contact growth</p>
        <p className="max-w-sm text-muted-foreground text-sm">
          The request for your chart data failed. This is a problem reaching
          Wraps, not a change in your contacts.
        </p>
      </div>
      <Button disabled={isRetrying} onClick={onRetry} size="touch">
        {isRetrying ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <RotateCw className="mr-2 h-4 w-4" />
        )}
        {isRetrying ? "Retrying..." : "Retry"}
      </Button>
    </div>
  );
}

/**
 * Mirrors the loaded card block for block, so nothing jumps when data lands —
 * with one deliberate exception. The skeleton cannot know in advance whether the
 * window has any activity, so it keeps PLOT_HEIGHT; a no-activity load therefore
 * settles ~100px shorter when the NOTICE_HEIGHT branch renders instead. Sizing
 * the skeleton for that case would make every ordinary load jump, which is the
 * commoner event.
 */
function ChartSkeleton() {
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 border-b pb-5">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
          <Skeleton className="h-11 w-32" />
          <Skeleton className="h-14 w-40" />
          <Skeleton className="h-11 w-56" />
          <Skeleton className="h-11 w-36" />
        </div>
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className={cn("mt-6 w-full", PLOT_HEIGHT)} />
    </div>
  );
}

type ContactAnalyticsProps = {
  organizationId: string;
};

export function ContactAnalytics({ organizationId }: ContactAnalyticsProps) {
  const isMobile = useIsMobile();
  const reducedMotion = useReducedMotion();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const searchParams = useSearchParams();

  /**
   * `null` means "the reader has not chosen", so the viewport picks. This was an
   * effect that force-set 7d whenever `isMobile` went true, which overrode an
   * explicit 30-day choice on every resize across the breakpoint (audit L6).
   */
  const [chosenRange, setChosenRange] = useState<TimeRangeValue | null>(null);
  const rangeValue: TimeRangeValue = chosenRange ?? (isMobile ? "7d" : "30d");
  const range =
    TIME_RANGES.find((r) => r.value === rangeValue) ?? TIME_RANGES[0];

  /**
   * Spoken once per refresh, never on a timer. "Updated N minutes ago" rewrites
   * itself every minute and would interrupt the reader each time, so it cannot
   * be the live region (audit M2).
   */
  const [refreshStatus, setRefreshStatus] = useState("");

  // The SQL buckets by the reader's local date, so the browser owns the
  // timezone. Read once: it cannot change without a reload.
  const timeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    []
  );

  /**
   * React Query rather than a `useEffect` + `setAnalytics` pair.
   *
   * The effect called `setAnalytics` unconditionally with whatever landed, so
   * toggling 30d → 7d quickly let a slow 30-day response arrive last and sit
   * under a pressed "7 days" button (audit M1). Keying the cache on the window
   * makes that structurally impossible: a late 30-day response can only ever
   * resolve the 30-day entry.
   */
  const {
    data: analytics,
    dataUpdatedAt,
    isError,
    isFetching,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["contact-analytics", organizationId, range.days, timeZone],
    queryFn: async () => {
      const result = await getContactAnalytics(
        organizationId,
        range.days,
        timeZone
      );
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.analytics;
    },
  });

  /**
   * `async`, so `RefreshButton`'s transition — and the `aria-busy` it drives —
   * stays open until the fetch actually settles. It used to be synchronous, so
   * the spinner cleared while the request was still in flight, and the button's
   * contract puts the "refreshed" announcement on the caller (audit M2).
   *
   * No `router.refresh()`: re-running the whole RSC page (contacts list, topics,
   * plan check) to reload one chart is work nobody asked for.
   */
  async function handleRefresh() {
    const result = await refetch();
    setRefreshStatus(
      result.isError
        ? "Could not refresh contact growth."
        : "Contact growth refreshed."
    );
  }

  const chartData = analytics?.dailyGrowth ?? [];
  const hasActivity = chartData.some((d) => d.count > 0);
  // Seeded with 0: `Math.max(...[])` is -Infinity, which reached the axis
  // whenever the series was empty (audit L8).
  const maxValue = Math.max(0, ...chartData.map((d) => d.count || 0));

  // The SVG conveys none of this to a screen reader, and recharts' keyboard
  // layer announces individual days, not the shape of the period.
  const chartSummary = `Contact growth, ${range.long.toLowerCase()}: ${
    analytics?.newContactsThisPeriod ?? 0
  } new contacts.`;

  const rangeControls = (
    <>
      <ButtonGroup
        aria-label="Time range"
        className="@[767px]/card:flex hidden"
      >
        {TIME_RANGES.map((r) => (
          <Button
            aria-pressed={rangeValue === r.value}
            className="aria-pressed:bg-accent aria-pressed:text-accent-foreground"
            key={r.value}
            onClick={() => setChosenRange(r.value)}
            size="touch"
            variant="outline"
          >
            {r.label}
          </Button>
        ))}
        <RefreshButton
          label="Refresh contact growth"
          onRefresh={handleRefresh}
        />
      </ButtonGroup>
      <ButtonGroup className="@[767px]/card:hidden flex">
        <Select
          onValueChange={(next) => setChosenRange(next as TimeRangeValue)}
          value={rangeValue}
        >
          <SelectTrigger
            aria-label="Select time range"
            className="w-32 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate"
            size="touch"
          >
            <SelectValue placeholder="30 days" />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            {TIME_RANGES.map((r) => (
              <SelectItem className="rounded-lg" key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <RefreshButton
          label="Refresh contact growth"
          onRefresh={handleRefresh}
        />
      </ButtonGroup>
    </>
  );

  return (
    <Card className="@container/card">
      <CardHeader>
        {/* A real <h2>: the card is a section of the page, so it belongs in the
            heading outline. */}
        <CardTitle asChild>
          <h2>Contact Growth</h2>
        </CardTitle>
        <CardDescription>
          <span className="@[540px]/card:block hidden">
            New contacts added over time
          </span>
          <span className="@[540px]/card:hidden">New contacts</span>
        </CardDescription>
        <CardAction className="self-center">{rangeControls}</CardAction>
      </CardHeader>
      <CardContent>
        <p aria-live="polite" className="sr-only">
          {refreshStatus}
        </p>

        {isLoading && <ChartSkeleton />}

        {!isLoading && isError && (
          <ChartErrorState isRetrying={isFetching} onRetry={() => refetch()} />
        )}

        {!(isLoading || isError) && analytics && (
          <div>
            <ContactSummary
              analytics={analytics}
              // React Query stamps this when the response landed. The action
              // returns no server-side `generatedAt`, and claiming one we do
              // not have would be worse than reporting when this tab last
              // heard back.
              generatedAt={dataUpdatedAt || undefined}
              orgSlug={orgSlug}
              rangeLabel={range.label}
              searchParams={searchParams}
            />

            <div className="mt-6 min-w-0">
              {hasActivity ? (
                /*
                  role="figure", not "img": accessibilityLayer puts a focusable
                  role="application" surface inside, and role="img" would make
                  its subtree presentational — hiding the keyboard path.
                */
                <ChartContainer
                  aria-label={chartSummary}
                  className={cn("aspect-auto w-full", PLOT_HEIGHT)}
                  config={chartConfig}
                  role="figure"
                >
                  <AreaChart accessibilityLayer data={chartData}>
                    <defs>
                      <linearGradient
                        id="fillCount"
                        x1="0"
                        x2="0"
                        y1="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="var(--color-count)"
                          stopOpacity={0.4}
                        />
                        <stop
                          offset="95%"
                          stopColor="var(--color-count)"
                          stopOpacity={0.05}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      axisLine={false}
                      dataKey="date"
                      minTickGap={32}
                      tickFormatter={(value) => {
                        const date = new Date(value);
                        return date.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        });
                      }}
                      tickLine={false}
                      tickMargin={8}
                    />
                    <YAxis {...countYAxisProps(maxValue)} />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          indicator="line"
                          labelFormatter={(value) =>
                            new Date(value).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })
                          }
                        />
                      }
                    />
                    {/* isAnimationActive is JS-driven, so the reduced-motion
                        rules in globals.css cannot reach it (audit M5). */}
                    <Area
                      dataKey="count"
                      fill="url(#fillCount)"
                      isAnimationActive={!reducedMotion}
                      stroke="var(--color-count)"
                      strokeWidth={2}
                      type="monotone"
                    />
                  </AreaChart>
                </ChartContainer>
              ) : (
                <div
                  className={cn(
                    "flex items-center justify-center text-muted-foreground text-sm",
                    NOTICE_HEIGHT
                  )}
                >
                  No new contacts in this period
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
