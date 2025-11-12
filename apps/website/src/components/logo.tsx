import type * as React from "react";

interface LogoProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

export function Logo({ size = 40, className, ...props }: LogoProps) {
  return (
    <svg
      className={className}
      fill="currentColor"
      height={size}
      viewBox="0 0 120 52"
      width={size * 2.2}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <text
        dominantBaseline="middle"
        fill="currentColor"
        fontFamily="'League Gothic Condensed', 'Impact', 'Arial Narrow', sans-serif"
        fontSize="64"
        fontWeight="700"
        letterSpacing="0"
        stroke="currentColor"
        strokeWidth="0.5"
        textAnchor="start"
        x="0"
        y="32"
      >
        WRAPS
      </text>
    </svg>
  );
}
