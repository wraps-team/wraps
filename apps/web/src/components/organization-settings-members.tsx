"use client";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@wraps/ui/components/ui/avatar";
import { Badge } from "@wraps/ui/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@wraps/ui/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@wraps/ui/components/ui/dropdown-menu";
import { Label } from "@wraps/ui/components/ui/label";
import { Panel, PanelTitle } from "@wraps/ui/components/ui/panel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wraps/ui/components/ui/select";
import {
  CreditCard,
  Crown,
  Eye,
  Loader2,
  Mail,
  Megaphone,
  MoreVertical,
  Shield,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  type ComponentProps,
  useEffect,
  useOptimistic,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import {
  cancelInvitation,
  inviteMember,
  listMembers,
  type MemberWithUser,
  type PendingInvitation,
  removeMember,
  updateMemberRole,
} from "@/actions/members";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PRESET_ROLES } from "@/lib/preset-roles";

type OrganizationSettingsMembersProps = {
  organization: {
    id: string;
    name: string;
  };
  userRole: string;
  initialMembers?: MemberWithUser[];
  initialInvitations?: PendingInvitation[];
};

const roleDescriptions: Record<string, string> = {
  owner:
    "Full access to all organization settings, billing, and can delete the organization.",
  admin:
    "Can manage members, settings, and AWS accounts. Cannot delete the organization.",
  member:
    "Full content access — contacts, templates, broadcasts, and workflows. No admin operations.",
  marketing:
    "Content write access and broadcasts. Read-only on workflows, segments, and topics.",
  "read-only": "View everything, export contacts. No write operations.",
  billing: "Billing management and read-only org settings. No content access.",
};

type BadgeVariant = ComponentProps<typeof Badge>["variant"];

const roleConfig = {
  owner: {
    icon: Crown,
    color: "text-warning",
    bgColor: "bg-warning/15",
    label: "Owner",
    variant: "warning" as BadgeVariant,
  },
  admin: {
    icon: Shield,
    color: "text-info",
    bgColor: "bg-info/15",
    label: "Admin",
    variant: "info" as BadgeVariant,
  },
  member: {
    icon: Users,
    color: "text-muted-foreground",
    bgColor: "bg-muted",
    label: "Member",
    variant: "secondary" as BadgeVariant,
  },
  marketing: {
    icon: Megaphone,
    color: "text-brand-text",
    bgColor: "bg-brand/15",
    label: "Marketing",
    variant: "brand" as BadgeVariant,
  },
  "read-only": {
    icon: Eye,
    color: "text-muted-foreground",
    bgColor: "bg-muted",
    label: "Read Only",
    variant: "secondary" as BadgeVariant,
  },
  billing: {
    icon: CreditCard,
    color: "text-success",
    bgColor: "bg-success/15",
    label: "Billing",
    variant: "success" as BadgeVariant,
  },
};

