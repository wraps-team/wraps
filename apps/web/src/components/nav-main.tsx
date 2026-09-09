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
                  {item.items.map((subItem) => (
                    <Link
                      className={`rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground ${
                        isSubItemActive(subItem.url, item.items)
                          ? "bg-accent font-medium text-accent-foreground"
                          : "text-muted-foreground"
                      }`}
                      href={subItem.url}
                      key={subItem.title}
                      prefetch={false}
                    >
                      {subItem.title}
                    </Link>
                  ))}
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
                    <span>{item.title}</span>
                    <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
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
                          <Link href={subItem.url} prefetch={false}>
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
