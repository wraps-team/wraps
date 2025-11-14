"use client";

import * as React from "react";
import { CommandSearch, SearchTrigger } from "@/components/command-search";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

export function SiteHeader() {
  const [searchOpen, setSearchOpen] = React.useState(false);

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return (
    <>
      <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
        <div className="flex w-full items-center gap-1 px-4 py-3 lg:gap-2 lg:px-6">
          <SidebarTrigger className="-ml-1" />
          <Separator
            className="mx-2 data-[orientation=vertical]:h-4"
            orientation="vertical"
          />
          <div className="max-w-sm flex-1">
            <SearchTrigger onClick={() => setSearchOpen(true)} />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              asChild
              className="hidden sm:flex"
              size="sm"
              variant="ghost"
            >
              <a
                className="dark:text-foreground"
                href="https://github.com/silicondeck/shadcn-dashboard-landing-template"
                rel="noopener noreferrer"
                target="_blank"
              >
                GitHub
              </a>
            </Button>
            <ModeToggle />
          </div>
        </div>
      </header>
      <CommandSearch onOpenChange={setSearchOpen} open={searchOpen} />
    </>
  );
}
