"use client";

import {
  Crown,
  Loader2,
  Mail,
  MoreVertical,
  Shield,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type OrganizationSettingsMembersProps = {
  organization: {
    id: string;
    name: string;
  };
  userRole: "owner" | "admin" | "member";
};

const roleConfig = {
  owner: {
    icon: Crown,
    color: "text-yellow-600 dark:text-yellow-400",
    bgColor: "bg-yellow-100 dark:bg-yellow-900",
    label: "Owner",
  },
  admin: {
    icon: Shield,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-100 dark:bg-blue-900",
    label: "Admin",
  },
  member: {
    icon: Users,
    color: "text-gray-600 dark:text-gray-400",
    bgColor: "bg-gray-100 dark:bg-gray-900",
    label: "Member",
  },
};

export function OrganizationSettingsMembers({
  organization,
  userRole,
}: OrganizationSettingsMembersProps) {
  const _router = useRouter();
  const [members, setMembers] = useState<MemberWithUser[]>([]);
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [_refreshKey, setRefreshKey] = useState(0);

  const canEdit = userRole === "owner" || userRole === "admin";

  // Trigger a refresh
  const refreshData = () => setRefreshKey((prev) => prev + 1);

  // Load members and invitations
  useEffect(() => {
    async function loadData(organizationId: string) {
      setLoading(true);
      const result = await listMembers(organizationId);
      if (result.success) {
        setMembers(result.members);
        setInvitations(result.invitations);
      } else {
        toast.error(result.error);
      }
      setLoading(false);
    }
    loadData(organization.id);
  }, [organization.id]);

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
    const result = await inviteMember(inviteEmail, inviteRole, organization.id);
    setInviteSubmitting(false);

    if (result.success) {
      toast.success(`Invitation sent to ${inviteEmail}`);
      setInviteDialogOpen(false);
      setInviteEmail("");
      setInviteRole("member");
      refreshData(); // Reload to show new invitation
    } else {
      toast.error(result.error);
    }
  }

  async function handleUpdateRole(
    memberId: string,
    newRole: "owner" | "admin" | "member"
  ) {
    const result = await updateMemberRole(memberId, newRole, organization.id);
    if (result.success) {
      toast.success("Member role updated");
      refreshData();
    } else {
      toast.error(result.error);
    }
  }

  async function handleRemoveMember(memberId: string) {
    if (!confirm("Are you sure you want to remove this member?")) {
      return;
    }

    const result = await removeMember(memberId, organization.id);
    if (result.success) {
      toast.success("Member removed");
      refreshData();
    } else {
      toast.error(result.error);
    }
  }

  async function handleCancelInvitation(invitationId: string) {
    const result = await cancelInvitation(invitationId, organization.id);
    if (result.success) {
      toast.success("Invitation cancelled");
      refreshData();
    } else {
      toast.error(result.error);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
              <Select
                onValueChange={(value) =>
                  setInviteRole(value as "admin" | "member")
                }
                value={inviteRole}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
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

      {/* Members Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>
                Manage who has access to your organization.
              </CardDescription>
            </div>
            {canEdit && (
              <Button onClick={() => setInviteDialogOpen(true)}>
                <UserPlus className="mr-2 h-4 w-4" />
                Invite Member
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {members.map((member) => {
              const roleInfo =
                roleConfig[member.role as keyof typeof roleConfig];
              const RoleIcon = roleInfo.icon;

              return (
                <div
                  className="flex items-center justify-between rounded-lg border p-4"
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
                        <Badge className={roleInfo.bgColor} variant="secondary">
                          <RoleIcon
                            className={`mr-1 h-3 w-3 ${roleInfo.color}`}
                          />
                          <span className={roleInfo.color}>
                            {roleInfo.label}
                          </span>
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
                        <Button size="icon" variant="ghost">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() =>
                            handleUpdateRole(
                              member.id,
                              member.role === "admin" ? "member" : "admin"
                            )
                          }
                        >
                          Change to{" "}
                          {member.role === "admin" ? "Member" : "Admin"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => handleRemoveMember(member.id)}
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
        </CardContent>
      </Card>

      {/* Pending Invitations */}
      {canEdit && invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Invitations</CardTitle>
            <CardDescription>
              Invitations that haven't been accepted yet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {invitations.map((invitation) => (
                <div
                  className="flex items-center justify-between rounded-lg border border-dashed p-4"
                  key={invitation.id}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
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
                    onClick={() => handleCancelInvitation(invitation.id)}
                    size="icon"
                    variant="ghost"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Roles & Permissions Guide */}
      <Card>
        <CardHeader>
          <CardTitle>Roles & Permissions</CardTitle>
          <CardDescription>
            Understanding member roles and their permissions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${roleConfig.owner.bgColor}`}
              >
                <Crown className={`h-4 w-4 ${roleConfig.owner.color}`} />
              </div>
              <div>
                <h4 className="font-medium">Owner</h4>
                <p className="text-muted-foreground text-sm">
                  Full access to all organization settings, billing, and can
                  delete the organization.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${roleConfig.admin.bgColor}`}
              >
                <Shield className={`h-4 w-4 ${roleConfig.admin.color}`} />
              </div>
              <div>
                <h4 className="font-medium">Admin</h4>
                <p className="text-muted-foreground text-sm">
                  Can manage organization settings, members, and AWS accounts.
                  Cannot delete the organization.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${roleConfig.member.bgColor}`}
              >
                <Users className={`h-4 w-4 ${roleConfig.member.color}`} />
              </div>
              <div>
                <h4 className="font-medium">Member</h4>
                <p className="text-muted-foreground text-sm">
                  Can view organization data and use connected AWS resources.
                  Cannot modify settings.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
