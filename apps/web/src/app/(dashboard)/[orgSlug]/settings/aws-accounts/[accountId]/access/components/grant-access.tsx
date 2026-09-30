"use client";

import type { member, user } from "@wraps/db";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
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
    <Card>
      <CardHeader>
        <CardTitle>Grant Access</CardTitle>
        <CardDescription>
          Give team members access to this AWS account with specific permission
          levels.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <GrantAccessForm
          awsAccountId={awsAccountId}
          members={members}
          organizationId={organizationId}
        />
      </CardContent>
    </Card>
  );
}
