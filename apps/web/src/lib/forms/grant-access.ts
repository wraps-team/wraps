import { formOptions } from "@tanstack/react-form/nextjs";
import { z } from "zod";

export const grantAccessSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
  awsAccountId: z.string().uuid("Invalid AWS account ID"),
  permissions: z.enum(["READ_ONLY", "FULL_ACCESS", "ADMIN"], {
    message: "Invalid permission level",
  }),
  expiresAt: z.string().datetime().optional(),
});

export type GrantAccessInput = z.infer<typeof grantAccessSchema>;

export const grantAccessFormOpts = formOptions({
  defaultValues: {
    userId: "",
    awsAccountId: "",
    permissions: "READ_ONLY" as const,
    expiresAt: undefined,
  } satisfies GrantAccessInput,
});
