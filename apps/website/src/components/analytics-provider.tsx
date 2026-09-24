"use client";

import { useEffect } from "react";
import { signupClickProperties } from "@/lib/signup-click";
import { initGTM, initPostHog, trackEvent } from "@/utils/analytics";

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initGTM();
    initPostHog();
  }, []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }
      const properties = signupClickProperties(
        anchor.href,
        window.location.pathname,
        anchor.textContent ?? ""
      );
      if (properties) {
        trackEvent("signup_click", properties);
      }
    };

    document.addEventListener("click", onClick, { capture: true });
    return () =>
      document.removeEventListener("click", onClick, { capture: true });
  }, []);

  return <>{children}</>;
}
