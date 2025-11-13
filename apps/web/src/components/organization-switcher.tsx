"use client";

import { Check, ChevronsUpDown, Plus, Settings, UserPlus } from "lucide-react";
import { useState } from "react";
import { CreateOrganizationForm } from "@/components/forms/create-organization-form";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useActiveOrganization } from "@/contexts/organization-context";

export function OrganizationSwitcher() {
  const { isMobile } = useSidebar();
  const {
    activeOrganization,
    organizations,
    setActiveOrganization,
    userRole,
    isLoading,
  } = useActiveOrganization();
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  if (isLoading || !activeOrganization) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            className="h-auto py-2"
            size="lg"
            tooltip="Loading..."
          >
            <div className="flex aspect-square size-8 animate-pulse items-center justify-center rounded-lg bg-muted" />
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="h-4 w-24 animate-pulse rounded bg-muted" />
              <span className="mt-1 h-3 w-16 animate-pulse rounded bg-muted" />
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "owner":
        return "default";
      case "admin":
        return "secondary";
      default:
        return "outline";
    }
  };

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                className="h-auto py-2 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                size="lg"
                tooltip={activeOrganization.name}
              >
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage
                    alt={activeOrganization.name}
                    src={activeOrganization.logo ?? undefined}
                  />
                  <AvatarFallback className="rounded-lg bg-primary text-primary-foreground">
                    {getInitials(activeOrganization.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">
                    {activeOrganization.name}
                  </span>
                  <div className="flex items-center gap-1 text-xs">
                    {userRole && (
                      <Badge
                        className="h-4 px-1 text-[10px]"
                        variant={getRoleBadgeVariant(userRole)}
                      >
                        {userRole}
                      </Badge>
                    )}
                  </div>
                </div>
                <ChevronsUpDown className="ml-auto size-4" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-[280px] rounded-lg p-3"
              side={isMobile ? "bottom" : "right"}
              sideOffset={4}
            >
              {/* Organization Header with Actions */}
              <div className="mb-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Avatar className="h-10 w-10 rounded-lg">
                    <AvatarImage
                      alt={activeOrganization.name}
                      src={activeOrganization.logo ?? undefined}
                    />
                    <AvatarFallback className="rounded-lg bg-primary text-primary-foreground">
                      {getInitials(activeOrganization.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-sm">
                      {activeOrganization.name}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {userRole &&
                        `${userRole.charAt(0).toUpperCase() + userRole.slice(1)}`}{" "}
                      · 1 Member
                    </p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    className="flex items-center justify-center gap-2 rounded-md border bg-background px-3 py-2 text-sm transition-colors hover:bg-accent"
                    onClick={() => {
                      if (activeOrganization.slug) {
                        window.location.href = `/${activeOrganization.slug}/settings/general`;
                      }
                    }}
                    type="button"
                  >
                    <Settings className="size-4" />
                    Settings
                  </button>
                  <button
                    className="flex items-center justify-center gap-2 rounded-md border bg-background px-3 py-2 text-sm transition-colors hover:bg-accent"
                    onClick={() => {
                      if (activeOrganization.slug) {
                        window.location.href = `/${activeOrganization.slug}/members`;
                      }
                    }}
                    type="button"
                  >
                    <UserPlus className="size-4" />
                    Invite
                  </button>
                </div>
              </div>

              <DropdownMenuSeparator />

              {/* Workspaces List */}
              <DropdownMenuLabel className="px-0 py-2 text-muted-foreground text-xs">
                Workspaces
              </DropdownMenuLabel>
              {organizations.map((org) => (
                <DropdownMenuItem
                  className="gap-2 rounded-md p-2"
                  key={org.id}
                  onClick={() => {
                    if (org.slug) {
                      setActiveOrganization(org.slug);
                    }
                  }}
                >
                  <Avatar className="h-6 w-6 rounded-md">
                    <AvatarImage alt={org.name} src={org.logo ?? undefined} />
                    <AvatarFallback className="rounded-md bg-muted text-muted-foreground text-xs">
                      {getInitials(org.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex-1 truncate text-sm">{org.name}</span>
                  {org.id === activeOrganization.id && (
                    <Check className="ml-auto size-4" />
                  )}
                </DropdownMenuItem>
              ))}

              {/* Create Workspace Button */}
              <DropdownMenuItem
                className="mt-1 gap-2 rounded-md p-2"
                onSelect={() => setShowCreateDialog(true)}
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-md">
                  <Plus className="size-4" />
                </div>
                <div className="font-medium text-sm">Create workspace</div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      {/* Create Organization Dialog */}
      <Dialog onOpenChange={setShowCreateDialog} open={showCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Organization</DialogTitle>
            <DialogDescription>
              Create a new organization to manage your team and resources.
            </DialogDescription>
          </DialogHeader>
          <CreateOrganizationForm
            onCancel={() => setShowCreateDialog(false)}
            onSuccess={(slug) => {
              setShowCreateDialog(false);
              setActiveOrganization(slug);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
