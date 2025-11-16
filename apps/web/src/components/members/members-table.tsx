"use client";

import { formatDistanceToNow } from "date-fns";
import { MoreVertical, Shield, Trash2, UserCog, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { MemberWithUser } from "@/actions/members";
import { removeMember } from "@/actions/members";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChangeRoleDialog } from "./change-role-dialog";

type MembersTableProps = {
  members: MemberWithUser[];
  organizationId: string;
  organizationSlug: string;
  userRole: "owner" | "admin" | "member";
  onMemberUpdated: () => void;
};

export function MembersTable({
  members,
  organizationId,
  organizationSlug,
  userRole,
  onMemberUpdated,
}: MembersTableProps) {
  const [selectedMember, setSelectedMember] = useState<MemberWithUser | null>(
    null
  );
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

  const canManageMembers = userRole === "owner" || userRole === "admin";

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

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "owner":
        return <Shield className="mr-1 h-3 w-3" />;
      case "admin":
        return <UserCog className="mr-1 h-3 w-3" />;
      default:
        return <Users className="mr-1 h-3 w-3" />;
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm("Are you sure you want to remove this member?")) {
      return;
    }

    setRemovingMemberId(memberId);
    const result = await removeMember(memberId, organizationId);

    if (result.success) {
      toast.success("Member removed successfully");
      onMemberUpdated();
    } else {
      toast.error(result.error);
    }

    setRemovingMemberId(null);
  };

  const handleChangeRole = (member: MemberWithUser) => {
    setSelectedMember(member);
    setIsRoleDialogOpen(true);
  };

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Joined</TableHead>
            {canManageMembers && <TableHead className="w-[50px]" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => (
            <TableRow key={member.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarImage
                      alt={member.user.name}
                      src={member.user.image || undefined}
                    />
                    <AvatarFallback className="text-xs">
                      {getInitials(member.user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="font-medium text-sm">
                      {member.user.name}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {member.user.email}
                    </span>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <Badge
                  className="flex w-fit items-center"
                  variant={getRoleBadgeVariant(member.role)}
                >
                  {getRoleIcon(member.role)}
                  {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {formatDistanceToNow(new Date(member.createdAt), {
                  addSuffix: true,
                })}
              </TableCell>
              {canManageMembers && (
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button className="h-8 w-8" size="icon" variant="ghost">
                        <MoreVertical className="h-4 w-4" />
                        <span className="sr-only">Open menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {(userRole === "owner" ||
                        (userRole === "admin" && member.role !== "owner")) && (
                        <DropdownMenuItem
                          onClick={() => handleChangeRole(member)}
                        >
                          <UserCog className="mr-2 h-4 w-4" />
                          Change Role
                        </DropdownMenuItem>
                      )}
                      {(userRole === "owner" ||
                        (userRole === "admin" && member.role !== "owner")) && (
                        <DropdownMenuItem
                          className="text-destructive"
                          disabled={removingMemberId === member.id}
                          onClick={() => handleRemoveMember(member.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Remove Member
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              )}
            </TableRow>
          ))}
          {members.length === 0 && (
            <TableRow>
              <TableCell
                className="text-center text-muted-foreground"
                colSpan={canManageMembers ? 4 : 3}
              >
                No members found
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {selectedMember && (
        <ChangeRoleDialog
          isOpen={isRoleDialogOpen}
          member={selectedMember}
          onOpenChange={setIsRoleDialogOpen}
          onRoleChanged={onMemberUpdated}
          organizationId={organizationId}
          userRole={userRole}
        />
      )}
    </>
  );
}
