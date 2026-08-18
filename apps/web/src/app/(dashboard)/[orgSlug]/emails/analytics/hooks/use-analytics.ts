"use client";

import { useQuery } from "@tanstack/react-query";
import type { EmailChartMeta } from "@/lib/analytics-scope";

const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * Totals every email payload reports.
 *
 * `bounceRate` and `complaintRate` may be SES account-lifetime figures rather
 * than window arithmetic - read `meta.reputationScope` before pairing either
 * with a count from the same payload.
 */
type EmailTotals = {
  totalSent: number;
  totalDelivered: number;
  totalBounced: number;
  totalComplaints: number;
  totalRenderingFailures: number;
  deliveryRate: number;
  bounceRate: number;
  complaintRate: number;
};

/** What `/analytics/overview` returns. */
type AnalyticsOverview = EmailTotals & {
  totalOpens: number;
  totalClicks: number;
  openRate: number;
  clickRate: number;
  /**
   * Which population the rates describe. Absent on cached pre-scope payloads,
   * so every reader must tolerate `undefined`.
   */
  meta?: EmailChartMeta;
};

/** What `/analytics/volume` returns. No engagement columns. */
type VolumeDataPoint = {
  date: string;
  timestamp: number;
  sent: number;
  delivered: number;
  bounced: number;
  renderingFailures: number;
};

/** What `/analytics/email-chart` returns in `volume`. Engagement, no failures. */
type ChartVolumePoint = {
  date: string;
  timestamp: number;
  sent: number;
  delivered: number;
  bounced: number;
  opens: number;
  clicks: number;
};

type EngagementDataPoint = {
  date: string;
  timestamp: number;
  openRate: number;
  clickRate: number;
  ctr: number;
};

type TopPerformer = {
  subject: string;
  openRate: number;
  clickRate: number;
  sent: number;
  opens: number;
  clicks: number;
  sentAt: number;
};

type RecentActivity = {
  id: string;
  /** Link target for the message detail page. */
  messageId: string;
  subject: string;
  eventType: string;
  timestamp: number;
  sentAt: number;
  timestampFormatted: string;
  metadata?: Record<string, unknown>;
};

type BounceDataPoint = {
  date: string;
  timestamp: number;
  permanent: number;
  transient: number;
  undetermined: number;
  total: number;
  sent: number;
  bounceRate: number;
};

type ComplaintDataPoint = {
  date: string;
  timestamp: number;
  complaints: number;
  sent: number;
  complaintRate: number;
};

type SuppressionDataPoint = {
  date: string;
  timestamp: number;
  suppressed: number;
  sent: number;
  suppressionRate: number;
};

type EmailChartData = {
  overview: EmailTotals;
  volume: ChartVolumePoint[];
  engagement: EngagementDataPoint[];
  /** Which population each number describes. Absent on cached pre-scope payloads. */
  meta?: EmailChartMeta;
};

export function useEmailChartData(orgSlug: string, days = 7) {
  return useQuery<EmailChartData>({
    queryKey: ["analytics", "email-chart", orgSlug, days],
    queryFn: async () => {
      const response = await fetch(
        `/api/${orgSlug}/analytics/email-chart?days=${days}&tz=${encodeURIComponent(browserTz)}`
      );
      if (!response.ok) {
        throw new Error(
          `Failed to fetch email chart data (HTTP ${response.status} ${response.statusText})`
        );
      }
      return response.json();
    },
    staleTime: 10 * 60 * 1000,
    // Same reasoning as the emails list: a single blip must not become a
    // permanent "no emails sent in this period".
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });
}

export function useAnalyticsOverview(orgSlug: string, days = 30) {
  return useQuery<AnalyticsOverview>({
    queryKey: ["analytics", "overview", orgSlug, days],
    queryFn: async () => {
      const response = await fetch(
        `/api/${orgSlug}/analytics/overview?days=${days}&tz=${encodeURIComponent(browserTz)}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch analytics overview");
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useVolumeData(orgSlug: string, days = 90) {
  return useQuery<VolumeDataPoint[]>({
    queryKey: ["analytics", "volume", orgSlug, days],
    queryFn: async () => {
      const response = await fetch(
        `/api/${orgSlug}/analytics/volume?days=${days}&tz=${encodeURIComponent(browserTz)}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch volume data");
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useEngagementData(orgSlug: string, days = 90) {
  return useQuery<EngagementDataPoint[]>({
    queryKey: ["analytics", "engagement", orgSlug, days],
    queryFn: async () => {
      const response = await fetch(
        `/api/${orgSlug}/analytics/engagement?days=${days}&tz=${encodeURIComponent(browserTz)}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch engagement data");
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useTopPerformers(orgSlug: string, days = 30, limit = 5) {
  return useQuery<TopPerformer[]>({
    queryKey: ["analytics", "top-performers", orgSlug, days, limit],
    queryFn: async () => {
      const response = await fetch(
        `/api/${orgSlug}/analytics/top-performers?days=${days}&limit=${limit}&tz=${encodeURIComponent(browserTz)}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch top performers");
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useRecentActivity(orgSlug: string, limit = 20) {
  return useQuery<RecentActivity[]>({
    queryKey: ["analytics", "recent-activity", orgSlug, limit],
    queryFn: async () => {
      const response = await fetch(
        `/api/${orgSlug}/analytics/recent-activity?limit=${limit}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch recent activity");
      }
      return response.json();
    },
    staleTime: 1 * 60 * 1000, // 1 minute (more frequent for activity feed)
  });
}

export function useBounceData(orgSlug: string, days = 30) {
  return useQuery<BounceDataPoint[]>({
    queryKey: ["analytics", "bounces", orgSlug, days],
    queryFn: async () => {
      const response = await fetch(
        `/api/${orgSlug}/analytics/bounces?days=${days}&tz=${encodeURIComponent(browserTz)}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch bounce data");
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useComplaintData(orgSlug: string, days = 30) {
  return useQuery<ComplaintDataPoint[]>({
    queryKey: ["analytics", "complaints", orgSlug, days],
    queryFn: async () => {
      const response = await fetch(
        `/api/${orgSlug}/analytics/complaints?days=${days}&tz=${encodeURIComponent(browserTz)}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch complaint data");
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useSuppressionData(orgSlug: string, days = 30) {
  return useQuery<SuppressionDataPoint[]>({
    queryKey: ["analytics", "suppression", orgSlug, days],
    queryFn: async () => {
      const response = await fetch(
        `/api/${orgSlug}/analytics/suppression?days=${days}&tz=${encodeURIComponent(browserTz)}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch suppression data");
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}
