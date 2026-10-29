/**
 * The vocabulary of the `/emails` hub: which tab is open and which window the
 * whole page reads. Both live in the URL (`?tab=`, `?days=`) so a link lands
 * on the same view it was copied from.
 */

export const HUB_TABS = ["activity", "engagement", "deliverability"] as const;
export type HubTab = (typeof HUB_TABS)[number];

export const HUB_RANGES = [
  { days: 1, short: "24h", long: "Last 24 hours" },
  { days: 7, short: "7d", long: "Last 7 days" },
  { days: 30, short: "30d", long: "Last 30 days" },
  { days: 90, short: "90d", long: "Last 90 days" },
] as const;

export type HubDays = (typeof HUB_RANGES)[number]["days"];

export const HUB_DEFAULT_DAYS: HubDays = 30;

function firstValue(value: string | string[] | null | undefined) {
  return Array.isArray(value) ? undefined : (value ?? undefined);
}

export function parseHubTab(
  value: string | string[] | null | undefined
): HubTab {
  const raw = firstValue(value);
  return HUB_TABS.find((tab) => tab === raw) ?? "activity";
}

export function parseHubDays(
  value: string | string[] | null | undefined
): HubDays {
  const raw = firstValue(value);
  const match = HUB_RANGES.find((range) => String(range.days) === raw);
  return match?.days ?? HUB_DEFAULT_DAYS;
}

/**
 * Builds a hub URL. `tab` is omitted when it is the default (`activity`) and
 * `days` when it is the default window, so the common links stay short.
 * `extra` params are appended after those, in the order given; empty and
 * undefined values are skipped.
 */
export function hubHref(
  orgSlug: string,
  opts: {
    tab?: HubTab;
    days?: HubDays;
    extra?: Record<string, string | undefined>;
  } = {}
): string {
  const params = new URLSearchParams();
  if (opts.tab && opts.tab !== "activity") {
    params.set("tab", opts.tab);
  }
  if (opts.days !== undefined && opts.days !== HUB_DEFAULT_DAYS) {
    params.set("days", String(opts.days));
  }
  for (const [key, value] of Object.entries(opts.extra ?? {})) {
    if (value) {
      params.append(key, value);
    }
  }
  const query = params.toString();
  return query ? `/${orgSlug}/emails?${query}` : `/${orgSlug}/emails`;
}

export type DrilldownSearchParams = Record<
  string,
  string | string[] | undefined
>;

const DRILLDOWN_METRICS = ["bounce", "complaint", "suppression"] as const;
const DRILLDOWN_SENDS_BY = ["broadcast", "workflow", "template", "from"];
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Maps the retired drilldown page's URL params onto the Deliverability tab's
 * params (the `extra` of `hubHref`). The one place that knows the old shape:
 * do not add params here. `tz` is dropped because the hub reads the browser
 * zone itself, and the Addresses tab became the `recommended` list.
 */
export function mapDrilldownParams(
  sp: DrilldownSearchParams
): Record<string, string | undefined> {
  const metric = firstValue(sp.metric);
  const tab = firstValue(sp.tab);
  const day = firstValue(sp.day);
  const sendsBy = firstValue(sp["sends.by"]);

  let drive: string | undefined;
  let list: string | undefined;
  if (tab === "reasons") {
    drive = "reasons";
  } else if (tab === "timeline") {
    drive = "changes";
  } else if (tab === "addresses") {
    list = "recommended";
  }

  return {
    metric: DRILLDOWN_METRICS.find((m) => m === metric),
    drive,
    day: day && DAY_PATTERN.test(day) ? day : undefined,
    list,
    "sends.by": DRILLDOWN_SENDS_BY.find((s) => s === sendsBy),
  };
}
