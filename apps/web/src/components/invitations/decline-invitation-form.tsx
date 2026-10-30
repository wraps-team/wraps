"use client";

import { Panel, PanelTitle } from "@wraps/ui/components/ui/panel";
import { AlertCircle, Building2, Mail, X } from "lucide-react";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { useState } from "react";
import { toast } from "sonner";
import type { InvitationDetails } from "@/actions/invitations";
import { declineInvitation } from "@/actions/invitations";
import { Button } from "@/components/ui/button";

type DeclineInvitationFormProps = {
  invitation: InvitationDetails;
  invitationId: string;
};

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
      // Capture invitation declined event in PostHog
      posthog.capture("invitation_declined", {
        organization_name: invitation.organization.name,
        inviter_name: invitation.inviter.name,
      });

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
    <Panel
      className="w-full max-w-lg"
      description="Are you sure you want to decline this invitation?"
      label={<PanelTitle>Decline Invitation</PanelTitle>}
    >
      <div className="space-y-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <X className="h-8 w-8 text-muted-foreground" />
        </div>

        {/* Organization Details */}
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border bg-muted/50 p-4">
            <Mail className="mt-0.5 h-5 w-5 text-muted-foreground" />
            <div className="flex-1 space-y-1">
              <p className="font-medium text-sm">From</p>
              <p className="text-foreground">
                <strong>{invitation.inviter.name}</strong>
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
        <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/15 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div className="flex-1 space-y-1">
            <p className="font-medium text-warning text-sm">
              This action cannot be undone
            </p>
            <p className="text-warning text-sm">
              If you decline this invitation, you'll need to request a new
              invitation from {invitation.inviter.name} if you change your mind.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t pt-4">
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
      </div>
    </Panel>
  );
}
