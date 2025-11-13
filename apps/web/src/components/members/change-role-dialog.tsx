"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { MemberWithUser } from "@/actions/members";
import { updateMemberRole } from "@/actions/members";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ChangeRoleDialogProps {
  member: MemberWithUser;
  organizationId: string;
  userRole: "owner" | "admin" | "member";
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onRoleChanged: () => void;
}

export function ChangeRoleDialog({
  member,
  organizationId,
  userRole,
  isOpen,
  onOpenChange,
  onRoleChanged,
}: ChangeRoleDialogProps) {
  const [newRole, setNewRole] = useState<"owner" | "admin" | "member">(
    member.role as "owner" | "admin" | "member"
  );
  const [isUpdating, setIsUpdating] = useState(false);

  const handleSubmit = async () => {
    if (newRole === member.role) {
      toast.error("Please select a different role");
      return;
    }

    setIsUpdating(true);
    const result = await updateMemberRole(member.id, newRole, organizationId);

    if (result.success) {
      toast.success("Member role updated successfully");
      onRoleChanged();
      onOpenChange(false);
    } else {
      toast.error(result.error);
    }

    setIsUpdating(false);
  };

  const availableRoles =
    userRole === "owner"
      ? (["owner", "admin", "member"] as const)
      : (["admin", "member"] as const);

  return (
    <Dialog onOpenChange={onOpenChange} open={isOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change Member Role</DialogTitle>
          <DialogDescription>
            Update the role for {member.user.name} ({member.user.email})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Select
              onValueChange={(value) =>
                setNewRole(value as "owner" | "admin" | "member")
              }
              value={newRole}
            >
              <SelectTrigger id="role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableRoles.map((role) => (
                  <SelectItem key={role} value={role}>
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              {newRole === "owner" &&
                "Owners have full control over the organization"}
              {newRole === "admin" &&
                "Admins can manage members and settings but cannot delete the organization"}
              {newRole === "member" &&
                "Members have read-only access to the organization"}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            disabled={isUpdating}
            onClick={() => onOpenChange(false)}
            variant="outline"
          >
            Cancel
          </Button>
          <Button disabled={isUpdating} onClick={handleSubmit}>
            {isUpdating ? "Updating..." : "Update Role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
