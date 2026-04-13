import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Sanitize a redirect path from query params to prevent open-redirect and XSS.
 * Only allows relative paths starting with "/" (not protocol-relative "//").
 * Rejects scheme-like paths (e.g. "/javascript:...") including percent-encoded variants.
 */
const SCHEME_PATTERN = /^\/[a-zA-Z][a-zA-Z\d+\-.]*:/;

export function toSafeRedirectPath(
  value: string | null | undefined,
  fallback = "/"
): string {
  const candidate = value?.trim() ?? "";
  if (!candidate) return fallback;

  // Must start with "/" but not "//" (protocol-relative)
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return fallback;

  // Reject scheme-like paths: /javascript:, /vbscript:, etc.
  if (SCHEME_PATTERN.test(candidate)) return fallback;

  // Also check decoded form to catch percent-encoded colons (%3a)
  try {
    if (SCHEME_PATTERN.test(decodeURIComponent(candidate))) return fallback;
  } catch {
    return fallback;
  }

  return candidate;
}

/**
 * Format a date as relative time (e.g., "2 hours ago", "3 days ago")
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return "just now";
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `${diffInMinutes}m ago`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours}h ago`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) {
    return `${diffInDays}d ago`;
  }

  const diffInWeeks = Math.floor(diffInDays / 7);
  if (diffInWeeks < 4) {
    return `${diffInWeeks}w ago`;
  }

  // For older dates, show the actual date
  return date.toLocaleDateString();
}

/**
 * Format a duration in seconds to a compact string (e.g., "3d", "12h", "30m", "45s").
 */
export function formatDurationCompact(seconds: number): string {
  if (seconds >= 86_400) {
    const days = Math.floor(seconds / 86_400);
    return `${days}d`;
  }
  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    return `${hours}h`;
  }
  if (seconds >= 60) {
    const mins = Math.floor(seconds / 60);
    return `${mins}m`;
  }
  return `${seconds}s`;
}

/**
 * Parse a duration in seconds to an { amount, unit } pair for form inputs.
 * Supports "minutes", "hours", "days". Falls back to the provided default
 * when the value is 0 or doesn't cleanly divide into any unit.
 */
export function parseDurationToAmountUnit(
  seconds: number,
  fallback: { amount: number; unit: string } = { amount: 1, unit: "hours" }
): { amount: number; unit: string } {
  if (seconds >= 86_400) {
    return { amount: Math.floor(seconds / 86_400), unit: "days" };
  }
  if (seconds >= 3600) {
    return { amount: Math.floor(seconds / 3600), unit: "hours" };
  }
  if (seconds >= 60) {
    return { amount: Math.floor(seconds / 60), unit: "minutes" };
  }
  return seconds > 0
    ? { amount: Math.max(1, Math.round(seconds / 3600)), unit: "hours" }
    : fallback;
}

/**
 * Convert an { amount, unit } pair back to seconds.
 */
export function amountUnitToSeconds(amount: number, unit: string): number {
  switch (unit) {
    case "minutes":
      return amount * 60;
    case "hours":
      return amount * 3600;
    case "days":
      return amount * 86_400;
    default:
      return amount;
  }
}

/**
 * Format a duration in seconds to a verbose string (e.g., "3 days", "12 hours").
 */
export function formatDurationVerbose(seconds: number): string {
  if (seconds >= 86_400) {
    const days = Math.floor(seconds / 86_400);
    return `${days} day${days !== 1 ? "s" : ""}`;
  }
  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    return `${hours} hour${hours !== 1 ? "s" : ""}`;
  }
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes} min${minutes !== 1 ? "s" : ""}`;
  }
  return `${seconds} sec${seconds !== 1 ? "s" : ""}`;
}
