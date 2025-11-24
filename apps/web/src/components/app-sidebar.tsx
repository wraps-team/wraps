"use client";

import { BarChart3, Mail } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { Logo } from "@/components/logo";
import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { OrganizationSwitcher } from "@/components/organization-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useActiveOrganization } from "@/contexts/organization-context";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { activeOrganization } = useActiveOrganization();
  const orgSlug = activeOrganization?.slug ?? "";

  // Organization-scoped navigation
  const orgScopedNavGroups = orgSlug
    ? [
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
            // {
            //   title: "Webhooks",
            //   url: `/${orgSlug}/webhooks`,
            //   icon: Webhook,
            // },
          ],
        },
      ]
    : [];

  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg">
              <Link href={orgSlug ? `/${orgSlug}/emails` : "/dashboard"}>
                <Logo className="rounded-sm" size={42} />
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
      </SidebarContent>
      <SidebarFooter>
        {/* <SidebarNotification /> */}
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
