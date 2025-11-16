"use client";

import { Building2, CheckCircle2, Mail, Shield, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import type { InvitationDetails } from "@/actions/invitations";
import { acceptInvitation } from "@/actions/invitations";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useSession } from "@/lib/auth-client";

type AcceptInvitationFormProps = {
  invitation: InvitationDetails;
  invitationId: string;
};

export function AcceptInvitationForm({
  invitation,
  invitationId,
}: AcceptInvitationFormProps) {
  const router = useRouter();
  const { data: session, isPending: isSessionLoading } = useSession();
  const [isAccepting, setIsAccepting] = useState(false);

  const handleAccept = async () => {
    if (!session?.user) {
      // Redirect to auth with return URL
      const returnUrl = `/invitations/${invitationId}/accept`;
      router.push(`/auth?returnUrl=${encodeURIComponent(returnUrl)}`);
      return;
    }

    setIsAccepting(true);
    const result = await acceptInvitation(invitationId);

    if (result.success) {
      toast.success(result.message);
      router.push(`/${result.organizationSlug}`);
    } else {
      toast.error(result.error);
      setIsAccepting(false);
    }
  };

  const getRoleBadgeColor = (role: string | null) => {
    switch (role) {
      case "owner":
        return "bg-purple-100 text-purple-700";
      case "admin":
        return "bg-blue-100 text-blue-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const getRoleIcon = (role: string | null) => {
    switch (role) {
      case "owner":
        return <Shield className="h-4 w-4" />;
      case "admin":
        return <UserPlus className="h-4 w-4" />;
      default:
        return <UserPlus className="h-4 w-4" />;
    }
  };

  return (
    <Card className="w-full max-w-lg shadow-xl">
      <CardHeader className="space-y-4 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-blue-500">
          <Mail className="h-8 w-8 text-white" />
        </div>
        <div>
          <CardTitle className="text-2xl">You're Invited!</CardTitle>
          <CardDescription className="mt-2">
            {invitation.inviter.name} has invited you to join their organization
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Organization Details */}
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border bg-muted/50 p-4">
            <Building2 className="mt-0.5 h-5 w-5 text-muted-foreground" />
            <div className="flex-1 space-y-1">
              <p className="font-medium text-sm">Organization</p>
              <p className="font-semibold text-foreground text-lg">
                {invitation.organization.name}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg border bg-muted/50 p-4">
            {getRoleIcon(invitation.role)}
            <div className="flex-1 space-y-1">
              <p className="font-medium text-sm">Your Role</p>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1 font-medium text-xs ${getRoleBadgeColor(invitation.role)}`}
                >
                  {invitation.role
                    ? invitation.role.charAt(0).toUpperCase() +
                      invitation.role.slice(1)
                    : "Member"}
                </span>
              </div>
            </div>
          </div>
        </div>

        <Separator />

        {/* What happens next */}
        <div className="space-y-3">
          <p className="font-semibold text-sm">What happens when you accept:</p>
          <ul className="space-y-2">
            <li className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
              <span className="text-muted-foreground">
                You'll join {invitation.organization.name} as a{" "}
                {invitation.role || "member"}
              </span>
            </li>
            <li className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
              <span className="text-muted-foreground">
                You'll get access to the organization's dashboard and resources
              </span>
            </li>
            <li className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
              <span className="text-muted-foreground">
                You can collaborate with other team members
              </span>
            </li>
          </ul>
        </div>

        {/* Email notice */}
        {session?.user && session.user.email !== invitation.email && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-amber-900 text-sm">
              <strong>Note:</strong> This invitation was sent to{" "}
              <strong>{invitation.email}</strong>, but you're signed in as{" "}
              <strong>{session.user.email}</strong>. Please sign in with the
              correct email address to accept this invitation.
            </p>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex flex-col gap-3">
        <Button
          className="w-full"
          disabled={
            isAccepting ||
            isSessionLoading ||
            (session?.user && session.user.email !== invitation.email)
          }
          onClick={handleAccept}
          size="lg"
        >
          {isAccepting
            ? "Accepting..."
            : session?.user
              ? "Accept Invitation"
              : "Sign In to Accept"}
        </Button>
        <Button
          className="w-full"
          disabled={isAccepting}
          onClick={() => router.push(`/invitations/${invitationId}/decline`)}
          size="sm"
          variant="ghost"
        >
          Decline Invitation
        </Button>
      </CardFooter>
    </Card>
  );
}
