"use client";

import {
  BookOpen,
  LayoutDashboardIcon,
  Mail,
  MessageSquare,
  Settings,
  ShieldCheck,
  Users,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type * as React from "react";
import { Logo } from "@/components/logo";
import { NavHelp } from "@/components/nav-help";
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
  const planFeatures = productsStatus?.planFeatures;

  const isBillingOnly = productsStatus?.userRole === "billing";

  const emailNavGroup = orgSlug
    ? {
        title: "Email",
        icon: Mail,
        items: [
          ...(isBillingOnly
            ? []
            : [
                { title: "Emails", url: `/${orgSlug}/emails` },
                { title: "Inbound", url: `/${orgSlug}/emails/inbound` },
                { title: "Broadcast", url: `/${orgSlug}/emails/broadcasts` },
                { title: "Templates", url: `/${orgSlug}/emails/templates` },
                { title: "Brand Kits", url: `/${orgSlug}/emails/brand-kits` },
              ]),
          { title: "Analytics", url: `/${orgSlug}/emails/analytics` },
        ],
      }
    : null;

  // Deliverability — the SES operations hub. Sits as a top-level sibling to
  // Email/SMS because it spans account-level reputation, IP pools, and AWS
  // production access rather than a single sending surface.
  const deliverabilityNavGroup =
    orgSlug && !isBillingOnly
      ? {
          title: "Deliverability",
          icon: ShieldCheck,
          items: [
            { title: "Overview", url: `/${orgSlug}/deliverability` },
            {
              title: "Reputation",
              url: `/${orgSlug}/deliverability/reputation`,
            },
            { title: "IP Pools", url: `/${orgSlug}/deliverability/ip-pools` },
            {
              title: "Production Access",
              url: `/${orgSlug}/deliverability/production-access`,
            },
          ],
        }
      : null;

  const smsNavGroup = orgSlug
    ? {
        title: "SMS",
        icon: MessageSquare,
        items: [
          ...(isBillingOnly
            ? []
            : [{ title: "Messages", url: `/${orgSlug}/sms` }]),
          { title: "Analytics", url: `/${orgSlug}/sms/analytics` },
        ],
      }
    : null;

  const audienceNavGroup =
    orgSlug && !isBillingOnly
      ? {
          title: "Audience",
          icon: Users,
          items: [
            { title: "Contacts", url: `/${orgSlug}/contacts` },
            { title: "Events", url: `/${orgSlug}/events` },
            { title: "Topics", url: `/${orgSlug}/topics` },
            { title: "Segments", url: `/${orgSlug}/segments` },
          ],
        }
      : null;

  // Automations navigation - requires Scale+ plan
  const automationsNavGroup =
    orgSlug && !isBillingOnly && planFeatures?.workflows
      ? {
          title: "Automations",
          icon: Workflow,
          items: [{ title: "Workflows", url: `/${orgSlug}/automations` }],
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
            title: "SSO",
            url: `/${orgSlug}/settings/sso`,
          },
          {
            title: "Audit Logs",
            url: `/${orgSlug}/settings/audit-logs`,
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
    deliverabilityNavGroup,
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
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <a
                href="https://wraps.dev/docs"
                rel="noopener noreferrer"
                target="_blank"
              >
                <BookOpen className="size-4" />
                <span>Docs</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <NavHelp />
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
