"use client";

import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type SuccessCelebrationProps = {
  show: boolean;
  onComplete?: () => void;
  message?: string;
};

/**
 * A simple success celebration overlay with checkmark animation
 * Shows briefly after successful actions like first publish
 */
export function SuccessCelebration({
  show,
  onComplete,
  message = "Success!",
}: SuccessCelebrationProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    if (show) {
      setIsVisible(true);
      setIsExiting(false);

      // Start exit animation after 1.5s
      const exitTimer = setTimeout(() => {
        setIsExiting(true);
      }, 1500);

      // Complete and hide after animation
      const completeTimer = setTimeout(() => {
        setIsVisible(false);
        onComplete?.();
      }, 2000);

      return () => {
        clearTimeout(exitTimer);
        clearTimeout(completeTimer);
      };
    }
  }, [show, onComplete]);

  if (!isVisible) {
    return null;
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex items-center justify-center bg-foreground/20 backdrop-blur-sm transition-opacity duration-300",
        isExiting ? "opacity-0" : "opacity-100"
      )}
    >
      <div
        className={cn(
          "flex flex-col items-center gap-4 rounded-2xl bg-background p-8 shadow-2xl transition-all duration-500",
          isExiting ? "scale-95 opacity-0" : "scale-100 opacity-100"
        )}
      >
        {/* Animated checkmark circle */}
        <div className="relative">
          {/* Outer ring animation */}
          <div className="absolute inset-0 animate-ping rounded-full bg-success opacity-25" />
          {/* Success circle */}
          <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-success text-success-foreground">
            <Check
              className="h-10 w-10 animate-in zoom-in-0 duration-300"
              strokeWidth={3}
            />
          </div>
        </div>

        {/* Message */}
        <p className="animate-in fade-in-0 slide-in-from-bottom-2 font-semibold text-foreground text-lg duration-300">
          {message}
        </p>

        {/* Decorative particles */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...new Array(12)].map((_, i) => (
            <div
              className="absolute h-2 w-2 rounded-full"
              key={i}
              style={{
                background: ["#22c55e", "#3b82f6", "#f59e0b", "#ec4899"][i % 4],
                left: "50%",
                top: "50%",
                animation: `particle-${i % 4} 1s ease-out forwards`,
                animationDelay: `${i * 50}ms`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Keyframes for particles (injected as style tag) */}
      <style jsx>{`
        @keyframes particle-0 {
          0% { transform: translate(-50%, -50%) scale(0); opacity: 1; }
          100% { transform: translate(-100px, -80px) scale(1); opacity: 0; }
        }
        @keyframes particle-1 {
          0% { transform: translate(-50%, -50%) scale(0); opacity: 1; }
          100% { transform: translate(100px, -60px) scale(1); opacity: 0; }
        }
        @keyframes particle-2 {
          0% { transform: translate(-50%, -50%) scale(0); opacity: 1; }
          100% { transform: translate(-80px, 80px) scale(1); opacity: 0; }
        }
        @keyframes particle-3 {
          0% { transform: translate(-50%, -50%) scale(0); opacity: 1; }
          100% { transform: translate(90px, 70px) scale(1); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
