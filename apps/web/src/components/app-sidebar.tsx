"use client";

import {
  LayoutDashboardIcon,
  Mail,
  MessageSquare,
  Settings,
  Users,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type * as React from "react";
import { Logo } from "@/components/logo";
import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { OrganizationSwitcher } from "@/components/organization-switcher";
import { SidebarUpgrade } from "@/components/sidebar-upgrade";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { useActiveOrganization } from "@/contexts/organization-context";
import { useProductsStore } from "@/stores/products-store";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { activeOrganization } = useActiveOrganization();
  const params = useParams<{ orgSlug?: string }>();
  const orgSlug = activeOrganization?.slug ?? params.orgSlug ?? "";
  const productsStatus = useProductsStore((s) => s.status);

  // Check if products are enabled (hydrated from server, no flash)
  const isEmailEnabled = productsStatus?.emailEnabled ?? false;
  const isSMSEnabled = productsStatus?.smsEnabled ?? false;
  const planFeatures = productsStatus?.planFeatures;

  // Email navigation - always shown with full nav if enabled, otherwise single link
  const emailNavGroup = orgSlug
    ? {
        title: "Email",
        icon: Mail,
        items: isEmailEnabled
          ? [
              {
                title: "Emails",
                url: `/${orgSlug}/emails`,
              },
              {
                title: "Inbound",
                url: `/${orgSlug}/emails/inbound`,
              },
              {
                title: "Broadcast",
                url: `/${orgSlug}/emails/broadcasts`,
              },
              {
                title: "Templates",
                url: `/${orgSlug}/emails/templates`,
              },
              {
                title: "Brand Kits",
                url: `/${orgSlug}/emails/brand-kits`,
              },
              {
                title: "Analytics",
                url: `/${orgSlug}/emails/analytics`,
              },
            ]
          : [
              {
                title: "Setup Email",
                url: `/${orgSlug}/emails/setup`,
              },
            ],
      }
    : null;

  // SMS navigation - full nav if enabled, otherwise single link to setup
  const smsNavGroup = orgSlug
    ? {
        title: "SMS",
        icon: MessageSquare,
        items: isSMSEnabled
          ? [
              {
                title: "Messages",
                url: `/${orgSlug}/sms`,
              },
              {
                title: "Analytics",
                url: `/${orgSlug}/sms/analytics`,
              },
            ]
          : [
              {
                title: "Setup SMS",
                url: `/${orgSlug}/sms/setup`,
              },
            ],
      }
    : null;

  // Audience navigation - Contacts always shown, Topics/Segments gated by plan
  const audienceNavGroup = orgSlug
    ? {
        title: "Audience",
        icon: Users,
        items: [
          {
            title: "Contacts",
            url: `/${orgSlug}/contacts`,
          },
          {
            title: "Events",
            url: `/${orgSlug}/events`,
          },
          // Topics - requires Starter plan
          ...(planFeatures?.topics
            ? [
                {
                  title: "Topics",
                  url: `/${orgSlug}/topics`,
                },
              ]
            : []),
          // Segments - requires Starter plan
          ...(planFeatures?.segments
            ? [
                {
                  title: "Segments",
                  url: `/${orgSlug}/segments`,
                },
              ]
            : []),
        ],
      }
    : null;

  // Automations navigation - requires Scale+ plan
  const automationsNavGroup =
    orgSlug && planFeatures?.automations
      ? {
          title: "Automations",
          icon: Workflow,
          items: [
            {
              title: "Automations",
              url: `/${orgSlug}/automations`,
            },
          ],
        }
      : null;

  // Settings navigation
  const settingsNavGroup = orgSlug
    ? {
        title: "Settings",
        icon: Settings,
        items: [
          {
            title: "General",
            url: `/${orgSlug}/settings`,
          },
          {
            title: "Sender Defaults",
            url: `/${orgSlug}/settings/sender-defaults`,
          },
          {
            title: "AWS Accounts",
            url: `/${orgSlug}/settings/aws-accounts`,
          },
          {
            title: "API Keys",
            url: `/${orgSlug}/settings/api-keys`,
          },
          {
            title: "Members",
            url: `/${orgSlug}/settings/members`,
          },
          {
            title: "Billing",
            url: `/${orgSlug}/settings/billing`,
          },
        ],
      }
    : null;

  const orgScopedNavGroups = [
    audienceNavGroup,
    emailNavGroup,
    smsNavGroup,
    automationsNavGroup,
    settingsNavGroup,
  ].filter((g): g is NonNullable<typeof g> => g !== null);

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg">
              <Link href={orgSlug ? `/${orgSlug}` : "/"}>
                <Logo className="rounded-sm" size={32} />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <OrganizationSwitcher />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link href={`/${orgSlug}`}>
                <LayoutDashboardIcon className="h-4 w-4" />
                <span>Overview</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={orgScopedNavGroups} />
      </SidebarContent>
      <SidebarFooter>
        <SidebarUpgrade />
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
