"use client";

import { UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  listMembers,
  type MemberWithUser,
  type PendingInvitation,
} from "@/actions/members";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { InvitationsTable } from "./invitations-table";
import { InviteMemberDialog } from "./invite-member-dialog";
import { MembersTable } from "./members-table";

interface MembersPageContentProps {
  organizationId: string;
  organizationSlug: string;
  userRole: "owner" | "admin" | "member";
}

export function MembersPageContent({
  organizationId,
  organizationSlug,
  userRole,
}: MembersPageContentProps) {
  const [members, setMembers] = useState<MemberWithUser[]>([]);
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);

  const canManageMembers = userRole === "owner" || userRole === "admin";

  const fetchMembers = async () => {
    setIsLoading(true);
    const result = await listMembers(organizationId);

    if (result.success) {
      setMembers(result.members);
      setInvitations(result.invitations);
    } else {
      toast.error(result.error);
    }

    setIsLoading(false);
  };

  useEffect(() => {
    fetchMembers();
  }, [organizationId]);

  return (
    <div className="space-y-6">
      {/* Members Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle>Members</CardTitle>
            <CardDescription>
              {members.length} {members.length === 1 ? "member" : "members"} in
              this organization
            </CardDescription>
          </div>
          {canManageMembers && (
            <Button onClick={() => setIsInviteDialogOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Invite Member
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <MembersTable
            members={members}
            onMemberUpdated={fetchMembers}
            organizationId={organizationId}
            organizationSlug={organizationSlug}
            userRole={userRole}
          />
        </CardContent>
      </Card>

      {/* Pending Invitations Section */}
      {canManageMembers && invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Invitations</CardTitle>
            <CardDescription>
              {invitations.length}{" "}
              {invitations.length === 1 ? "invitation" : "invitations"} pending
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InvitationsTable
              invitations={invitations}
              onInvitationCancelled={fetchMembers}
              organizationId={organizationId}
            />
          </CardContent>
        </Card>
      )}

      {/* Invite Member Dialog */}
      <InviteMemberDialog
        isOpen={isInviteDialogOpen}
        onInviteSent={fetchMembers}
        onOpenChange={setIsInviteDialogOpen}
        organizationId={organizationId}
      />
    </div>
  );
}
