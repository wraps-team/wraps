"use client";

import {
  ArrowRight,
  Cloud,
  Code2,
  Database,
  HardDrive,
  Mail,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { IconName, PipelineStep } from "../data";

const iconMap: Record<IconName, typeof Mail> = {
  Mail,
  Cloud,
  HardDrive,
  Code2,
  Zap,
  Database,
  Headphones: Mail, // fallback
  Package: Mail, // fallback
  FileText: Mail, // fallback
  Users: Mail, // fallback
  MessageSquare: Mail, // fallback
};

function AnimatedArrow({
  isActive,
  delay,
  showPulse,
}: {
  isActive: boolean;
  delay: number;
  showPulse: boolean;
}) {
  return (
    <div className="relative flex items-center justify-center px-1 sm:px-2">
      <ArrowRight
        className={cn(
          "size-4 text-muted-foreground transition-all duration-300 sm:size-5",
          isActive && "text-brand-text"
        )}
        style={{ transitionDelay: `${delay}ms` }}
      />
      {isActive && showPulse && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ animationDelay: `${delay}ms` }}
        >
          <div className="size-1.5 animate-ping rounded-full bg-brand" />
        </div>
      )}
    </div>
  );
}

export function PipelineInteractive({ steps }: { steps: PipelineStep[] }) {
  const [activeStep, setActiveStep] = useState(-1);
  const [selectedStep, setSelectedStep] = useState<string | null>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [prefersReduced, setPrefersReduced] = useState(false);

  useEffect(() => {
    setPrefersReduced(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.3 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) {
      return;
    }

    // Reduced motion: light the whole pipeline at once, no looping animation.
    if (prefersReduced) {
      setActiveStep(steps.length - 1);
      return;
    }

    const animateSteps = () => {
      let step = 0;
      const interval = setInterval(() => {
        setActiveStep(step);
        step += 1;
        if (step > steps.length) {
          step = 0;
          setActiveStep(-1);
          setTimeout(() => {
            setActiveStep(0);
          }, 1000);
        }
      }, 600);

      return interval;
    };

    const interval = animateSteps();
    return () => clearInterval(interval);
  }, [isVisible, prefersReduced, steps.length]);

  const selectedInfo = selectedStep
    ? steps.find((s) => s.id === selectedStep)
    : null;

  return (
    <div ref={sectionRef}>
      {/* Pipeline visualization */}
      <div className="mb-8 overflow-x-auto pb-4">
        <div className="flex min-w-max items-center justify-center gap-0 py-4 sm:gap-1">
          {steps.map((step, index) => {
            const Icon = iconMap[step.iconName];
            const isActive = activeStep >= index;
            const isCurrent = activeStep === index && !prefersReduced;

            return (
              <div className="flex items-center" key={step.id}>
                <button
                  className={cn(
                    "group relative flex flex-col items-center transition-all duration-300",
                    selectedStep === step.id && "scale-105"
                  )}
                  onClick={() =>
                    setSelectedStep(selectedStep === step.id ? null : step.id)
                  }
                  type="button"
                >
                  <div
                    className={cn(
                      "relative flex size-12 items-center justify-center rounded-lg border border-border bg-card transition-all duration-300 sm:size-14",
                      isActive && "border-brand/40 bg-brand/10",
                      isCurrent && "scale-110 ring-2 ring-brand/40",
                      selectedStep === step.id &&
                        "ring-2 ring-brand ring-offset-2 ring-offset-background"
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-5 transition-all duration-300 sm:size-6",
                        isActive ? "text-brand-text" : "text-muted-foreground"
                      )}
                    />

                    {isCurrent && (
                      <div className="absolute inset-0 animate-ping rounded-lg bg-brand/20 opacity-40" />
                    )}
                  </div>

                  <span
                    className={cn(
                      "mt-2 font-mono text-2xs uppercase tracking-widest transition-all duration-300 sm:text-xs",
                      isActive ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {step.label}
                  </span>
                </button>

                {index < steps.length - 1 && (
                  <AnimatedArrow
                    delay={index * 100}
                    isActive={activeStep > index}
                    showPulse={!prefersReduced}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected step detail panel */}
      <div
        className={cn(
          "mx-auto max-w-md overflow-hidden rounded-lg border bg-card transition-all duration-300",
          selectedInfo
            ? "border-brand/40 opacity-100"
            : "border-border opacity-70"
        )}
      >
        <div className="p-6 text-center">
          {selectedInfo ? (
            <>
              {(() => {
                const SelectedIcon = iconMap[selectedInfo.iconName];
                return (
                  <SelectedIcon className="mx-auto mb-3 size-8 text-brand-text" />
                );
              })()}
              <h3 className="mb-2 font-heading font-semibold text-lg tracking-tight">
                {selectedInfo.label}
              </h3>
              <p className="text-muted-foreground">
                {selectedInfo.description}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">Click a step to see details</p>
          )}
        </div>
      </div>
    </div>
  );
}