export function OrganizationSettingsMembers({
  organization,
  userRole,
  initialMembers,
  initialInvitations,
}: OrganizationSettingsMembersProps) {
  const [isPending, startTransition] = useTransition();
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("member");
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [changeRoleMember, setChangeRoleMember] =
    useState<MemberWithUser | null>(null);
  const [changeRoleValue, setChangeRoleValue] = useState<string>("");

  const availableRoles =
    userRole === "owner"
      ? ["owner", "admin", "member", ...PRESET_ROLES.map((r) => r.name)]
      : ["admin", "member", ...PRESET_ROLES.map((r) => r.name)];

  // Client-side state for when data isn't provided via props
  const [members, setMembers] = useState<MemberWithUser[]>(
    initialMembers ?? []
  );
  const [invitations, setInvitations] = useState<PendingInvitation[]>(
    initialInvitations ?? []
  );
  const [isLoading, setIsLoading] = useState(!initialMembers);

  // Fetch data client-side only if not provided via props (for tabs usage)
  useEffect(() => {
    if (initialMembers === undefined) {
      setIsLoading(true);
      listMembers(organization.id).then((result) => {
        if (result.success) {
          setMembers(result.members);
          setInvitations(result.invitations);
        } else {
          toast.error(result.error);
        }
        setIsLoading(false);
      });
    }
  }, [organization.id, initialMembers]);

  // Update local state when props change (for server-side data)
  useEffect(() => {
    if (initialMembers !== undefined) {
      setMembers(initialMembers);
    }
  }, [initialMembers]);

  useEffect(() => {
    if (initialInvitations !== undefined) {
      setInvitations(initialInvitations);
    }
  }, [initialInvitations]);

  // Optimistic updates for instant UI feedback
  const [optimisticInvitations, removeOptimisticInvitation] = useOptimistic(
    invitations,
    (state, invitationId: string) =>
      state.filter((inv) => inv.id !== invitationId)
  );

  const [optimisticMembers, updateOptimisticMembers] = useOptimistic(
    members,
    (
      state,
      action:
        | { type: "remove"; memberId: string }
        | { type: "updateRole"; memberId: string; newRole: string }
    ) => {
      if (action.type === "remove") {
        return state.filter((m) => m.id !== action.memberId);
      }
      if (action.type === "updateRole") {
        return state.map((m) =>
          m.id === action.memberId ? { ...m, role: action.newRole } : m
        );
      }
      return state;
    }
  );

  const canEdit = userRole === "owner" || userRole === "admin";

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  async function handleInviteMember() {
    if (!inviteEmail.trim()) {
      toast.error("Please enter an email address");
      return;
    }

    setInviteSubmitting(true);
    const email = inviteEmail;

    const promise = inviteMember(email, inviteRole, organization.id)
      .then((result) => {
        if (!result.success) {
          throw new Error(result.error);
        }
        setInviteDialogOpen(false);
        setInviteEmail("");
        setInviteRole("member");
        return result;
      })
      .finally(() => {
        setInviteSubmitting(false);
      });

    toast.promise(promise, {
      loading: `Sending invitation to ${email}...`,
      success: `Invitation sent to ${email}`,
      error: (err) => err.message,
    });
  }

  async function handleRemoveMember(memberId: string) {
    if (!confirm("Are you sure you want to remove this member?")) {
      return;
    }

    startTransition(() => {
      updateOptimisticMembers({ type: "remove", memberId });

      const promise = removeMember(memberId, organization.id).then((result) => {
        if (!result.success) {
          throw new Error(result.error);
        }
        return result;
      });

      toast.promise(promise, {
        loading: "Removing member...",
        success: "Member removed",
        error: (err) => err.message,
      });
    });
  }

  async function handleCancelInvitation(invitationId: string) {
    startTransition(() => {
      removeOptimisticInvitation(invitationId);

      const promise = cancelInvitation(invitationId, organization.id).then(
        (result) => {
          if (!result.success) {
            throw new Error(result.error);
          }
          return result;
        }
      );

      toast.promise(promise, {
        loading: "Cancelling invitation...",
        success: "Invitation cancelled",
        error: (err) => err.message,
      });
    });
  }

  function handleOpenChangeRole(member: MemberWithUser) {
    setChangeRoleMember(member);
    setChangeRoleValue(member.role);
  }

  function handleChangeRoleSubmit() {
    if (!changeRoleMember || changeRoleValue === changeRoleMember.role) {
      toast.error("Please select a different role");
      return;
    }
    const memberId = changeRoleMember.id;
    const newRole = changeRoleValue;
    setChangeRoleMember(null);

    startTransition(() => {
      updateOptimisticMembers({ type: "updateRole", memberId, newRole });
      const promise = updateMemberRole(memberId, newRole, organization.id).then(
        (result) => {
          if (!result.success) throw new Error(result.error);
          return result;
        }
      );
      toast.promise(promise, {
        loading: "Updating role...",
        success: "Member role updated",
        error: (err) => err.message,
      });
    });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      {/* Invite Dialog */}
      <Dialog onOpenChange={setInviteDialogOpen} open={inviteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Member</DialogTitle>
            <DialogDescription>
              Send an invitation to join {organization.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
                type="email"
                value={inviteEmail}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select onValueChange={setInviteRole} value={inviteRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  {PRESET_ROLES.map((role) => (
                    <SelectItem key={role.name} value={role.name}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {roleDescriptions[inviteRole] && (
                <p className="text-muted-foreground text-xs">
                  {roleDescriptions[inviteRole]}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={inviteSubmitting}
              onClick={() => setInviteDialogOpen(false)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={inviteSubmitting} onClick={handleInviteMember}>
              {inviteSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                "Send Invitation"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Left column — members + invitations */}
        <div className="min-w-0 flex-1 space-y-6">
          {/* Members Panel */}
          <Panel
            actions={
              canEdit && (
                <Button onClick={() => setInviteDialogOpen(true)}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Invite Member
                </Button>
              )
            }
            description="Manage who has access to your organization."
            label={<PanelTitle>Team Members</PanelTitle>}
          >
            <div className="space-y-4">
              {optimisticMembers.map((member) => {
                const roleInfo =
                  roleConfig[member.role as keyof typeof roleConfig] ??
                  roleConfig.member;
                const RoleIcon = roleInfo.icon;

                return (
                  <div
                    className="flex items-center justify-between border p-4"
                    key={member.id}
                  >
                    <div className="flex items-center gap-4">
                      <Avatar className="h-10 w-10">
                        <AvatarImage
                          alt={member.user.name}
                          src={member.user.image || ""}
                        />
                        <AvatarFallback>
                          {getInitials(member.user.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold">{member.user.name}</h4>
                          <Badge variant={roleInfo.variant}>
                            <RoleIcon className="mr-1 h-3 w-3" />
                            {roleInfo.label}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground text-sm">
                          {member.user.email}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          Joined{" "}
                          {new Date(member.createdAt).toLocaleDateString(
                            "en-US",
                            {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            }
                          )}
                        </p>
                      </div>
                    </div>
                    {canEdit && member.role !== "owner" && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            aria-label="More actions"
                            disabled={isPending}
                            size="icon"
                            variant="ghost"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleOpenChangeRole(member)}
                          >
                            Change Role
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleRemoveMember(member.id)}
                            variant="destructive"
                          >
                            Remove Member
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                );
              })}
            </div>
          </Panel>

          {/* Pending Invitations */}
          {canEdit && optimisticInvitations.length > 0 && (
            <Panel
              description="Invitations that haven't been accepted yet."
              label={<PanelTitle>Pending Invitations</PanelTitle>}
            >
              <div className="space-y-4">
                {optimisticInvitations.map((invitation) => (
                  <div
                    className="flex items-center justify-between border p-4"
                    key={invitation.id}
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center bg-muted">
                        <Mail className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold">{invitation.email}</h4>
                          <Badge variant="outline">{invitation.role}</Badge>
                        </div>
                        <p className="text-muted-foreground text-sm">
                          Invited by {invitation.inviter.name}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          Expires{" "}
                          {new Date(invitation.expiresAt).toLocaleDateString(
                            "en-US",
                            {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            }
                          )}
                        </p>
                      </div>
                    </div>
                    <Button
                      aria-label="Cancel invitation"
                      disabled={isPending}
                      onClick={() => handleCancelInvitation(invitation.id)}
                      size="icon"
                      variant="ghost"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </div>
        {/* end left column */}

        {/* Right column — roles reference (sticky) */}
        <div className="w-full lg:w-80 lg:shrink-0">
          <Panel
            className="lg:sticky lg:top-6"
            description="Understanding member roles and their permissions."
            label={<PanelTitle>Roles & Permissions</PanelTitle>}
          >
            <div className="space-y-4">
              {(Object.keys(roleConfig) as (keyof typeof roleConfig)[]).map(
                (role) => {
                  const config = roleConfig[role];
                  const Icon = config.icon;
                  return (
                    <div className="flex items-start gap-3" key={role}>
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center ${config.bgColor}`}
                      >
                        <Icon className={`h-4 w-4 ${config.color}`} />
                      </div>
                      <div>
                        <h4 className="font-medium text-sm">{config.label}</h4>
                        <p className="text-muted-foreground text-xs">
                          {roleDescriptions[role]}
                        </p>
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          </Panel>
        </div>
      </div>
      {/* end 2-col grid */}

      {/* Change Role Dialog */}
      <Dialog
        onOpenChange={(open) => !open && setChangeRoleMember(null)}
        open={!!changeRoleMember}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Role</DialogTitle>
            <DialogDescription>
              Update the role for {changeRoleMember?.user.name} (
              {changeRoleMember?.user.email})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="change-role">Role</Label>
              <Select
                onValueChange={setChangeRoleValue}
                value={changeRoleValue}
              >
                <SelectTrigger id="change-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableRoles.map((role) => {
                    const config = roleConfig[role as keyof typeof roleConfig];
                    const label =
                      config?.label ??
                      role.charAt(0).toUpperCase() + role.slice(1);
                    return (
                      <SelectItem key={role} value={role}>
                        {label}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {roleDescriptions[changeRoleValue] && (
                <p className="text-muted-foreground text-xs">
                  {roleDescriptions[changeRoleValue]}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setChangeRoleMember(null)} variant="outline">
              Cancel
            </Button>
            <Button onClick={handleChangeRoleSubmit}>Update Role</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
