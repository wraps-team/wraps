import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(() => {
    // Initialize with actual window size if available (client-side)
    if (typeof window !== "undefined") {
      const isCurrentlyMobile = window.innerWidth < MOBILE_BREAKPOINT;
      console.log("[useIsMobile] Initial:", {
        width: window.innerWidth,
        isMobile: isCurrentlyMobile,
        breakpoint: MOBILE_BREAKPOINT,
      });
      return isCurrentlyMobile;
    }
    // Default to desktop during SSR
    return false;
  });

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      const isCurrentlyMobile = window.innerWidth < MOBILE_BREAKPOINT;
      console.log("[useIsMobile] Changed:", {
        width: window.innerWidth,
        isMobile: isCurrentlyMobile,
      });
      setIsMobile(isCurrentlyMobile);
    };
    mql.addEventListener("change", onChange);
    const isCurrentlyMobile = window.innerWidth < MOBILE_BREAKPOINT;
    console.log("[useIsMobile] Effect:", {
      width: window.innerWidth,
      isMobile: isCurrentlyMobile,
    });
    setIsMobile(isCurrentlyMobile);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  console.log("[useIsMobile] Render:", { isMobile });
  return isMobile;
}
