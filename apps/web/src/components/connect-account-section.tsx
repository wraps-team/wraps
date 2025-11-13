"use client";

import { ConnectAWSAccountForm } from "@/components/forms/connect-aws-account-form";

interface ConnectAccountSectionProps {
  organizationId: string;
}

export function ConnectAccountSection({
  organizationId,
}: ConnectAccountSectionProps) {
  return (
    <div className="px-4 lg:px-6" id="connect-account">
      <h2 className="mb-4 font-semibold text-xl">Connect New Account</h2>
      <ConnectAWSAccountForm
        onSuccess={() => {
          // Refresh the page to show the new account
          window.location.reload();
        }}
        organizationId={organizationId}
      />
    </div>
  );
}
