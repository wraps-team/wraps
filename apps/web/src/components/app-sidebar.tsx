"use client";

import {
  BarChart3,
  Cloud,
  CreditCard,
  FileText,
  Filter,
  Key,
  Mail,
  MessageSquare,
  Radio,
  Settings,
  Tag,
  UserSquare2,
  Users,
} from "lucide-react";
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
import { useProductsStore } from "@/stores/products-store";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { activeOrganization } = useActiveOrganization();
  const orgSlug = activeOrganization?.slug ?? "";
  const productsStatus = useProductsStore((s) => s.status);

  // Check if products are enabled (hydrated from server, no flash)
  const isEmailEnabled = productsStatus?.emailEnabled ?? false;
  const isSMSEnabled = productsStatus?.smsEnabled ?? false;
  const planFeatures = productsStatus?.planFeatures;

  // Email navigation - always shown with full nav if enabled, otherwise single link
  const emailNavGroup = orgSlug
    ? {
        label: "Email",
        items: isEmailEnabled
          ? [
              {
                title: "Emails",
                url: `/${orgSlug}/emails`,
                icon: Mail,
              },
              {
                title: "Broadcast",
                url: `/${orgSlug}/send`,
                icon: Radio,
              },
              {
                title: "Templates",
                url: `/${orgSlug}/emails/templates`,
                icon: FileText,
              },
              {
                title: "Analytics",
                url: `/${orgSlug}/emails/analytics`,
                icon: BarChart3,
              },
            ]
          : [
              {
                title: "Setup Email",
                url: `/${orgSlug}/emails/setup`,
                icon: Mail,
              },
            ],
      }
    : null;

  // SMS navigation - full nav if enabled, otherwise single link to setup
  const smsNavGroup = orgSlug
    ? {
        label: "SMS",
        items: isSMSEnabled
          ? [
              {
                title: "SMS",
                url: `/${orgSlug}/sms`,
                icon: MessageSquare,
              },
              {
                title: "Analytics",
                url: `/${orgSlug}/sms/analytics`,
                icon: BarChart3,
              },
            ]
          : [
              {
                title: "Setup SMS",
                url: `/${orgSlug}/sms/setup`,
                icon: MessageSquare,
              },
            ],
      }
    : null;

  // Audience navigation - Contacts always shown, Topics/Segments gated by plan
  const audienceNavGroup = orgSlug
    ? {
        label: "Audience",
        items: [
          {
            title: "Contacts",
            url: `/${orgSlug}/contacts`,
            icon: UserSquare2,
          },
          // Topics - requires Pro plan
          ...(planFeatures?.topics
            ? [
                {
                  title: "Topics",
                  url: `/${orgSlug}/topics`,
                  icon: Tag,
                },
              ]
            : []),
          // Segments - requires Pro plan
          ...(planFeatures?.segments
            ? [
                {
                  title: "Segments",
                  url: `/${orgSlug}/segments`,
                  icon: Filter,
                },
              ]
            : []),
        ],
      }
    : null;

  // Settings navigation
  const settingsNavGroup = orgSlug
    ? {
        label: "Settings",
        items: [
          {
            title: "General",
            url: `/${orgSlug}/settings`,
            icon: Settings,
          },
          {
            title: "AWS Accounts",
            url: `/${orgSlug}/settings/aws-accounts`,
            icon: Cloud,
          },
          {
            title: "API Keys",
            url: `/${orgSlug}/settings/api-keys`,
            icon: Key,
          },
          {
            title: "Members",
            url: `/${orgSlug}/settings/members`,
            icon: Users,
          },
          {
            title: "Billing",
            url: `/${orgSlug}/settings/billing`,
            icon: CreditCard,
          },
        ],
      }
    : null;

  const orgScopedNavGroups = [
    audienceNavGroup,
    emailNavGroup,
    smsNavGroup,
    settingsNavGroup,
  ].filter((g): g is NonNullable<typeof g> => g !== null);

  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg">
              <Link href={orgSlug ? `/${orgSlug}/emails` : "/"}>
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
