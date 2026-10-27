import { z } from "zod";

const emailSchema = z.string().email();

/**
 * Where "Sign In to Accept" sends a logged-out visitor. Someone invited without
 * a Wraps account lands on sign-up with the invited address filled in; someone
 * who already has one lands on sign-in.
 */
export function buildInvitationAuthUrl({
  invitationId,
  email,
  hasAccount,
}: {
  invitationId: string;
  email: string;
  hasAccount: boolean;
}) {
  const params = new URLSearchParams({
    mode: hasAccount ? "signin" : "signup",
    email,
    redirect: `/invitations/${invitationId}/accept`,
  });
  return `/auth?${params.toString()}`;
}

/**
 * The invited address carried on `?email=`, honoured only when the post-auth
 * target is an invitation page so the param can't prefill arbitrary sign-ups.
 */
export function getInvitedEmail(
  emailParam: string | null,
  redirectTo: string
): string {
  if (!redirectTo.startsWith("/invitations/")) {
    return "";
  }
  const parsed = emailSchema.safeParse(emailParam);
  return parsed.success ? parsed.data : "";
}
