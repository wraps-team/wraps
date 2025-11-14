import { formOptions } from "@tanstack/react-form";
import { z } from "zod";

// Schema for updating account information
export const updateAccountSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address"),
});

export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;

// Form options for account update
export const updateAccountFormOpts = formOptions({
  defaultValues: {
    firstName: "",
    lastName: "",
    email: "",
  } satisfies UpdateAccountInput,
});

// Schema for changing password
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// Form options for password change
export const changePasswordFormOpts = formOptions({
  defaultValues: {
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  } satisfies ChangePasswordInput,
});
