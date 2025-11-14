"use client";

import { useQuery } from "@tanstack/react-query";

interface AnalyticsOverview {
  totalSent: number;
  totalDelivered: number;
  totalBounced: number;
  totalComplaints: number;
  deliveryRate: number;
  bounceRate: number;
  complaintRate: number;
}

interface VolumeDataPoint {
  date: string;
  timestamp: number;
  sent: number;
  delivered: number;
  bounced: number;
}

interface EngagementDataPoint {
  date: string;
  timestamp: number;
  openRate: number;
  clickRate: number;
  ctr: number;
}

interface TopPerformer {
  subject: string;
  openRate: number;
  clickRate: number;
  sent: number;
  opens: number;
  clicks: number;
  sentAt: number;
}

interface RecentActivity {
  id: string;
  subject: string;
  eventType: string;
  timestamp: number;
  timestampFormatted: string;
  metadata?: Record<string, unknown>;
}

export function useAnalyticsOverview(orgSlug: string, days = 30) {
  return useQuery<AnalyticsOverview>({
    queryKey: ["analytics", "overview", orgSlug, days],
    queryFn: async () => {
      const response = await fetch(
        `/api/${orgSlug}/analytics/overview?days=${days}`
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
        `/api/${orgSlug}/analytics/volume?days=${days}`
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
        `/api/${orgSlug}/analytics/engagement?days=${days}`
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
        `/api/${orgSlug}/analytics/top-performers?days=${days}&limit=${limit}`
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
