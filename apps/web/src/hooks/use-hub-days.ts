"use client";

import { useSearchParams } from "next/navigation";
import { type HubDays, parseHubDays } from "@/lib/emails-hub";

/** The `/emails` page-level range, read from `?days=`. */
export function useHubDays(): HubDays {
  return parseHubDays(useSearchParams().get("days"));
}
