"use client";

import { Panel, PanelTitle } from "@wraps/ui/components/ui/panel";
import { UserPlus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  listMembers,
  type MemberWithUser,
  type PendingInvitation,
} from "@/actions/members";
import { Button } from "@/components/ui/button";
import { InvitationsTable } from "./invitations-table";
import { InviteMemberDialog } from "./invite-member-dialog";
import { MembersTable } from "./members-table";

type MembersPageContentProps = {
  organizationId: string;
  organizationSlug: string;
  userRole: string;
};

export function MembersPageContent({
  organizationId,
  organizationSlug,
  userRole,
}: MembersPageContentProps) {
  const [members, setMembers] = useState<MemberWithUser[]>([]);
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [_isLoading, setIsLoading] = useState(true);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);

  const canManageMembers = userRole === "owner" || userRole === "admin";

  const fetchMembers = useCallback(async () => {
    setIsLoading(true);
    const result = await listMembers(organizationId);

    if (result.success) {
      setMembers(result.members);
      setInvitations(result.invitations);
    } else {
      toast.error(result.error);
    }

    setIsLoading(false);
  }, [organizationId]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  return (
    <div className="space-y-6">
      {/* Members Section */}
      <Panel
        actions={
          canManageMembers && (
            <Button onClick={() => setIsInviteDialogOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Invite Member
            </Button>
          )
        }
        description={
          <>
            {members.length} {members.length === 1 ? "member" : "members"} in
            this organization
          </>
        }
        label={<PanelTitle>Members</PanelTitle>}
      >
        <div className="-mx-4">
          <MembersTable
            members={members}
            onMemberUpdated={fetchMembers}
            organizationId={organizationId}
            organizationSlug={organizationSlug}
            userRole={userRole}
          />
        </div>
      </Panel>

      {/* Pending Invitations Section */}
      {canManageMembers && invitations.length > 0 && (
        <Panel
          description={
            <>
              {invitations.length}{" "}
              {invitations.length === 1 ? "invitation" : "invitations"} pending
            </>
          }
          label={<PanelTitle>Pending Invitations</PanelTitle>}
        >
          <div className="-mx-4">
            <InvitationsTable
              invitations={invitations}
              onInvitationCancelled={fetchMembers}
              organizationId={organizationId}
            />
          </div>
        </Panel>
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
