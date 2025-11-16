"use client";

import { formatDistanceToNow } from "date-fns";
import { Mail, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { PendingInvitation } from "@/actions/members";
import { cancelInvitation } from "@/actions/members";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type InvitationsTableProps = {
  invitations: PendingInvitation[];
  organizationId: string;
  onInvitationCancelled: () => void;
};

export function InvitationsTable({
  invitations,
  organizationId,
  onInvitationCancelled,
}: InvitationsTableProps) {
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const handleCancelInvitation = async (invitationId: string) => {
    if (!confirm("Are you sure you want to cancel this invitation?")) {
      return;
    }

    setCancellingId(invitationId);
    const result = await cancelInvitation(invitationId, organizationId);

    if (result.success) {
      toast.success("Invitation cancelled");
      onInvitationCancelled();
    } else {
      toast.error(result.error);
    }

    setCancellingId(null);
  };

  const isExpired = (expiresAt: Date) => new Date(expiresAt) < new Date();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Invited By</TableHead>
          <TableHead>Expires</TableHead>
          <TableHead className="w-[50px]" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {invitations.map((invitation) => {
          const expired = isExpired(invitation.expiresAt);
          return (
            <TableRow key={invitation.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-sm">
                    {invitation.email}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline">
                  {invitation.role
                    ? invitation.role.charAt(0).toUpperCase() +
                      invitation.role.slice(1)
                    : "Member"}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {invitation.inviter.name}
              </TableCell>
              <TableCell>
                {expired ? (
                  <Badge className="text-xs" variant="destructive">
                    Expired
                  </Badge>
                ) : (
                  <span className="text-muted-foreground text-sm">
                    {formatDistanceToNow(new Date(invitation.expiresAt), {
                      addSuffix: true,
                    })}
                  </span>
                )}
              </TableCell>
              <TableCell>
                <Button
                  className="h-8 w-8"
                  disabled={cancellingId === invitation.id}
                  onClick={() => handleCancelInvitation(invitation.id)}
                  size="icon"
                  variant="ghost"
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">Cancel invitation</span>
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
        {invitations.length === 0 && (
          <TableRow>
            <TableCell
              className="text-center text-muted-foreground"
              colSpan={5}
            >
              No pending invitations
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
