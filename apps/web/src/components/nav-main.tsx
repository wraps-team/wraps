"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@wraps/ui/components/ui/collapsible";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@wraps/ui/components/ui/hover-card";
import { ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useSidebarSections } from "@/hooks/use-sidebar-sections";
import { cn } from "@/lib/utils";

/** Overview is exact-match only: every dashboard route starts with `/${orgSlug}`. */
export function isOverviewActive(pathname: string, orgSlug: string) {
  return orgSlug !== "" && pathname === `/${orgSlug}`;
}

export function NavMain({
  items,
}: {
  items: {
    title: string;
    icon: LucideIcon;
    isActive?: boolean;
    items: {
      title: string;
      url: string;
    }[];
  }[];
}) {
  const pathname = usePathname();
  const { state, isMobile } = useSidebar();
  const isCollapsed = state === "collapsed" && !isMobile;

  const sectionTitles = useMemo(() => items.map((item) => item.title), [items]);
  const { isSectionOpen, toggleSection, openSection, isHydrated } =
    useSidebarSections(sectionTitles);

  // Check if any subitem is active to determine if parent should be open
  const isGroupActive = useCallback(
    (group: (typeof items)[0]) => {
      if (group.isActive) {
        return true;
      }
      return group.items.some(
        (subItem) =>
          pathname === subItem.url || pathname.startsWith(`${subItem.url}/`)
      );
    },
    [pathname]
  );

  // Auto-open sections when navigating to them
  useEffect(() => {
    if (!isHydrated) {
      return;
    }
    for (const item of items) {
      if (isGroupActive(item)) {
        openSection(item.title);
      }
    }
  }, [isHydrated, items, openSection, isGroupActive]);

  // Check if a sub-item is active, preferring the most specific match
  const isSubItemActive = (url: string, siblings: { url: string }[]) => {
    if (pathname === url) {
      return true;
    }
    if (!pathname.startsWith(`${url}/`)) {
      return false;
    }
    // Only match prefix if no sibling has a more specific match
    const hasMoreSpecificMatch = siblings.some(
      (sibling) =>
        sibling.url !== url &&
        sibling.url.length > url.length &&
        (pathname === sibling.url || pathname.startsWith(`${sibling.url}/`))
    );
    return !hasMoreSpecificMatch;
  };

  return (
    <SidebarGroup>
      <SidebarMenu>
        {items.map((item) =>
          isCollapsed ? (
            // Collapsed: show hover card with sub-items
            <HoverCard closeDelay={100} key={item.title} openDelay={0}>
              <HoverCardTrigger asChild>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive={isGroupActive(item)}>
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </HoverCardTrigger>
              <HoverCardContent
                align="start"
                className="w-48 p-2"
                side="right"
                sideOffset={8}
              >
                <div className="flex flex-col gap-1">
                  <div className="px-2 py-1.5 font-medium text-sm">
                    {item.title}
                  </div>
                  <div className="mx-2 flex flex-col gap-1 border-border border-l px-2">
                    {item.items.map((subItem) => {
                      const active = isSubItemActive(subItem.url, item.items);
                      return (
                        <Link
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "relative rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                            active
                              ? "font-medium text-foreground before:absolute before:inset-y-0 before:-left-[9px] before:w-0.5 before:bg-sidebar-indicator"
                              : "text-muted-foreground"
                          )}
                          href={subItem.url}
                          key={subItem.title}
                          prefetch={false}
                        >
                          {subItem.title}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </HoverCardContent>
            </HoverCard>
          ) : (
            // Expanded: show collapsible with sub-items
            <Collapsible
              asChild
              className="group/collapsible"
              key={item.title}
              onOpenChange={() => toggleSection(item.title)}
              open={isSectionOpen(item.title)}
            >
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton tooltip={item.title}>
                    <item.icon />
                    <span className={cn(isGroupActive(item) && "font-medium")}>
                      {item.title}
                    </span>
                    <span className="ml-auto flex items-center gap-2">
                      {isGroupActive(item) && !isSectionOpen(item.title) && (
                        <span
                          aria-hidden="true"
                          className="size-1.5 shrink-0 rounded-full bg-sidebar-indicator"
                          data-slot="sidebar-group-indicator"
                        />
                      )}
                      <ChevronRight className="transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    </span>
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {item.items.map((subItem) => (
                      <SidebarMenuSubItem key={subItem.title}>
                        <SidebarMenuSubButton
                          asChild
                          isActive={isSubItemActive(subItem.url, item.items)}
                        >
                          <Link
                            aria-current={
                              isSubItemActive(subItem.url, item.items)
                                ? "page"
                                : undefined
                            }
                            href={subItem.url}
                            prefetch={false}
                          >
                            <span>{subItem.title}</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          )
        )}
      </SidebarMenu>
    </SidebarGroup>
  );
}
