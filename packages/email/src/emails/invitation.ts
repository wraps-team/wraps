import { sendEmail } from "../lib/client";

export type SendInvitationEmailParams = {
  to: string;
  inviterName: string;
  organizationName: string;
  role: string;
  invitationId: string;
};

/**
 * Send an organization invitation email using Wraps SDK
 *
 * Uses custom SES client with two-step role assumption to send emails
 * through the dogfood account's Wraps infrastructure.
 */
export async function sendInvitationEmail({
  to,
  inviterName,
  organizationName,
  role,
  invitationId,
}: SendInvitationEmailParams) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const acceptUrl = `${appUrl}/invitations/${invitationId}/accept`;
  const declineUrl = `${appUrl}/invitations/${invitationId}/decline`;

  const htmlBody = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Invitation to ${organizationName}</title>
  </head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0;">
      <h1 style="color: white; margin: 0; font-size: 28px;">You're Invited!</h1>
    </div>

    <div style="background: white; padding: 40px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
      <p style="font-size: 16px; margin-bottom: 20px;">Hi there,</p>

      <p style="font-size: 16px; margin-bottom: 20px;">
        <strong>${inviterName}</strong> has invited you to join <strong>${organizationName}</strong> on Wraps as a <strong>${role}</strong>.
      </p>

      <p style="font-size: 16px; margin-bottom: 30px;">
        Wraps helps teams deploy and manage email infrastructure in their own AWS accounts with zero stored credentials, beautiful developer experience, and transparent AWS pricing.
      </p>

      <div style="text-align: center; margin: 40px 0;">
        <a href="${acceptUrl}" style="display: inline-block; background: #667eea; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; margin: 0 8px;">
          Accept Invitation
        </a>
        <a href="${declineUrl}" style="display: inline-block; background: white; color: #6b7280; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; border: 1px solid #d1d5db; margin: 0 8px;">
          Decline
        </a>
      </div>

      <div style="background: #f9fafb; padding: 20px; border-radius: 6px; margin-top: 30px; border-left: 4px solid #667eea;">
        <p style="margin: 0; font-size: 14px; color: #6b7280;">
          <strong>Note:</strong> This invitation will expire in 7 days. If you didn't expect this invitation, you can safely ignore this email.
        </p>
      </div>
    </div>

    <div style="text-align: center; margin-top: 30px; color: #9ca3af; font-size: 14px;">
      <p>
        This email was sent by Wraps. If you have any questions, please contact us at
        <a href="mailto:support@wraps.dev" style="color: #667eea; text-decoration: none;">support@wraps.dev</a>
      </p>
    </div>
  </body>
</html>`;

  const textBody = `You've been invited to join ${organizationName}!

${inviterName} has invited you to join ${organizationName} on Wraps as a ${role}.

Wraps helps teams deploy and manage email infrastructure in their own AWS accounts with zero stored credentials, beautiful developer experience, and transparent AWS pricing.

To accept this invitation, visit:
${acceptUrl}

To decline this invitation, visit:
${declineUrl}

Note: This invitation will expire in 7 days. If you didn't expect this invitation, you can safely ignore this email.

---
This email was sent by Wraps. If you have any questions, please contact us at support@wraps.dev`;

  return sendEmail({
    to,
    subject: `You've been invited to join ${organizationName} on Wraps`,
    html: htmlBody,
    text: textBody,
  });
}
