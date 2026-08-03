"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { ATTRIBUTION_COOKIE, UTM_PARAMS } from "@/lib/attribution";

const APP_HOSTS = new Set(["app.wraps.dev"]);

/**
 * Forward campaign params onto links into the dashboard.
 *
 * The `.wraps.dev` cookie already carries attribution across the hop, so this
 * is the fallback for visitors whose cookies are blocked or cleared between
 * landing and signing up. Decorating links in one effect rather than editing
 * every CTA keeps the 25-odd call sites — and future ones — correct by default.
 */
export function AttributionLinks() {
  // `usePathname` only re-runs the effect on navigation. The query string is
  // read from `window` rather than `useSearchParams` on purpose: that hook
  // forces a Suspense bailout and would opt every static marketing page into
  // dynamic rendering for a fallback that only matters client-side.
  const pathname = usePathname();

  useEffect(() => {
    const params = currentAttributionParams(
      new URLSearchParams(window.location.search)
    );
    if (params.size === 0) {
      return;
    }

    for (const anchor of document.querySelectorAll<HTMLAnchorElement>(
      "a[href]"
    )) {
      decorate(anchor, params);
    }
  }, [pathname]);

  return null;
}

/**
 * Campaign params for this page view — the live URL first, then the cookie
 * written on first touch, so a visitor who browses before converting still
 * carries their source into the signup link.
 */
function currentAttributionParams(
  searchParams: URLSearchParams
): URLSearchParams {
  const params = new URLSearchParams();

  for (const key of UTM_PARAMS) {
    const value = searchParams.get(key);
    if (value) {
      params.set(key, value);
    }
  }

  const ref = searchParams.get("ref");
  if (ref) {
    params.set("ref", ref);
  }

  if (params.size > 0) {
    return params;
  }

  const stored = readAttributionCookie();
  if (!stored) {
    return params;
  }

  for (const key of [...UTM_PARAMS, "ref"]) {
    const value = stored[key];
    if (typeof value === "string" && value) {
      params.set(key, value);
    }
  }

  return params;
}

function readAttributionCookie(): Record<string, unknown> | null {
  const match = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ATTRIBUTION_COOKIE}=`));

  if (!match) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(
      decodeURIComponent(match.slice(ATTRIBUTION_COOKIE.length + 1))
    );
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function decorate(anchor: HTMLAnchorElement, params: URLSearchParams): void {
  let url: URL;
  try {
    url = new URL(anchor.href);
  } catch {
    return;
  }

  if (!APP_HOSTS.has(url.hostname)) {
    return;
  }

  let changed = false;
  for (const [key, value] of params) {
    // Never overwrite a param the link set itself — `plan=growth` on a pricing
    // CTA is product intent, not attribution.
    if (!url.searchParams.has(key)) {
      url.searchParams.set(key, value);
      changed = true;
    }
  }

  if (changed) {
    anchor.href = url.toString();
  }
}
