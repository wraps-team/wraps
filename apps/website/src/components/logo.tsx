import type * as React from "react";

interface LogoProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: number;
}

export function Logo({ size = 40, className, ...props }: LogoProps) {
  // Use Next.js Image for optimized loading if possible, or standard img for simplicity in this component structure
  // Since this is a shared component potentially used in different contexts, let's check if we can use Next.js Image.
  // The file imports React but not Next.js Image. Let's stick to a simple img tag or import Image if it's a Next.js app (it is).

  return (
    <div
      className={className}
      style={{ width: size * 3, height: size, position: "relative" }}
      {...props}
    >
      <img
        alt="Wraps Logo"
        className="h-full w-full object-contain dark:hidden"
        src="/wraps-light.png"
      />
      <img
        alt="Wraps Logo"
        className="hidden h-full w-full object-contain dark:block"
        src="/wraps-dark.png"
      />
    </div>
  );
}
