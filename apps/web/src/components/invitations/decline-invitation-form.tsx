"use client";

import { AlertCircle, Building2, Mail, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import type { InvitationDetails } from "@/actions/invitations";
import { declineInvitation } from "@/actions/invitations";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface DeclineInvitationFormProps {
  invitation: InvitationDetails;
  invitationId: string;
}

export function DeclineInvitationForm({
  invitation,
  invitationId,
}: DeclineInvitationFormProps) {
  const router = useRouter();
  const [isDeclining, setIsDeclining] = useState(false);

  const handleDecline = async () => {
    setIsDeclining(true);
    const result = await declineInvitation(invitationId);

    if (result.success) {
      toast.success(result.message);
      // Redirect to a confirmation page after a short delay
      setTimeout(() => {
        router.push("/");
      }, 2000);
    } else {
      toast.error(result.error);
      setIsDeclining(false);
    }
  };

  return (
    <Card className="w-full max-w-lg shadow-xl">
      <CardHeader className="space-y-4 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
          <X className="h-8 w-8 text-gray-600" />
        </div>
        <div>
          <CardTitle className="text-2xl">Decline Invitation</CardTitle>
          <CardDescription className="mt-2">
            Are you sure you want to decline this invitation?
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Organization Details */}
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border bg-muted/50 p-4">
            <Mail className="mt-0.5 h-5 w-5 text-muted-foreground" />
            <div className="flex-1 space-y-1">
              <p className="font-medium text-sm">From</p>
              <p className="text-foreground">
                <strong>{invitation.inviter.name}</strong>
              </p>
              <p className="text-muted-foreground text-sm">
                {invitation.inviter.email}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg border bg-muted/50 p-4">
            <Building2 className="mt-0.5 h-5 w-5 text-muted-foreground" />
            <div className="flex-1 space-y-1">
              <p className="font-medium text-sm">Organization</p>
              <p className="font-semibold text-foreground text-lg">
                {invitation.organization.name}
              </p>
            </div>
          </div>
        </div>

        {/* Warning */}
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="flex-1 space-y-1">
            <p className="font-medium text-amber-900 text-sm">
              This action cannot be undone
            </p>
            <p className="text-amber-800 text-sm">
              If you decline this invitation, you'll need to request a new
              invitation from {invitation.inviter.name} if you change your mind.
            </p>
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex flex-col gap-3">
        <Button
          className="w-full"
          disabled={isDeclining}
          onClick={handleDecline}
          size="lg"
          variant="destructive"
        >
          {isDeclining ? "Declining..." : "Yes, Decline Invitation"}
        </Button>
        <Button
          className="w-full"
          disabled={isDeclining}
          onClick={() => router.push(`/invitations/${invitationId}/accept`)}
          size="sm"
          variant="outline"
        >
          Go Back to Accept
        </Button>
      </CardFooter>
    </Card>
  );
}
