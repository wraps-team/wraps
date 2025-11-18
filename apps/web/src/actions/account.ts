"use server";

import {
  createServerValidate,
  type ServerValidateError,
} from "@tanstack/react-form/nextjs";
import { auth } from "@wraps/auth";
import { db } from "@wraps/db";
import { user } from "@wraps/db/schema/auth";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  type ChangePasswordInput,
  changePasswordFormOpts,
  changePasswordSchema,
  type UpdateAccountInput,
  updateAccountFormOpts,
  updateAccountSchema,
} from "@/lib/forms/update-account";

// Server validator for account update
const serverValidateAccount = createServerValidate({
  ...updateAccountFormOpts,
  onServerValidate: ({ value }) => {
    // Parse with Zod
    const result = updateAccountSchema.safeParse(value);
    if (!result.success) {
      return result.error.issues[0]?.message || "Validation failed";
    }
  },
});

// Server validator for password change
const serverValidatePassword = createServerValidate({
  ...changePasswordFormOpts,
  onServerValidate: ({ value }) => {
    // Parse with Zod
    const result = changePasswordSchema.safeParse(value);
    if (!result.success) {
      return result.error.issues[0]?.message || "Validation failed";
    }
  },
});

export type UpdateAccountResult =
  | {
      success: true;
      message: string;
    }
  | {
      success: false;
      error: string;
    };

export async function updateAccountAction(
  _prev: unknown,
  formData: FormData
): Promise<
  UpdateAccountResult | ServerValidateError<UpdateAccountInput, undefined>
> {
  try {
    // Validate form data
    const validatedData = await serverValidateAccount(formData);

    // Get current user session
    const session = await auth.api.getSession({
      headers: await import("next/headers").then((mod) => mod.headers()),
    });

    if (!session?.user) {
      return {
        success: false,
        error: "You must be logged in to update your account",
      };
    }

    // Check if email is being changed and if it's already in use
    if (validatedData.email !== session.user.email) {
      const existingUser = await db.query.user.findFirst({
        where: (users, { eq: eqOp }) => eqOp(users.email, validatedData.email),
      });

      if (existingUser) {
        return {
          success: false,
          error: "This email address is already in use",
        };
      }
    }

    // Update user in database
    await db
      .update(user)
      .set({
        name: `${validatedData.firstName} ${validatedData.lastName}`,
        email: validatedData.email,
      })
      .where(eq(user.id, session.user.id));

    // Revalidate paths
    revalidatePath("/settings/account");

    return {
      success: true,
      message: "Account updated successfully",
    };
  } catch (error) {
    // If it's a ServerValidateError, re-throw it
    if (error && typeof error === "object" && "formState" in error) {
      throw error;
    }

    console.error("Error updating account:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
}

export type ChangePasswordResult =
  | {
      success: true;
      message: string;
    }
  | {
      success: false;
      error: string;
    };

export async function changePasswordAction(
  _prev: unknown,
  formData: FormData
): Promise<
  ChangePasswordResult | ServerValidateError<ChangePasswordInput, undefined>
> {
  try {
    // Validate form data
    const validatedData = await serverValidatePassword(formData);

    // Get current user session
    const session = await auth.api.getSession({
      headers: await import("next/headers").then((mod) => mod.headers()),
    });

    if (!session?.user) {
      return {
        success: false,
        error: "You must be logged in to change your password",
      };
    }

    // Use better-auth to change password
    // Note: better-auth handles password verification and hashing
    const result = await auth.api.changePassword({
      body: {
        currentPassword: validatedData.currentPassword,
        newPassword: validatedData.newPassword,
      },
      headers: await import("next/headers").then((mod) => mod.headers()),
    });

    if (!result) {
      return {
        success: false,
        error: "Failed to change password. Please check your current password.",
      };
    }

    return {
      success: true,
      message: "Password changed successfully",
    };
  } catch (error) {
    // If it's a ServerValidateError, re-throw it
    if (error && typeof error === "object" && "formState" in error) {
      throw error;
    }

    console.error("Error changing password:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
}
