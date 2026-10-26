"use client";

import { useEffect, useRef } from "react";

/*
 * The hero's pixel grid.
 *
 * The grid itself is CSS (.hero-dots in globals.css): server-rendered, so the
 * first paint already has it, and it needs no redraw on resize or theme
 * change. This component only adds the two moments of light that travel across
 * it, drawn on a canvas that is idle the rest of the time:
 *
 *   1. a quiet scan down the page on load
 *   2. an orange pulse out of the bounce meter at the instant the bar crosses
 *      AWS's review line, triggered by that element's own CSS animation
 *      (data-hero-pulse), so the two cannot drift apart
 *
 * Reduced motion gets the static grid and nothing else.
 */

// Must match the tile size in .hero-dots.
const PITCH = 16;
const DOT = 2;

type Wave = {
  x: number;
  y: number;
  start: number;
  /** Pixels per millisecond the ring travels. */
  speed: number;
  /** Softness of the ring, in pixels. */
  width: number;
  /** Milliseconds until the wave is gone. */
  life: number;
  color: string;
  /** Peak opacity of a lit dot. */
  peak: number;
  /** Extra pixels a lit dot grows by at the ring's crest. */
  grow: number;
};

function resolveColor(host: HTMLElement, token: string) {
  const probe = document.createElement("span");
  probe.style.color = `var(${token})`;
  probe.style.display = "none";
  host.appendChild(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color;
}

/** Lights every dot the wave's ring currently touches. Returns false once the wave is over. */
function paintWave(
  pen: CanvasRenderingContext2D,
  wave: Wave,
  now: number,
  grid: { cols: number; rows: number; dpr: number }
) {
  const age = now - wave.start;
  if (age < 0 || age > wave.life) {
    return false;
  }
  const radius = age * wave.speed;
  const fade = 1 - age / wave.life;
  pen.fillStyle = wave.color;

  for (let j = 0; j < grid.rows; j++) {
    for (let i = 0; i < grid.cols; i++) {
      const x = i * PITCH;
      const y = j * PITCH;
      const d = Math.hypot(x - wave.x, y - wave.y);
      const k = Math.exp(-(((d - radius) / wave.width) ** 2)) * fade;
      if (k < 0.04) {
        continue;
      }
      const size = DOT + Math.round(k * wave.grow);
      const offset = (size - DOT) / 2;
      pen.globalAlpha = Math.min(1, wave.peak * k);
      pen.fillRect(
        Math.round((x - offset) * grid.dpr),
        Math.round((y - offset) * grid.dpr),
        size * grid.dpr,
        size * grid.dpr
      );
    }
  }
  return true;
}

export function HeroDotField() {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const hostEl = host.current;
    const cv = canvas.current;
    if (!(hostEl && cv)) {
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const ctx = cv.getContext("2d");
    if (!ctx) {
      return;
    }

    const area: HTMLDivElement = hostEl;
    const surface: HTMLCanvasElement = cv;
    const pen: CanvasRenderingContext2D = ctx;
    const section = area.closest("section") ?? area;
    const waves: Wave[] = [];
    let raf = 0;
    let dpr = 1;

    function sizeCanvas() {
      const rect = area.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      surface.width = Math.round(rect.width * dpr);
      surface.height = Math.round(rect.height * dpr);
    }

    function frame(now: number) {
      pen.clearRect(0, 0, surface.width, surface.height);
      const grid = {
        cols: Math.ceil(surface.width / dpr / PITCH),
        rows: Math.ceil(surface.height / dpr / PITCH),
        dpr,
      };
      let live = false;
      for (const wave of waves) {
        live = paintWave(pen, wave, now, grid) || live;
      }
      pen.globalAlpha = 1;
      if (live) {
        raf = requestAnimationFrame(frame);
        return;
      }
      pen.clearRect(0, 0, surface.width, surface.height);
      raf = 0;
    }

    function launch(wave: Wave) {
      sizeCanvas();
      waves.push(wave);
      if (!raf) {
        raf = requestAnimationFrame(frame);
      }
    }

    // 1. The scan, from the top edge down.
    const width = area.getBoundingClientRect().width;
    launch({
      x: width / 2,
      y: -80,
      start: performance.now(),
      speed: 0.85,
      width: 110,
      life: 1700,
      color: resolveColor(area, "--color-foreground"),
      peak: 0.55,
      grow: 0,
    });

    // 2. The pulse, from wherever the page marks the crossing.
    function onAnimationStart(event: AnimationEvent) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      if (!target.hasAttribute("data-hero-pulse")) {
        return;
      }
      const box = area.getBoundingClientRect();
      const at = target.getBoundingClientRect();
      launch({
        x: at.left - box.left + at.width * 0.25,
        y: at.top - box.top + at.height / 2,
        start: performance.now(),
        speed: 0.62,
        width: 70,
        life: 2000,
        color: resolveColor(area, "--color-brand"),
        peak: 1,
        grow: 2,
      });
    }

    section.addEventListener("animationstart", onAnimationStart);
    return () => {
      section.removeEventListener("animationstart", onAnimationStart);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      ref={host}
    >
      <div className="hero-dots-mask absolute inset-0">
        <div className="hero-dots absolute inset-0 opacity-25 dark:opacity-30" />
      </div>
      <canvas
        className="hero-pulse-mask absolute inset-0 size-full"
        ref={canvas}
      />
    </div>
  );
}
