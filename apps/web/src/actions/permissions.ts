"use server";

import {
  createServerValidate,
  type ServerValidateError,
} from "@tanstack/react-form/nextjs";
import { auth } from "@wraps/auth";
import { db } from "@wraps/db";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import {
  grantAccessFormOpts,
  grantAccessSchema,
} from "@/lib/forms/grant-access";
import { checkAWSAccountAccess } from "@/lib/permissions/check-access";
import { grantAWSAccountAccess } from "@/lib/permissions/grant-access";
import { revokeAWSAccountAccess } from "@/lib/permissions/revoke-access";

// Create server validator for grant access
const serverValidateGrant = createServerValidate({
  ...grantAccessFormOpts,
  onServerValidate: ({ value }) => {
    const result = grantAccessSchema.safeParse(value);
    if (!result.success) {
      return result.error.issues[0]?.message || "Validation failed";
    }
  },
});

export type GrantAccessResult =
  | { success: true }
  | { error: string; details?: string };

export async function grantAccessAction(prev: unknown, formData: FormData) {
  try {
    // 1. Validate form data
    const validatedData = await serverValidateGrant(formData);

    // 2. Get session
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return { error: "Unauthorized" };
    }

    // 3. Get AWS account to check organization
    const awsAccountRecord = await db.query.awsAccount.findFirst({
      where: (a, { eq }) => eq(a.id, validatedData.awsAccountId),
    });

    if (!awsAccountRecord) {
      return { error: "AWS account not found" };
    }

    // 4. Check if user has manage permission on this account
    const access = await checkAWSAccountAccess({
      userId: session.user.id,
      organizationId: awsAccountRecord.organizationId,
      awsAccountId: validatedData.awsAccountId,
      permission: "manage",
    });

    if (!access.authorized) {
      return {
        error: "Access denied",
        details: access.reason,
      };
    }

    // 5. Verify target user is in the same organization
    const targetMembership = await db.query.member.findFirst({
      where: (m, { and, eq }) =>
        and(
          eq(m.userId, validatedData.userId),
          eq(m.organizationId, awsAccountRecord.organizationId)
        ),
    });

    if (!targetMembership) {
      return {
        error: "User not found in organization",
      };
    }

    // 6. Grant access
    await grantAWSAccountAccess({
      userId: validatedData.userId,
      awsAccountId: validatedData.awsAccountId,
      permissions: validatedData.permissions,
      grantedBy: session.user.id,
      expiresAt: validatedData.expiresAt
        ? new Date(validatedData.expiresAt)
        : undefined,
    });

    // 7. Revalidate
    revalidatePath("/dashboard");
    revalidatePath(
      `/dashboard/organizations/${awsAccountRecord.organizationId}`
    );

    return { success: true } as const;
  } catch (e) {
    // Handle TanStack Form validation errors
    if (
      e &&
      typeof e === "object" &&
      "formState" in e &&
      typeof (e as { formState?: unknown }).formState === "object"
    ) {
      return (
        e as ServerValidateError<
          typeof grantAccessFormOpts.defaultValues,
          unknown
        >
      ).formState;
    }

    // Handle other errors
    const message = e instanceof Error ? e.message : "Internal error";
    console.error("Error granting access:", e);
    return { error: "Internal error", details: message };
  }
}

export type RevokeAccessResult =
  | { success: true }
  | { error: string; details?: string };

export async function revokeAccessAction(
  userId: string,
  awsAccountId: string
): Promise<RevokeAccessResult> {
  try {
    // 1. Get session
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return { error: "Unauthorized" };
    }

    // 2. Get AWS account to check organization
    const awsAccountRecord = await db.query.awsAccount.findFirst({
      where: (a, { eq }) => eq(a.id, awsAccountId),
    });

    if (!awsAccountRecord) {
      return { error: "AWS account not found" };
    }

    // 3. Check if user has manage permission
    const access = await checkAWSAccountAccess({
      userId: session.user.id,
      organizationId: awsAccountRecord.organizationId,
      awsAccountId,
      permission: "manage",
    });

    if (!access.authorized) {
      return {
        error: "Access denied",
        details: access.reason,
      };
    }

    // 4. Revoke access
    await revokeAWSAccountAccess({
      userId,
      awsAccountId,
    });

    // 5. Revalidate
    revalidatePath("/dashboard");
    revalidatePath(
      `/dashboard/organizations/${awsAccountRecord.organizationId}`
    );

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    console.error("Error revoking access:", error);
    return { error: "Internal error", details: message };
  }
}
