"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

/*
 * Starts a one-shot CSS sequence (.flow-* in globals.css) when the diagram
 * first scrolls into view. Without JS, or with reduced motion, nothing is
 * dimmed and nothing plays: the stage reads as its finished state.
 */
export function FlowStage({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setPlaying(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={`flow-stage ${className ?? ""}`}
      data-play={playing ? "" : undefined}
      ref={ref}
    >
      {children}
    </div>
  );
}
