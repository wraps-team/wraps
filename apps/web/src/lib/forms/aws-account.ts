import { z } from "zod";

export const renameAwsAccountSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(64, "Name must be 64 characters or fewer"),
});

export type RenameAwsAccountInput = z.infer<typeof renameAwsAccountSchema>;
