"use client";

import { useEffect, useRef, useState } from "react";

export type Timeline = readonly (readonly [ms: number, stage: number])[];

/**
 * Steps a looping product animation through numbered stages.
 *
 * It starts on its finished frame, so server HTML, a slow connection and
 * prefers-reduced-motion all show the whole picture. With `trigger: "mount"`
 * it replays once the page settles; with `trigger: "view"` it plays only while
 * the card is on screen and parks on the finished frame when it leaves.
 */
export function useStageLoop({
  final,
  timeline,
  loopMs,
  trigger,
  startDelayMs = trigger === "mount" ? 2500 : 600,
}: {
  final: number;
  timeline: Timeline;
  loopMs: number;
  trigger: "mount" | "view";
  startDelayMs?: number;
}) {
  const [stage, setStage] = useState(final);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let timers: ReturnType<typeof setTimeout>[] = [];
    const clear = () => {
      for (const t of timers) {
        clearTimeout(t);
      }
      timers = [];
    };
    const play = () => {
      setStage(0);
      for (const [ms, next] of timeline) {
        timers.push(setTimeout(() => setStage(next), ms));
      }
      timers.push(setTimeout(play, loopMs));
    };

    if (trigger === "mount") {
      timers.push(setTimeout(play, startDelayMs));
      return clear;
    }

    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      return clear;
    }
    let playing = false;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.isIntersecting);
        if (visible && !playing) {
          playing = true;
          timers.push(setTimeout(play, startDelayMs));
        } else if (!visible && playing) {
          playing = false;
          clear();
          setStage(final);
        }
      },
      { threshold: 0.4 }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      clear();
    };
  }, [final, timeline, loopMs, trigger, startDelayMs]);

  return { stage, ref };
}
