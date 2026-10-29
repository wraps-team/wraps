/**
 * Change markers for the analytics timeline and chart overlays.
 *
 * Pure: no database, no React. The route loads rows and buckets and calls
 * these functions. A marker says that a recorded change happened around the
 * same time as a rate movement. It never says the change caused it, and every
 * string the user sees comes from COPY or MARKER_LABEL below.
 */

import type {
  ChangeMarkerAuditRow,
  ChangeMarkerBatchRow,
  ChangeMarkerTemplateVersionRow,
} from "@wraps/db";
import type { DrilldownMetric } from "./analytics-drilldown-window";
import { toLocaleDateStr } from "./analytics-utils";

export type MarkerType =
  | "broadcast_started"
  | "automation_enabled"
  | "automation_disabled"
  | "template_saved"
  | "contacts_imported"
  | "suppression_removed"
  | "sender_defaults_changed";

export type MarkerWeight = "major" | "minor";
export type MarkerMetric = DrilldownMetric;
export type MetricStatus =
  | "ready"
  | "accruing"
  | "insufficient_volume"
  | "pending";
export type MetricDirection = "up" | "down" | "flat";

export type MetricDelta = {
  metric: MarkerMetric;
  status: MetricStatus;
  /** Percent. Set only when status is ready. */
  before: number | null;
  /** Percent. Set only when status is ready. */
  after: number | null;
  deltaPts: number | null;
  direction: MetricDirection | null;
};

export type MarkerDelta = {
  afterClosesAt: number;
  beforeSent: number;
  afterSent: number;
  metrics: MetricDelta[];
};

export type ChangeMarker = {
  id: string;
  type: MarkerType;
  /** Epoch ms, UTC instant. */
  at: number;
  /** YYYY-MM-DD in the request timezone. */
  date: string;
  label: string;
  href: string;
  weight: MarkerWeight;
  count: number;
  /**
   * Numeric payload for the type: recipients for a broadcast, the created
   * count for an import. Null otherwise. Groups carry the sum for imports.
   */
  value: number | null;
  delta: MarkerDelta | null;
};

export type ChangeMarkersResponse = {
  generatedAt: number;
  window: { startMs: number; endMs: number; timezone: string };
  markers: ChangeMarker[];
  totalMarkers: number;
  truncated: boolean;
  deltasIncluded: boolean;
};

/** One hourly bucket from queryMessageMetricBuckets (UTC). */
export type DeltaBucket = {
  period?: string;
  sent: number;
  bounced: number;
  complained: number;
  suppressed: number;
};

export type MarkerSourceRows = {
  batches: ChangeMarkerBatchRow[];
  auditRows: ChangeMarkerAuditRow[];
  templateVersions: ChangeMarkerTemplateVersionRow[];
};

// ─── Constants ──────────────────────────────────────────────────────────────

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Each comparison window needs at least this many sends. */
export const MIN_SENDS_PER_WINDOW = 200;
export const MAX_MARKERS = 100;
/** Recipients at or above this make a broadcast major. */
export const MAJOR_RECIPIENTS = 1000;
/** Contacts created at or above this make an import major. */
export const MAJOR_IMPORT_COUNT = 1000;

const NOTABLE_POINTS: Record<MarkerMetric, number> = {
  bounce: 0.5,
  suppression: 0.5,
  complaint: 0.05,
};
const PRECISION: Record<MarkerMetric, number> = {
  bounce: 2,
  suppression: 2,
  complaint: 4,
};
/** Time after the after window closes before a metric is final. */
const SETTLE_MS: Record<MarkerMetric, number> = {
  bounce: DAY_MS,
  suppression: DAY_MS,
  complaint: 7 * DAY_MS,
};
const METRICS: MarkerMetric[] = ["bounce", "complaint", "suppression"];

const LIST_PATH: Record<MarkerType, string> = {
  broadcast_started: "/emails/broadcasts",
  automation_enabled: "/automations",
  automation_disabled: "/automations",
  template_saved: "/emails/templates",
  contacts_imported: "/contacts",
  suppression_removed: "/emails?tab=deliverability&list=suppressed",
  sender_defaults_changed: "/settings/sender-defaults",
};

// ─── Copy (spec section 7). The only strings a user sees from this module. ──

