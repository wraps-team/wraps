import { redirect } from "next/navigation";
import { getInvitation } from "@/actions/invitations";
import { DeclineInvitationForm } from "@/components/invitations/decline-invitation-form";

interface DeclineInvitationPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function DeclineInvitationPage({
  params,
}: DeclineInvitationPageProps) {
  const { id } = await params;

  // Fetch invitation details
  const result = await getInvitation(id);

  if (!result.success) {
    redirect(
      `/invitations/${id}/error?message=${encodeURIComponent(result.error)}`
    );
  }

  const { invitation, isExpired } = result;

  // Handle different states
  if (invitation.status === "accepted") {
    redirect(
      `/invitations/${id}/error?message=${encodeURIComponent("This invitation has already been accepted")}`
    );
  }

  if (invitation.status === "declined") {
    redirect(
      `/invitations/${id}/error?message=${encodeURIComponent("This invitation has already been declined")}`
    );
  }

  if (isExpired) {
    redirect(
      `/invitations/${id}/error?message=${encodeURIComponent("This invitation has expired")}`
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4">
      <DeclineInvitationForm invitation={invitation} invitationId={id} />
    </div>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getInvitation(id);

  if (!result.success) {
    return {
      title: "Invitation Not Found | Wraps",
    };
  }

  return {
    title: `Decline Invitation to ${result.invitation.organization.name} | Wraps`,
    description: `Decline invitation to join ${result.invitation.organization.name} on Wraps`,
  };
}
