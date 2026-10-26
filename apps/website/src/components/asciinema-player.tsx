"use client";

import "asciinema-player/dist/bundle/asciinema-player.css";
import { useEffect, useRef } from "react";

type AsciinemaPlayerProps = {
  src: string;
  cols?: number;
  rows?: number;
  autoPlay?: boolean;
  preload?: boolean;
  loop?: boolean | number;
  startAt?: number | string;
  speed?: number;
  idleTimeLimit?: number;
  theme?: string;
  poster?: string;
  fit?: "width" | "height" | "both" | "none" | false;
  terminalFontSize?: string;
  terminalFontFamily?: string;
  terminalLineHeight?: number;
  className?: string;
};

export function AsciinemaPlayer({
  src,
  cols = 100,
  rows = 30,
  autoPlay = true,
  preload = true,
  loop = true,
  startAt = 0,
  speed = 1,
  idleTimeLimit = 2,
  theme = "asciinema",
  poster = "npt:0:1",
  fit = "width",
  terminalFontSize = "14px",
  terminalFontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  terminalLineHeight = 1.4,
  className,
}: AsciinemaPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<unknown>(null);

  useEffect(() => {
    let mounted = true;

    const loadPlayer = async () => {
      // Dynamically import to avoid SSR issues
      const AsciinemaPlayerLib = await import("asciinema-player");

      if (!(mounted && containerRef.current)) {
        return;
      }

      // Clean up existing player
      if (playerRef.current) {
        containerRef.current.replaceChildren();
      }

      playerRef.current = AsciinemaPlayerLib.create(src, containerRef.current, {
        cols,
        rows,
        autoPlay,
        preload,
        loop,
        startAt,
        speed,
        idleTimeLimit,
        theme,
        poster,
        fit,
        terminalFontSize,
        terminalFontFamily,
        terminalLineHeight,
      });
    };

    loadPlayer();

    return () => {
      mounted = false;
      if (containerRef.current) {
        containerRef.current.replaceChildren();
      }
    };
  }, [
    src,
    cols,
    rows,
    autoPlay,
    preload,
    loop,
    startAt,
    speed,
    idleTimeLimit,
    theme,
    poster,
    fit,
    terminalFontSize,
    terminalFontFamily,
    terminalLineHeight,
  ]);

  return <div className={className} ref={containerRef} />;
}
