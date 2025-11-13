import type { ReactNode } from "react";

export const CardDecorator = ({ children }: { children: ReactNode }) => (
  <div className="relative mx-auto h-36 w-36">
    {/* Light Mode Dot Pattern */}
    <div
      aria-hidden
      className="absolute inset-0 bg-[length:16px_16px] bg-[radial-gradient(circle,var(--color-foreground)_1px,transparent_1px)] opacity-30"
    />
    {/* Light Mode Radial Fade */}
    <div
      aria-hidden
      className="absolute inset-0 bg-radial from-transparent to-card"
    />
    {/* Center Icon Container */}
    <div className="absolute inset-0 m-auto flex h-12 w-12 items-center justify-center rounded-md border bg-background shadow-xs">
      {children}
    </div>
  </div>
);