const METRIC_TITLE: Record<MarkerMetric, string> = {
  bounce: "Bounce",
  complaint: "Complaint",
  suppression: "Suppression",
};

export const COPY = {
  tabHeading: "Changes",
  tabDescription:
    "Changes made in this window, listed next to the rate movements that happened around the same time. These are timing records only, not a diagnosis.",
  chartToggle: "Changes",
  chartListHeading: "Changes in this period",
  listFootnote:
    "Markers show changes that happened around the same time as rate movements. They are timing records only, not a diagnosis.",
  noChangesInPeriod: "No changes in this period.",
  chartListError: "Could not load changes. Try again.",
  loadError: "Could not load changes.",
  tryAgain: "Try again",
  notableIncrease: "Notable increase",
  notableDecrease: "Notable decrease",
  noNotableChange: "No notable change",
  deltaReady: (metric: string, before: string, after: string) =>
    `The ${metric} rate was ${before}% in the 24 hours before and ${after}% in the 24 hours after. This change happened around the same time as that movement.`,
  deltaFlat: (metric: string, before: string, after: string) =>
    `The ${metric} rate was ${before}% in the 24 hours before and ${after}% in the 24 hours after. No notable change.`,
  insufficient: (beforeSent: number, afterSent: number) =>
    `Not enough sends to compare: ${beforeSent} before and ${afterSent} after. Each window needs ${MIN_SENDS_PER_WINDOW} sends.`,
  accruing: (metricTitle: string, finalDate: string) =>
    `${metricTitle} figures are still arriving. Final on ${finalDate}.`,
  pending: (dateTime: string) => `Comparison available from ${dateTime}.`,
  grouped: (count: number) =>
    `${count} changes that day. No single comparison is shown.`,
  truncated: (total: number) =>
    `Showing the ${MAX_MARKERS} most recent of ${total} changes. Narrow the window to see older ones.`,
  timelineFooter: (days: number) =>
    `Changes cover the whole ${days}-day window. Choosing a day does not filter this list.`,
  emptyBody: (days: number) =>
    `No changes were recorded in the last ${days} days. Changes appear here when a broadcast starts, an automation is enabled or disabled, a template version is saved, contacts are imported, a suppression is removed, or sender defaults change.`,
  moreChanges: (count: number) => `+${count} more`,
  showChanges: (count: number) => `Show ${count} changes`,
};

/** Labels for markers and groups. They name an event and never a cause. */
export const MARKER_LABEL = {
  broadcastStarted: (name: string | null, recipients: number) =>
    `Broadcast started: ${name?.trim() ? name : "Untitled broadcast"} (${recipients.toLocaleString("en-US")} recipients)`,
  automationEnabled: (name: string | null) =>
    name?.trim() ? `Automation enabled: ${name}` : "Automation enabled",
  automationDisabled: (name: string | null) =>
    name?.trim() ? `Automation disabled: ${name}` : "Automation disabled",
  templateSaved: (name: string, version: number) =>
    `Template saved: ${name} (v${version})`,
  contactsImported: (count: number | null) =>
    count === null
      ? "Contacts imported"
      : `Contacts imported: ${count.toLocaleString("en-US")} new`,
  suppressionRemoved: () => "Suppressed address removed",
  senderDefaultsChanged: () => "Sender defaults changed",
  groupBroadcasts: (count: number) => `${count} broadcasts started`,
  groupAutomationsEnabled: (count: number) => `${count} automations enabled`,
  groupAutomationsDisabled: (count: number) => `${count} automations disabled`,
  groupTemplates: (count: number) => `${count} template versions saved`,
  groupImports: (count: number, contacts: number) =>
    `${count} contact imports (${contacts.toLocaleString("en-US")} contacts new)`,
  groupSuppressions: (count: number) => `${count} suppressed addresses removed`,
  groupSenderDefaults: (count: number) => `${count} sender default changes`,
};

// ─── Formatting helpers ─────────────────────────────────────────────────────

