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
 * `extra` params are appended after those, in the order given.
 */
export function hubHref(
  orgSlug: string,
  opts: {
    tab?: HubTab;
    days?: HubDays;
    extra?: Record<string, string>;
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
    params.append(key, value);
  }
  const query = params.toString();
  return query ? `/${orgSlug}/emails?${query}` : `/${orgSlug}/emails`;
}
