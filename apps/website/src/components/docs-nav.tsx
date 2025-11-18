"use client";

import { Book, Code, FileText, Rocket, Terminal } from "lucide-react";
import { useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

type NavItem = {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
};

type NavSection = {
  title: string;
  items: NavItem[];
};

const navItems: NavSection[] = [
  {
    title: "Getting Started",
    items: [
      {
        title: "Introduction",
        href: "/docs",
        icon: FileText,
      },
      {
        title: "Quickstart",
        href: "/docs/quickstart",
        icon: Rocket,
      },
    ],
  },
  {
    title: "Reference",
    items: [
      {
        title: "CLI Reference",
        href: "/docs/cli-reference",
        icon: Terminal,
      },
      {
        title: "SDK Reference",
        href: "/docs/sdk-reference",
        icon: Code,
      },
    ],
  },
  {
    title: "Guides",
    items: [
      {
        title: "Guides",
        href: "/docs/guides",
        icon: Book,
        disabled: true,
      },
    ],
  },
];

export function DocsNav() {
  const location = useLocation();
  const pathname = location.pathname;

  return (
    <nav className="w-full">
      {navItems.map((section) => (
        <div key={section.title} className="pb-8">
          <h4 className="mb-3 px-2 font-semibold text-muted-foreground text-sm uppercase tracking-wider">
            {section.title}
          </h4>
          <div className="space-y-1">
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;

              return (
                <a
                  key={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    item.disabled && "pointer-events-none opacity-50"
                  )}
                  href={item.disabled ? undefined : item.href}
                >
                  <Icon className="h-4 w-4" />
                  {item.title}
                  {item.disabled && (
                    <span className="ml-auto text-xs">(Soon)</span>
                  )}
                </a>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
