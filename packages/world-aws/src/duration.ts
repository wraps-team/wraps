export type Duration = { readonly seconds: number };

export const Duration = {
  seconds: (s: number): Duration => ({ seconds: s }),
  minutes: (m: number): Duration => ({ seconds: m * 60 }),
  hours: (h: number): Duration => ({ seconds: h * 3600 }),
  days: (d: number): Duration => ({ seconds: d * 86400 }),
} as const;
