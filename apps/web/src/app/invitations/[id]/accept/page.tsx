import { redirect } from "next/navigation";
import { getInvitation } from "@/actions/invitations";
import { AcceptInvitationForm } from "@/components/invitations/accept-invitation-form";

type AcceptInvitationPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function AcceptInvitationPage({
  params,
}: AcceptInvitationPageProps) {
  const { id } = await params;

  // Fetch invitation details
  const result = await getInvitation(id);

  if (!result.success) {
    redirect(
      `/invitations/${id}/error?message=${encodeURIComponent(result.error)}`
    );
  }

  const { invitation, isExpired, isAlreadyMember } = result;

  // Handle different states
  if (invitation.status === "accepted") {
    redirect(
      `/invitations/${id}/error?message=${encodeURIComponent("This invitation has already been accepted")}`
    );
  }

  if (invitation.status === "declined") {
    redirect(
      `/invitations/${id}/error?message=${encodeURIComponent("This invitation has been declined")}`
    );
  }

  if (isExpired) {
    redirect(
      `/invitations/${id}/error?message=${encodeURIComponent("This invitation has expired")}`
    );
  }

  if (isAlreadyMember) {
    redirect(
      `/invitations/${id}/error?message=${encodeURIComponent("You are already a member of this organization")}`
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50 p-4">
      <AcceptInvitationForm invitation={invitation} invitationId={id} />
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
    title: `Join ${result.invitation.organization.name} | Wraps`,
    description: `You've been invited to join ${result.invitation.organization.name} on Wraps`,
  };
}
