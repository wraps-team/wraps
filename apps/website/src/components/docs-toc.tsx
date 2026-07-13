"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type TocItem = {
  id: string;
  text: string;
  level: 2 | 3;
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// Return `base`, or `base-2`, `base-3`, … so repeated heading text (e.g. several
// "Parameters" sections) yields unique ids. Records the result in `used`.
function uniqueId(base: string, used: Set<string>): string {
  let id = base;
  let suffix = 2;
  while (used.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(id);
  return id;
}

export function DocsToc({
  contentRef,
}: {
  contentRef: React.RefObject<HTMLElement | null>;
}) {
  const [items, setItems] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Scan headings on mount and when content changes
  useEffect(() => {
    const container = contentRef.current;
    if (!container) {
      return;
    }

    const headings = container.querySelectorAll("h2, h3");
    const tocItems: TocItem[] = [];
    const usedIds = new Set<string>();

    for (const heading of headings) {
      const el = heading as HTMLElement;

      // Skip headings inside cards (e.g. CardTitle, help sections)
      if (el.closest("[data-slot='card']") || el.closest(".card")) {
        continue;
      }

      // Extract visible text, skipping badge/icon children
      let text = "";
      for (const node of el.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          text += node.textContent;
        } else if (
          node.nodeType === Node.ELEMENT_NODE &&
          !(node as HTMLElement).classList.contains("flex") &&
          (node as HTMLElement).tagName !== "DIV" &&
          (node as HTMLElement).tagName !== "SVG"
        ) {
          text += (node as HTMLElement).textContent;
        }
      }
      text = text.trim();
      if (!text) {
        continue;
      }

      const baseId = el.id || slugify(text);
      if (!baseId) {
        continue;
      }

      // Guarantee a unique id even when several headings share the same text —
      // otherwise the TOC emits duplicate React keys and the page has duplicate
      // anchors that break scroll-to.
      const id = uniqueId(baseId, usedIds);
      if (el.id !== id) {
        el.id = id;
      }

      tocItems.push({
        id,
        text,
        level: el.tagName === "H2" ? 2 : 3,
      });
    }

    setItems(tocItems);
  }, [contentRef]);

  // Track active section with IntersectionObserver
  useEffect(() => {
    if (items.length === 0) {
      return;
    }

    const container = contentRef.current;
    if (!container) {
      return;
    }

    // Clean up previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    const visibleIds = new Set<string>();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visibleIds.add(entry.target.id);
          } else {
            visibleIds.delete(entry.target.id);
          }
        }

        // Pick the first visible heading in document order
        if (visibleIds.size > 0) {
          const first = items.find((item) => visibleIds.has(item.id));
          if (first) {
            setActiveId(first.id);
          }
        }
      },
      {
        rootMargin: "-64px 0px -60% 0px",
        threshold: 0,
      }
    );

    for (const item of items) {
      const el = document.getElementById(item.id);
      if (el) {
        observerRef.current.observe(el);
      }
    }

    return () => {
      observerRef.current?.disconnect();
    };
  }, [items, contentRef]);

  if (items.length === 0) {
    return null;
  }

  return (
    <nav className="space-y-1">
      <p className="mb-3 font-medium text-sm text-foreground">On this page</p>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id}>
            <a
              className={cn(
                "block text-sm leading-6 transition-colors hover:text-foreground",
                item.level === 3 && "pl-3",
                activeId === item.id
                  ? "text-primary font-medium"
                  : "text-muted-foreground"
              )}
              href={`#${item.id}`}
              onClick={(e) => {
                e.preventDefault();
                const el = document.getElementById(item.id);
                if (el) {
                  el.scrollIntoView({ behavior: "smooth" });
                  // Update URL hash without jumping
                  window.history.replaceState(null, "", `#${item.id}`);
                  setActiveId(item.id);
                }
              }}
            >
              {item.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
