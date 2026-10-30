"use client";

import { Panel, PanelTitle } from "@wraps/ui/components/ui/panel";
import {
  CheckCircle2Icon,
  CloudIcon,
  GitBranchIcon,
  LayoutTemplateIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SetupStatus } from "../page";
import { HelpCard } from "./help-card";

type ExploreFirstDashboardProps = {
  orgSlug: string;
  organizationName: string;
  setupStatus: SetupStatus;
  memberCount: number;
};

type ActivityCardProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
  isComplete: boolean;
};

/**
 * One setup step as a panel. The icon sits top right; a completed step swaps
 * it for a tick in the success colour.
 */
function ActivityCard({
  icon,
  title,
  description,
  ctaLabel,
  ctaHref,
  isComplete,
}: ActivityCardProps) {
  return (
    <Panel
      actions={
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center",
            isComplete
              ? "bg-success/15 text-success"
              : "bg-primary/10 text-primary"
          )}
        >
          {isComplete ? <CheckCircle2Icon className="h-5 w-5" /> : icon}
        </div>
      }
      description={description}
      label={<PanelTitle level={3}>{title}</PanelTitle>}
    >
      <Button asChild size="sm" variant={isComplete ? "outline" : "default"}>
        <Link href={ctaHref}>{isComplete ? "View" : ctaLabel}</Link>
      </Button>
    </Panel>
  );
}

export function ExploreFirstDashboard({
  orgSlug,
  organizationName,
  setupStatus,
  memberCount,
}: ExploreFirstDashboardProps) {
  const activities = [
    {
      complete: setupStatus.hasTemplate,
      label: "Templates",
    },
    {
      complete: setupStatus.hasContact,
      label: "Contacts",
    },
    {
      complete: setupStatus.hasWorkflow,
      label: "Automations",
    },
    {
      complete: memberCount > 1,
      label: "Team",
    },
  ];

  const completedCount = activities.filter((a) => a.complete).length;

  return (
    <>
      {/* Page Header */}
      <div className="px-4 lg:px-6">
        <div className="flex flex-col gap-1">
          <h1 className="font-bold text-2xl tracking-tight">
            Welcome to {organizationName}
          </h1>
          <p className="text-muted-foreground">
            Explore the product below. Connect AWS when you're ready to send.
          </p>
        </div>

        {/* Progress indicator */}
        <div className="mt-4 flex items-center gap-3">
          {activities.map((activity) => (
            <div className="flex items-center gap-1.5" key={activity.label}>
              <div
                className={cn(
                  "h-2 w-2 rounded-full",
                  activity.complete ? "bg-success" : "bg-muted-foreground/30"
                )}
              />
              <span
                className={cn(
                  "text-xs",
                  activity.complete
                    ? "text-foreground"
                    : "text-muted-foreground"
                )}
              >
                {activity.label}
              </span>
            </div>
          ))}
          <span className="ml-auto text-muted-foreground text-xs">
            {completedCount} of {activities.length} started
          </span>
        </div>
      </div>

      {/* Main Content */}
      <div className="@container/main px-4 lg:px-6">
        {/* Connect AWS panel - primary CTA */}
        <Panel
          actions={<CloudIcon aria-hidden="true" className="size-5" />}
          className="mb-6"
          description="You can explore templates and contacts now, but sending requires your AWS account. Connect it to send your first email — your infrastructure, your data, AWS pricing."
          label={<PanelTitle>Connect AWS to start sending</PanelTitle>}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button asChild className="w-full sm:w-auto">
              <Link href={`/${orgSlug}/setup`}>Connect AWS</Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <a
                href="https://wraps.dev/docs"
                rel="noopener noreferrer"
                target="_blank"
              >
                Learn more
              </a>
            </Button>
          </div>
        </Panel>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left Column - Activity Cards */}
          <div className="lg:col-span-2">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ActivityCard
                ctaHref={`/${orgSlug}/emails/templates/new`}
                ctaLabel="Create Template"
                description="Design beautiful, reusable email templates."
                icon={<LayoutTemplateIcon className="h-5 w-5" />}
                isComplete={setupStatus.hasTemplate}
                title="Email Templates"
              />
              <ActivityCard
                ctaHref={`/${orgSlug}/contacts`}
                ctaLabel="Add Contacts"
                description="Build your audience and manage subscribers."
                icon={<UsersIcon className="h-5 w-5" />}
                isComplete={setupStatus.hasContact}
                title="Contacts"
              />
              <ActivityCard
                ctaHref={`/${orgSlug}/automations/new`}
                ctaLabel="Create Workflow"
                description="Build automated email sequences."
                icon={<GitBranchIcon className="h-5 w-5" />}
                isComplete={setupStatus.hasWorkflow}
                title="Automations"
              />
              <ActivityCard
                ctaHref={`/${orgSlug}/settings/members`}
                ctaLabel="Invite Members"
                description="Collaborate on templates and broadcasts."
                icon={<UserPlusIcon className="h-5 w-5" />}
                isComplete={memberCount > 1}
                title="Invite Your Team"
              />
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Help Card */}
            <HelpCard />
          </div>
        </div>
      </div>
    </>
  );
}
