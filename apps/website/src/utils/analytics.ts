import posthog from "posthog-js";

/**
 * Analytics utility for Google Tag Manager and PostHog integration
 * Uses environment variables to conditionally load analytics in production
 */

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

export const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID || "";
export const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY || "";
export const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://o11y.wraps.dev";
const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * Initialize PostHog analytics
 * Only loads PostHog if NEXT_PUBLIC_POSTHOG_KEY is set AND in production mode
 */
export const initPostHog = (): void => {
  if (typeof window === "undefined") {
    return;
  }

  if (!POSTHOG_KEY) {
    return;
  }

  if (!IS_PRODUCTION) {
    return;
  }

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    capture_pageview: false, // We manually track pageviews
    capture_pageleave: true,
    persistence: "localStorage",
  });
};

/**
 * Initialize Google Tag Manager
 * Only loads GTM if NEXT_PUBLIC_GTM_ID environment variable is set AND in production mode
 */
export const initGTM = (): void => {
  if (typeof window === "undefined") {
    return;
  }

  if (!GTM_ID) {
    return;
  }

  if (!IS_PRODUCTION) {
    return;
  }

  // Same effect as Google's inline GTM snippet, without injecting script text
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });

  const gtmScript = document.createElement("script");
  gtmScript.async = true;
  gtmScript.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(GTM_ID)}`;
  document.head.appendChild(gtmScript);
};

/**
 * Check if PostHog is initialized and ready
 */
const isPostHogReady = (): boolean =>
  !!(POSTHOG_KEY && IS_PRODUCTION && typeof posthog?.capture === "function");

/**
 * Track custom events
 * @param eventName - The event name
 * @param parameters - Event parameters
 */
export const trackEvent = (
  eventName: string,
  parameters?: Record<string, unknown>
): void => {
  if (typeof window === "undefined" || !IS_PRODUCTION) {
    return;
  }

  // Send to GTM if configured
  if (GTM_ID) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: eventName,
      ...parameters,
    });
  }

  // Send to PostHog if initialized
  if (isPostHogReady()) {
    posthog.capture(eventName, parameters);
  }
};

/**
 * Track page views (useful for SPA route changes)
 * @param path - The page path
 * @param title - Optional page title
 */
export const trackPageView = (path: string, title?: string): void => {
  if (typeof window === "undefined" || !IS_PRODUCTION) {
    return;
  }

  const pageTitle = title || document.title;

  // Send to GTM if configured
  if (GTM_ID) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: "page_view",
      page_path: path,
      page_title: pageTitle,
    });
  }

  // Send to PostHog if initialized
  if (isPostHogReady()) {
    posthog.capture("$pageview", {
      page_path: path,
      page_title: pageTitle,
    });
  }
};
