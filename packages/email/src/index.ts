// Core email client

export type { SendInvitationEmailParams } from "./emails/invitation";
// Email templates
export { sendInvitationEmail } from "./emails/invitation";
export type { SendVerificationEmailParams } from "./emails/verification";
export { sendVerificationEmail } from "./emails/verification";
export type { SendEmailParams } from "./lib/client";
export { sendEmail } from "./lib/client";
