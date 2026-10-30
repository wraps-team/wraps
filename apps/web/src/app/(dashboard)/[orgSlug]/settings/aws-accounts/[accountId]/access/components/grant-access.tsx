"use client";

import type { member, user } from "@wraps/db";
import { Panel, PanelTitle } from "@wraps/ui/components/ui/panel";
import type { InferSelectModel } from "drizzle-orm";
import { GrantAccessForm } from "@/components/forms/grant-access-form";

type MemberWithUser = InferSelectModel<typeof member> & {
  user: InferSelectModel<typeof user>;
};

type GrantAccessCardProps = {
  awsAccountId: string;
  members: MemberWithUser[];
  organizationId: string;
};

export function GrantAccessCard({
  awsAccountId,
  members,
  organizationId,
}: GrantAccessCardProps) {
  return (
    <Panel
      description="Give team members access to this AWS account with specific permission levels."
      label={<PanelTitle>Grant Access</PanelTitle>}
    >
      <GrantAccessForm
        awsAccountId={awsAccountId}
        members={members}
        organizationId={organizationId}
      />
    </Panel>
  );
}
