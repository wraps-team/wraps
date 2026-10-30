"use client";

import {
  FileText,
  Headphones,
  Mail,
  MessageSquare,
  Package,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { IconName, UseCase } from "../data";

const iconMap: Record<IconName, typeof Mail> = {
  Mail,
  Headphones,
  Package,
  FileText,
  Users,
  MessageSquare,
  Cloud: Mail, // fallback
  HardDrive: Mail, // fallback
  Code2: Mail, // fallback
  Zap: Mail, // fallback
  Database: Mail, // fallback
};

export function UseCasesCarousel({ useCases }: { useCases: UseCase[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) {
      return;
    }

    const handleScroll = () => {
      const scrollLeft = scrollContainer.scrollLeft;
      const cardWidth = scrollContainer.offsetWidth * 0.7;
      const index = Math.round(scrollLeft / cardWidth);
      setActiveIndex(Math.min(index, useCases.length - 1));
    };

    scrollContainer.addEventListener("scroll", handleScroll);
    return () => scrollContainer.removeEventListener("scroll", handleScroll);
  }, [useCases.length]);

  const scrollToIndex = (index: number) => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) {
      return;
    }

    const cards = scrollContainer.querySelectorAll("[data-card]");
    const card = cards[index] as HTMLElement;
    if (card) {
      card.scrollIntoView({ behavior: "smooth", inline: "center" });
    }
  };

  return (
    <>
      {/* Horizontal scroll container */}
      <div
        className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-4 pb-4 sm:-mx-6 sm:gap-6 sm:px-6 lg:px-8"
        ref={scrollRef}
      >
        {useCases.map((useCase, index) => {
          const Icon = iconMap[useCase.iconName];
          return (
            <div
              className={cn(
                "w-[85vw] max-w-md shrink-0 snap-center overflow-hidden rounded-lg border border-border bg-card transition-colors duration-300 sm:w-[70vw] lg:w-[400px]",
                activeIndex === index && "border-brand/40"
              )}
              data-card
              key={useCase.id}
            >
              {/* Card header */}
              <div className="border-border border-b p-6">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
                    <Icon className="size-5 text-brand-text" />
                  </div>
                  <h3 className="font-heading font-semibold text-lg tracking-tight">
                    {useCase.title}
                  </h3>
                </div>
                <p className="text-muted-foreground text-sm">
                  {useCase.description}
                </p>
              </div>

              {/* Code snippet */}
              <div className="overflow-hidden bg-muted/30 p-4">
                <pre className="overflow-x-auto font-mono text-xs">
                  <code className="text-foreground/80">{useCase.code}</code>
                </pre>
              </div>
            </div>
          );
        })}
      </div>

      {/* Dot indicators */}
      <div className="mt-6 flex justify-center gap-2">
        {useCases.map((useCase, index) => (
          <button
            aria-label={`Go to ${useCase.title}`}
            className={cn(
              "size-2 rounded-full transition-all",
              activeIndex === index
                ? "w-6 bg-brand"
                : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
            )}
            key={useCase.id}
            onClick={() => scrollToIndex(index)}
            type="button"
          />
        ))}
      </div>
    </>
  );
}
