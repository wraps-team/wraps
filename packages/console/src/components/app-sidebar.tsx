"use client";

import type { LucideIcon } from "lucide-react";
import { Activity, BarChart3, Mail, Settings } from "lucide-react";
import * as React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

type SubItem = {
  title: string;
  icon: LucideIcon;
  url: string;
};

type NavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  isActive: boolean;
  isDashboard?: boolean;
  subItems?: SubItem[];
};

const data = {
  user: {
    name: "Wraps Console",
    email: "admin@wraps.dev",
    avatar: "/avatars/wraps.jpg",
  },
  navMain: [
    {
      title: "Dashboard",
      url: "/",
      icon: Activity,
      isActive: true,
      isDashboard: true,
    },
    {
      title: "Email",
      url: "#",
      icon: Mail,
      isActive: false,
      subItems: [
        { title: "Emails", icon: Mail, url: "/email" },
        { title: "Metrics", icon: BarChart3, url: "/email/metrics" },
        { title: "Settings", icon: Settings, url: "/email/settings" },
      ],
    },
  ] as NavItem[],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const location = useLocation();
  const navigate = useNavigate();
  const { setOpen, state } = useSidebar();

  // Determine active product based on current route
  const getActiveProduct = React.useCallback(() => {
    if (location.pathname === "/") {
      return data.navMain[0];
    }
    if (location.pathname.startsWith("/email")) {
      return data.navMain[1];
    }
    // Default to dashboard
    return data.navMain[0];
  }, [location.pathname]);

  const [activeProduct, setActiveProduct] = React.useState<NavItem>(
    getActiveProduct()
  );

  // Update active product when route changes
  React.useEffect(() => {
    setActiveProduct(getActiveProduct());
  }, [location.pathname, getActiveProduct]);

  return (
    <Sidebar
      className="overflow-hidden *:data-[sidebar=sidebar]:flex-row"
      collapsible="icon"
      {...props}
    >
      {/* First sidebar - Product icons */}
      <Sidebar
        className="w-[calc(var(--sidebar-width-icon)+1px)]! border-r"
        collapsible="none"
      >
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                className="md:h-8 md:p-0"
                onClick={() => {
                  setActiveProduct(data.navMain[0]);
                  setOpen(false);
                }}
                size="lg"
              >
                <Link to="/">
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                    <Activity className="size-4" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">Wraps</span>
                    <span className="truncate text-xs">Console</span>
                  </div>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent className="px-1.5 md:px-0">
              <SidebarMenu>
                {data.navMain
                  .filter((item) => !item.isDashboard)
                  .map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        className="px-2.5 md:px-2"
                        isActive={activeProduct?.title === item.title}
                        onClick={() => {
                          setActiveProduct(item);
                          setOpen(true);
                          // Navigate to first sub-item when clicking product icon
                          if (item.subItems && item.subItems.length > 0) {
                            navigate(item.subItems[0].url);
                          }
                        }}
                        tooltip={{
                          children: item.title,
                          hidden: false,
                        }}
                      >
                        <item.icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <NavUser user={data.user} />
        </SidebarFooter>
      </Sidebar>

      {/* Second sidebar - Submenu */}
      {state === "expanded" && (
        <Sidebar className="hidden flex-1 md:flex" collapsible="none">
          {activeProduct &&
          !activeProduct.isDashboard &&
          activeProduct.subItems ? (
            <>
              <SidebarHeader className="gap-3.5 border-b p-4">
                <div className="flex w-full items-center justify-between">
                  <div className="flex items-center gap-2 font-medium text-base text-foreground">
                    <activeProduct.icon className="size-4" />
                    {activeProduct.title}
                  </div>
                </div>
                <SidebarInput placeholder="Search..." />
              </SidebarHeader>
              <SidebarContent>
                <SidebarGroup className="px-0">
                  <SidebarGroupContent>
                    {activeProduct.subItems.map((subItem) => (
                      <Link
                        className="flex items-center gap-3 border-b p-4 text-sm leading-tight transition-colors last:border-b-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        key={subItem.title}
                        to={subItem.url}
                      >
                        <subItem.icon className="size-4 shrink-0" />
                        <span className="font-medium">{subItem.title}</span>
                      </Link>
                    ))}
                  </SidebarGroupContent>
                </SidebarGroup>
              </SidebarContent>
            </>
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-center">
              <div className="text-muted-foreground">
                <Activity className="mx-auto mb-4 size-12 opacity-50" />
                <p className="text-sm">Select a product to view options</p>
              </div>
            </div>
          )}
        </Sidebar>
      )}
    </Sidebar>
  );
}
