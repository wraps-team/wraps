"use client";

import { Separator } from "@wraps/ui/components/ui/separator";
import { InboxButton } from "better-inbox/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CommandSearch, SearchTrigger } from "@/components/command-search";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useActiveOrganization } from "@/contexts/organization-context";
import { authClient } from "@/lib/auth-client";

/**
 * Check if the event target is an input element
 */
function isInputElement(target: EventTarget | null): boolean {
  if (!target) {
    return false;
  }
  if (target instanceof HTMLInputElement) {
    return true;
  }
  if (target instanceof HTMLTextAreaElement) {
    return true;
  }
  if ((target as HTMLElement)?.isContentEditable) {
    return true;
  }
  return false;
}

/**
 * Get the navigation URL for a G-prefix shortcut key
 */
function getShortcutUrl(key: string, orgSlug: string): string | null {
  const shortcuts: Record<string, string> = {
    E: `/${orgSlug}/emails`,
    T: `/${orgSlug}/emails/templates`,
    A: `/${orgSlug}/emails/analytics`,
    S: `/${orgSlug}/settings`,
  };
  return shortcuts[key] ?? null;
}

export function SiteHeader() {
  const [searchOpen, setSearchOpen] = useState(false);
  const router = useRouter();
  const { activeOrganization } = useActiveOrganization();
  const orgSlug = activeOrganization?.slug;

  // ⌘K to open command menu
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // G-prefix shortcuts (work when menu is closed)
  useEffect(() => {
    if (searchOpen || !orgSlug) {
      return;
    }

    let pendingKey: string | null = null;
    let pendingTimeout: NodeJS.Timeout | null = null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isInputElement(e.target)) {
        return;
      }

      const key = e.key.toUpperCase();

      // Handle "G" prefix shortcuts
      if (pendingKey === "G") {
        if (pendingTimeout) {
          clearTimeout(pendingTimeout);
        }
        pendingKey = null;

        const url = getShortcutUrl(key, orgSlug);
        if (url) {
          e.preventDefault();
          router.push(url);
        }
        return;
      }

      // Start "G" prefix sequence
      if (key === "G") {
        pendingKey = "G";
        pendingTimeout = setTimeout(() => {
          pendingKey = null;
        }, 500);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (pendingTimeout) {
        clearTimeout(pendingTimeout);
      }
    };
  }, [searchOpen, orgSlug, router]);

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
          <div className="ml-auto">
            <InboxButton
              client={authClient}
              onNavigate={(href) => router.push(href)}
            />
          </div>
        </div>
      </header>
      <CommandSearch onOpenChange={setSearchOpen} open={searchOpen} />
    </>
  );
}
