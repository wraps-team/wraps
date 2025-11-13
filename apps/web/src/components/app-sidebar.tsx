"use client";

import {
  BarChart3,
  Building2,
  LayoutDashboard,
  Mail,
  Settings,
  Users,
  Webhook,
} from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { Logo } from "@/components/logo";
import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { OrganizationSwitcher } from "@/components/organization-switcher";
import { SidebarNotification } from "@/components/sidebar-notification";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { useActiveOrganization } from "@/contexts/organization-context";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { activeOrganization } = useActiveOrganization();
  const orgSlug = activeOrganization?.slug ?? "";

  // Organization-scoped navigation
  const orgScopedNavGroups = orgSlug
    ? [
        {
          label: "Overview",
          items: [
            {
              title: "Dashboard",
              url: `/${orgSlug}`,
              icon: LayoutDashboard,
            },
          ],
        },
        {
          label: "Email Infrastructure",
          items: [
            {
              title: "Emails",
              url: `/${orgSlug}/emails`,
              icon: Mail,
            },
            {
              title: "Analytics",
              url: `/${orgSlug}/analytics`,
              icon: BarChart3,
            },
            {
              title: "Webhooks",
              url: `/${orgSlug}/webhooks`,
              icon: Webhook,
            },
          ],
        },
        {
          label: "Management",
          items: [
            {
              title: "AWS Accounts",
              url: `/${orgSlug}/aws-accounts`,
              icon: Building2,
            },
            {
              title: "Members",
              url: `/${orgSlug}/members`,
              icon: Users,
            },
            {
              title: "Organization",
              url: "#",
              icon: Settings,
              items: [
                {
                  title: "General",
                  url: `/${orgSlug}/settings/general`,
                },
                {
                  title: "Billing",
                  url: `/${orgSlug}/settings/billing`,
                },
                {
                  title: "Integrations",
                  url: `/${orgSlug}/settings/integrations`,
                },
              ],
            },
          ],
        },
      ]
    : [];

  // User-scoped navigation (always available)
  const userScopedNavGroups = [
    {
      label: "User Settings",
      items: [
        {
          title: "Settings",
          url: "#",
          icon: Settings,
          items: [
            {
              title: "Account",
              url: "/settings/account",
            },
            {
              title: "Profile",
              url: "/settings/profile",
            },
            {
              title: "Appearance",
              url: "/settings/appearance",
            },
            {
              title: "Notifications",
              url: "/settings/notifications",
            },
          ],
        },
      ],
    },
  ];

  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg">
              <Link href="/dashboard">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Logo className="text-current" size={24} />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">Wraps</span>
                  <span className="truncate text-xs">Email Infrastructure</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <OrganizationSwitcher />
      </SidebarHeader>
      <SidebarContent>
        {orgScopedNavGroups.map((group) => (
          <NavMain items={group.items} key={group.label} label={group.label} />
        ))}
        {orgSlug && <SidebarSeparator />}
        {userScopedNavGroups.map((group) => (
          <NavMain items={group.items} key={group.label} label={group.label} />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <SidebarNotification />
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
