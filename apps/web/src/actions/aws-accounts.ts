"use server";

import { createServerValidate } from "@tanstack/react-form/nextjs";
import { auth } from "@wraps/auth";
import { awsAccount, db } from "@wraps/db";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { assumeRole } from "@/lib/aws/assume-role";
import {
  connectAWSAccountFormOpts,
  connectAWSAccountSchema,
} from "@/lib/forms/connect-aws-account";
import { grantAWSAccountAccess } from "@/lib/permissions/grant-access";

// Create server validator
const serverValidate = createServerValidate({
  ...connectAWSAccountFormOpts,
  onServerValidate: ({ value }) => {
    // Additional server-side validation
    const result = connectAWSAccountSchema.safeParse(value);
    if (!result.success) {
      return result.error.issues[0]?.message || "Validation failed";
    }
  },
});

export type ConnectAWSAccountResult =
  | {
      success: true;
      account: { id: string; name: string; region: string };
    }
  | { error: string; details?: string };

export async function connectAWSAccountAction(
  _prev: unknown,
  formData: FormData
) {
  try {
    // 1. Validate form data
    const validatedData = await serverValidate(formData);

    // 2. Get session
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return { error: "Unauthorized" };
    }

    // 3. Check org membership
    const membership = await db.query.member.findFirst({
      where: (m, { and, eq }) =>
        and(
          eq(m.userId, session.user.id),
          eq(m.organizationId, validatedData.organizationId)
        ),
    });

    if (!(membership && ["owner", "admin"].includes(membership.role))) {
      return { error: "Insufficient permissions" };
    }

    // 4. Use the external ID provided from the form (generated on client and used in CloudFormation)
    const externalId = validatedData.externalId;

    // 5. Test connection by attempting to assume role
    try {
      await assumeRole({
        roleArn: validatedData.roleArn,
        externalId,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        error: "Unable to assume role",
        details: message,
      };
    }

    // 6. Save to database
    const [account] = await db
      .insert(awsAccount)
      .values({
        organizationId: validatedData.organizationId,
        name: validatedData.name,
        accountId: validatedData.accountId,
        region: validatedData.region,
        roleArn: validatedData.roleArn,
        externalId,
        isVerified: true,
        lastVerifiedAt: new Date(),
        createdBy: session.user.id,
      })
      .returning();

    if (!account) {
      return { error: "Failed to create AWS account record" };
    }

    // 7. Grant default access to all org members (except owners)
    const allMembers = await db.query.member.findMany({
      where: (m, { eq }) => eq(m.organizationId, validatedData.organizationId),
    });

    for (const orgMember of allMembers) {
      if (orgMember.role === "owner") {
        continue;
      }

      const permissions =
        orgMember.role === "admin" ? "FULL_ACCESS" : "READ_ONLY";

      await grantAWSAccountAccess({
        userId: orgMember.userId,
        awsAccountId: account.id,
        permissions,
        grantedBy: session.user.id,
      });
    }

    // 8. Revalidate dashboard
    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/organizations/${validatedData.organizationId}`);

    return {
      success: true,
      account: {
        id: account.id,
        name: account.name,
        region: account.region,
      },
    } as const;
  } catch (e) {
    // Handle TanStack Form validation errors
    if (
      e &&
      typeof e === "object" &&
      "formState" in e &&
      typeof (e as { formState?: unknown }).formState === "object"
    ) {
      return (e as { formState: unknown }).formState;
    }

    // Handle other errors
    const message = e instanceof Error ? e.message : "Internal error";
    console.error("Error connecting AWS account:", e);
    return { error: "Internal error", details: message };
  }
}
