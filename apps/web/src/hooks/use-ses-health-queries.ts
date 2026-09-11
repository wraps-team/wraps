"use client";

import { useQuery } from "@tanstack/react-query";

/**
 * The numbers behind a verdict, as the hourly sweep read them from SES and
 * CloudWatch. Rates are DECIMALS (0–1), not percentages. Every field is
 * nullable: a brand-new account has published no metrics yet, and an
 * unmeasured account is not a healthy one.
 */
export type SesHealthDetail = {
  bounceRate: number | null;
  complaintRate: number | null;
  quotaUsedRatio: number | null;
  sendingEnabled: boolean | null;
  enforcementStatus: string | null;
  /** false means the account is in the SES sandbox. */
  productionAccessEnabled: boolean | null;
  reviewStatus: "PENDING" | "GRANTED" | "DENIED" | "FAILED" | null;
  reviewCaseId: string | null;
  max24HourSend: number | null;
  sentLast24Hours: number | null;
  maxSendRate: number | null;
  reasons: string[];
};

export type SesHealthAccount = {
  id: string;
  name: string;
  accountId: string;
  region: string;
  status: "healthy" | "at_risk" | "in_danger" | "unknown";
  checkedAt: number | null;
  reasons: string[];
  detail: SesHealthDetail | null;
};

export type SesHealthResponse = {
  status: "healthy" | "at_risk" | "in_danger" | "unknown";
  checkedAt: number | null;
  accounts: SesHealthAccount[];
};

// Query Keys
export const sesHealthKeys = {
  all: ["ses-health"] as const,
  detail: (orgSlug: string) => [...sesHealthKeys.all, orgSlug] as const,
};

// The underlying verdict only changes on the hourly account-health sweep, so
// polling more often than that is pure waste.
const FIVE_MINUTES_MS = 5 * 60 * 1000;

export function useSesHealth(orgSlug: string | null | undefined) {
  return useQuery({
    queryKey: sesHealthKeys.detail(orgSlug ?? ""),
    queryFn: async () => {
      const response = await fetch(`/api/${orgSlug}/health`);
      if (!response.ok) {
        throw new Error("Failed to load SES health");
      }
      return response.json() as Promise<SesHealthResponse>;
    },
    enabled: !!orgSlug,
    staleTime: FIVE_MINUTES_MS,
    refetchInterval: FIVE_MINUTES_MS,
  });
}