function roundTo(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function formatDate(epochMs: number, timezone: string): string {
  return new Date(epochMs).toLocaleDateString("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(epochMs: number, timezone: string): string {
  return new Date(epochMs).toLocaleString("en-US", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function signedPoints(value: number, metric: MarkerMetric): string {
  const sign = value < 0 ? "-" : "+";
  return `${sign}${Math.abs(value).toFixed(PRECISION[metric])}`;
}

function percentText(value: number, metric: MarkerMetric): string {
  return value.toFixed(PRECISION[metric]);
}

// ─── Building markers from source rows ──────────────────────────────────────

type MarkerInput = {
  type: MarkerType;
  sourceId: string;
  at: Date;
  label: string;
  href: string;
  weight: MarkerWeight;
  value: number | null;
};

function makeMarker(input: MarkerInput, timezone: string): ChangeMarker {
  return {
    id: `${input.type}:${input.sourceId}`,
    type: input.type,
    at: input.at.getTime(),
    date: toLocaleDateStr(input.at, timezone),
    label: input.label,
    href: input.href,
    weight: input.weight,
    count: 1,
    value: input.value,
    delta: null,
  };
}

function importCountOf(row: ChangeMarkerAuditRow): number | null {
  if (row.importCount === null) {
    return null;
  }
  const parsed = Number(row.importCount);
  return Number.isFinite(parsed) ? parsed : null;
}

type BuildContext = { orgSlug: string; timezone: string };

function batchMarkers(
  batches: ChangeMarkerBatchRow[],
  ctx: BuildContext
): ChangeMarker[] {
  return batches.map((batch) =>
    makeMarker(
      {
        type: "broadcast_started",
        sourceId: batch.id,
        at: batch.startedAt,
        label: MARKER_LABEL.broadcastStarted(batch.name, batch.totalRecipients),
        href: `/${ctx.orgSlug}/emails/broadcasts/${batch.id}`,
        weight: batch.totalRecipients >= MAJOR_RECIPIENTS ? "major" : "minor",
        value: batch.totalRecipients,
      },
      ctx.timezone
    )
  );
}

/** Maps one audit row. Unknown actions produce no marker. */
function auditMarker(
  row: ChangeMarkerAuditRow,
  ctx: BuildContext
): ChangeMarker | null {
  const { orgSlug, timezone } = ctx;
  switch (row.action) {
    case "workflow.enabled":
    case "workflow.disabled": {
      const enabled = row.action === "workflow.enabled";
      return makeMarker(
        {
          type: enabled ? "automation_enabled" : "automation_disabled",
          sourceId: row.id,
          at: row.createdAt,
          label: enabled
            ? MARKER_LABEL.automationEnabled(row.workflowName)
            : MARKER_LABEL.automationDisabled(row.workflowName),
          href: row.workflowId
            ? `/${orgSlug}/automations/${row.workflowId}`
            : `/${orgSlug}/automations`,
          weight: "minor",
          value: null,
        },
        timezone
      );
    }
    case "contact.imported": {
      const count = importCountOf(row);
      return makeMarker(
        {
          type: "contacts_imported",
          sourceId: row.id,
          at: row.createdAt,
          label: MARKER_LABEL.contactsImported(count),
          href: `/${orgSlug}/contacts`,
          weight:
            count !== null && count >= MAJOR_IMPORT_COUNT ? "major" : "minor",
          value: count,
        },
        timezone
      );
    }
    case "suppression.removed":
      // Only the id and time are read. The address is never selected.
      return makeMarker(
        {
          type: "suppression_removed",
          sourceId: row.id,
          at: row.createdAt,
          label: MARKER_LABEL.suppressionRemoved(),
          href: `/${orgSlug}/emails?tab=deliverability&list=suppressed`,
          weight: "minor",
          value: null,
        },
        timezone
      );
    case "settings.sender_defaults_updated":
      return makeMarker(
        {
          type: "sender_defaults_changed",
          sourceId: row.id,
          at: row.createdAt,
          label: MARKER_LABEL.senderDefaultsChanged(),
          href: `/${orgSlug}/settings/sender-defaults`,
          weight: "minor",
          value: null,
        },
        timezone
      );
    default:
      return null;
  }
}

function templateMarkers(
  versions: ChangeMarkerTemplateVersionRow[],
  ctx: BuildContext
): ChangeMarker[] {
  return versions.map((version) =>
    makeMarker(
      {
        type: "template_saved",
        sourceId: version.id,
        at: version.createdAt,
        label: MARKER_LABEL.templateSaved(
          version.templateName,
          version.version
        ),
        href: `/${ctx.orgSlug}/emails/templates/${version.templateId}`,
        weight: "minor",
        value: null,
      },
      ctx.timezone
    )
  );
}

/**
 * Maps each source row to one marker. Only the fields in the marker are
 * read. `resourceId` and `metadata` are never read here: the repository does
 * not select them, so a suppressed address cannot reach a label or href.
 */
export function buildChangeMarkers(
  rows: MarkerSourceRows,
  options: {
    orgSlug: string;
    timezone: string;
    window?: { startMs: number; endMs: number };
  }
): ChangeMarker[] {
  const ctx: BuildContext = {
    orgSlug: options.orgSlug,
    timezone: options.timezone,
  };
  const audit = rows.auditRows
    .map((row) => auditMarker(row, ctx))
    .filter((m): m is ChangeMarker => m !== null);
  const markers = [
    ...batchMarkers(rows.batches, ctx),
    ...audit,
    ...templateMarkers(rows.templateVersions, ctx),
  ];

  const window = options.window;
  if (!window) {
    return markers;
  }
  return markers.filter((m) => m.at >= window.startMs && m.at <= window.endMs);
}

// ─── Clustering, ordering and the response cap ──────────────────────────────

function sortNewestFirst(markers: ChangeMarker[]): ChangeMarker[] {
  return [...markers].sort((a, b) => b.at - a.at || a.id.localeCompare(b.id));
}

const GROUP_LABEL: Record<
  MarkerType,
  (count: number, value: number) => string
> = {
  broadcast_started: (count) => MARKER_LABEL.groupBroadcasts(count),
  automation_enabled: (count) => MARKER_LABEL.groupAutomationsEnabled(count),
  automation_disabled: (count) => MARKER_LABEL.groupAutomationsDisabled(count),
  template_saved: (count) => MARKER_LABEL.groupTemplates(count),
  contacts_imported: (count, value) => MARKER_LABEL.groupImports(count, value),
  suppression_removed: (count) => MARKER_LABEL.groupSuppressions(count),
  sender_defaults_changed: (count) => MARKER_LABEL.groupSenderDefaults(count),
};

function buildGroup(members: ChangeMarker[], orgSlug: string): ChangeMarker {
  const [first] = members;
  const count = members.reduce((sum, m) => sum + m.count, 0);
  const hasValues = members.some((m) => m.value !== null);
  const value = hasValues
    ? members.reduce((sum, m) => sum + (m.value ?? 0), 0)
    : null;
  return {
    id: `group:${first.type}:${first.date}`,
    type: first.type,
    at: Math.max(...members.map((m) => m.at)),
    date: first.date,
    label: GROUP_LABEL[first.type](count, value ?? 0),
    href: `/${orgSlug}${LIST_PATH[first.type]}`,
    weight: members.some((m) => m.weight === "major") ? "major" : "minor",
    count,
    value,
    delta: null,
  };
}

/**
 * Same-type markers on the same date (in the request timezone) collapse into
 * one group. A group has no delta. A single marker is returned unchanged.
 */
export function clusterMarkers(
  markers: ChangeMarker[],
  options: { orgSlug: string }
): ChangeMarker[] {
  const byKey = new Map<string, ChangeMarker[]>();
  for (const marker of markers) {
    const key = `${marker.type}|${marker.date}`;
    const bucket = byKey.get(key);
    if (bucket) {
      bucket.push(marker);
    } else {
      byKey.set(key, [marker]);
    }
  }

  const clustered: ChangeMarker[] = [];
  for (const members of byKey.values()) {
    clustered.push(
      members.length === 1 ? members[0] : buildGroup(members, options.orgSlug)
    );
  }
  return sortNewestFirst(clustered);
}

/** Sorts newest first and keeps at most MAX_MARKERS. */
export function capMarkers(
  markers: ChangeMarker[],
  options: { truncatedSource: boolean }
): {
  markers: ChangeMarker[];
  totalMarkers: number;
  truncated: boolean;
} {
  const sorted = sortNewestFirst(markers);
  return {
    markers: sorted.slice(0, MAX_MARKERS),
    totalMarkers: markers.length,
    truncated: options.truncatedSource || markers.length > MAX_MARKERS,
  };
}

// ─── Delta computation ──────────────────────────────────────────────────────

type WindowSums = {
  sent: number;
  bounced: number;
  complained: number;
  suppressed: number;
};

function emptySums(): WindowSums {
  return { sent: 0, bounced: 0, complained: 0, suppressed: 0 };
}

function countOf(sums: WindowSums, metric: MarkerMetric): number {
  if (metric === "bounce") {
    return sums.bounced;
  }
  if (metric === "complaint") {
    return sums.complained;
  }
  return sums.suppressed;
}

function rateOf(count: number, sent: number): number | null {
  return sent > 0 ? (count / sent) * 100 : null;
}

/** Which comparison window a bucket start falls in, if either. */
function windowSide(start: number, h0: number): "before" | "after" | null {
  if (start >= h0 - 24 * HOUR_MS && start < h0) {
    return "before";
  }
  if (start >= h0 + HOUR_MS && start < h0 + 25 * HOUR_MS) {
    return "after";
  }
  return null;
}

/**
 * The hour containing the change (h0) is excluded from both windows. The
 * before window is [h0-24h, h0). The after window is [h0+1h, h0+25h).
 */
export function computeMarkerDelta(
  buckets: DeltaBucket[],
  options: { at: number; now: Date }
): MarkerDelta {
  const h0 = Math.floor(options.at / HOUR_MS) * HOUR_MS;
  const afterClosesAt = h0 + 25 * HOUR_MS;
  const before = emptySums();
  const after = emptySums();

  for (const bucket of buckets) {
    if (!bucket.period) {
      continue;
    }
    const start = Date.parse(`${bucket.period}Z`);
    if (Number.isNaN(start)) {
      continue;
    }
    const side = windowSide(start, h0);
    if (side === null) {
      continue;
    }
    const target = side === "before" ? before : after;
    target.sent += bucket.sent;
    target.bounced += bucket.bounced;
    target.complained += bucket.complained;
    target.suppressed += bucket.suppressed;
  }

  const nowMs = options.now.getTime();
  const pending = nowMs < afterClosesAt;
  const insufficient =
    before.sent < MIN_SENDS_PER_WINDOW || after.sent < MIN_SENDS_PER_WINDOW;

  const metrics: MetricDelta[] = METRICS.map((metric) => {
    const empty = {
      metric,
      before: null,
      after: null,
      deltaPts: null,
      direction: null,
    };
    if (pending) {
      return { ...empty, status: "pending" };
    }
    if (insufficient) {
      return { ...empty, status: "insufficient_volume" };
    }
    if (nowMs < afterClosesAt + SETTLE_MS[metric]) {
      return { ...empty, status: "accruing" };
    }
    const beforeRate = rateOf(countOf(before, metric), before.sent);
    const afterRate = rateOf(countOf(after, metric), after.sent);
    if (beforeRate === null || afterRate === null) {
      return { ...empty, status: "insufficient_volume" };
    }
    const deltaPts = roundTo(afterRate - beforeRate, PRECISION[metric]);
    const notable = Math.abs(deltaPts) >= NOTABLE_POINTS[metric];
    return {
      metric,
      status: "ready",
      before: beforeRate,
      after: afterRate,
      deltaPts,
      direction: notable ? (deltaPts > 0 ? "up" : "down") : "flat",
    };
  });

  return {
    afterClosesAt,
    beforeSent: before.sent,
    afterSent: after.sent,
    metrics,
  };
}

/**
 * The bucket range one metrics query needs for every single marker, or null
 * when there are none (so the query is skipped). The end is inclusive, so it
 * is one millisecond before the last close.
 */
export function deltaQueryWindow(
  markers: ChangeMarker[]
): { startTime: Date; endTime: Date } | null {
  const singles = markers.filter((m) => m.count === 1);
  if (singles.length === 0) {
    return null;
  }
  const hours = singles.map((m) => Math.floor(m.at / HOUR_MS) * HOUR_MS);
  const earliest = Math.min(...hours);
  const latest = Math.max(...hours);
  return {
    startTime: new Date(earliest - 24 * HOUR_MS),
    endTime: new Date(latest + 25 * HOUR_MS - 1),
  };
}

/**
 * Attaches a delta to each single marker. Groups keep delta null. Call this
 * after clustering and the cap, so only the markers returned get a delta.
 */
export function attachDeltas(
  markers: ChangeMarker[],
  buckets: DeltaBucket[],
  now: Date
): ChangeMarker[] {
  return markers.map((marker) =>
    marker.count === 1
      ? {
          ...marker,
          delta: computeMarkerDelta(buckets, { at: marker.at, now }),
        }
      : marker
  );
}

// ─── Chart overlay grouping ─────────────────────────────────────────────────

export type ChartMarkerLine = {
  date: string;
  count: number;
  major: boolean;
  markers: ChangeMarker[];
};

/** One entry per chart date that has a marker. Dates not in the chart are dropped. */
export function groupMarkersByDate(
  markers: ChangeMarker[],
  categories: string[]
): ChartMarkerLine[] {
  const allowed = new Set(categories);
  const byDate = new Map<string, ChartMarkerLine>();
  for (const marker of markers) {
    if (!allowed.has(marker.date)) {
      continue;
    }
    const line = byDate.get(marker.date) ?? {
      date: marker.date,
      count: 0,
      major: false,
      markers: [],
    };
    line.count += marker.count;
    line.major = line.major || marker.weight === "major";
    line.markers.push(marker);
    byDate.set(marker.date, line);
  }
  return categories.flatMap((date) => {
    const line = byDate.get(date);
    return line ? [line] : [];
  });
}

// ─── Timeline row copy ──────────────────────────────────────────────────────

export type MetricLine = {
  metric: MarkerMetric;
  status: MetricStatus;
  /** Set only when status is ready, e.g. "Bounce rate 1.20% -> 2.90% (+1.70 points)". */
  heading: string | null;
  /** Notable chip text, set only when status is ready. */
  chip: string | null;
  text: string;
};

const CHIP_LABEL: Record<MetricDirection, string> = {
  up: COPY.notableIncrease,
  down: COPY.notableDecrease,
  flat: COPY.noNotableChange,
};

function describeMetric(
  metric: MetricDelta,
  delta: MarkerDelta,
  timezone: string
): MetricLine {
  const title = METRIC_TITLE[metric.metric];
  const name = metric.metric;
  switch (metric.status) {
    case "ready": {
      const before = percentText(metric.before ?? 0, name);
      const after = percentText(metric.after ?? 0, name);
      const pts = signedPoints(metric.deltaPts ?? 0, name);
      const notable = metric.direction !== "flat";
      return {
        metric: name,
        status: "ready",
        heading: `${title} rate ${before}% -> ${after}% (${pts} points)`,
        chip: CHIP_LABEL[metric.direction ?? "flat"],
        text: notable
          ? COPY.deltaReady(name, before, after)
          : COPY.deltaFlat(name, before, after),
      };
    }
    case "accruing": {
      const finalAt = delta.afterClosesAt + SETTLE_MS[name];
      return {
        metric: name,
        status: "accruing",
        heading: null,
        chip: null,
        text: COPY.accruing(title, formatDate(finalAt, timezone)),
      };
    }
    case "insufficient_volume":
      return {
        metric: name,
        status: "insufficient_volume",
        heading: null,
        chip: null,
        text: COPY.insufficient(delta.beforeSent, delta.afterSent),
      };
    default:
      // "pending" is the only status left.
      return {
        metric: name,
        status: "pending",
        heading: null,
        chip: null,
        text: COPY.pending(formatDateTime(delta.afterClosesAt, timezone)),
      };
  }
}

/** One line per metric, with the selected metric first. */
export function describeMarkerDelta(
  delta: MarkerDelta,
  options: { timezone: string; first: MarkerMetric }
): MetricLine[] {
  const selected = delta.metrics.filter((m) => m.metric === options.first);
  const others = delta.metrics.filter((m) => m.metric !== options.first);
  return [...selected, ...others].map((metric) =>
    describeMetric(metric, delta, options.timezone)
  );
}

// ─── Timeline link ──────────────────────────────────────────────────────────

/** The one place the timeline link's query shape is written. */
export function TIMELINE_TAB_HREF(
  orgSlug: string,
  args: { metric: MarkerMetric; days: number }
): string {
  const search = new URLSearchParams({
    tab: "deliverability",
    metric: args.metric,
    days: String(args.days),
    drive: "changes",
  });
  return `/${orgSlug}/emails?${search.toString()}`;
}
