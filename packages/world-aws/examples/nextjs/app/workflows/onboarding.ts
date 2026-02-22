"use workflow";

import { step } from "workflow";

export default async function onboarding(email: string) {
  const account = await step("create-account", async () => {
    // Create user account in your database
    return { userId: `user_${Date.now()}`, email };
  });

  await step("send-welcome-email", async () => {
    // Send welcome email via your email provider
    console.log(`Sending welcome email to ${account.email}`);
    return { sent: true };
  });

  await step("schedule-follow-up", async () => {
    // Schedule a follow-up email for 3 days later
    console.log(`Scheduling follow-up for ${account.userId}`);
    return { scheduledAt: new Date(Date.now() + 3 * 86_400_000).toISOString() };
  });

  return { userId: account.userId, onboarded: true };
}
