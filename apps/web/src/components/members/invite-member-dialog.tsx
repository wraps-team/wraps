"use client";

import { useState } from "react";
import { toast } from "sonner";
import { inviteMember } from "@/actions/members";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type InviteMemberDialogProps = {
  organizationId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onInviteSent: () => void;
};

export function InviteMemberDialog({
  organizationId,
  isOpen,
  onOpenChange,
  onInviteSent,
}: InviteMemberDialogProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [isInviting, setIsInviting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email?.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }

    setIsInviting(true);
    const result = await inviteMember(email, role, organizationId);

    if (result.success) {
      toast.success(`Invitation sent to ${email}`);
      setEmail("");
      setRole("member");
      onInviteSent();
      onOpenChange(false);
    } else {
      toast.error(result.error);
    }

    setIsInviting(false);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={isOpen}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Invite Team Member</DialogTitle>
            <DialogDescription>
              Send an invitation to join your organization
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                disabled={isInviting}
                id="email"
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@example.com"
                required
                type="email"
                value={email}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="invite-role">Role</Label>
              <Select
                disabled={isInviting}
                onValueChange={(value) => setRole(value as "admin" | "member")}
                value={role}
              >
                <SelectTrigger id="invite-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                {role === "admin"
                  ? "Admins can manage members and settings"
                  : "Members have standard access to the organization"}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              disabled={isInviting}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={isInviting} type="submit">
              {isInviting ? "Sending..." : "Send Invitation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
