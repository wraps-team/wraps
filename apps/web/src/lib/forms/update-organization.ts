import { z } from "zod";

export const updateOrganizationSchema = z.object({
  name: z
    .string()
    .min(2, "Organization name must be at least 2 characters")
    .max(50, "Organization name must be less than 50 characters")
    .regex(
      /^[a-zA-Z0-9\s-]+$/,
      "Organization name can only contain letters, numbers, spaces, and hyphens"
    )
    .optional(),
  slug: z
    .string()
    .min(2, "Slug must be at least 2 characters")
    .max(50, "Slug must be less than 50 characters")
    .regex(
      /^[a-z0-9-]+$/,
      "Slug can only contain lowercase letters, numbers, and hyphens"
    )
    .regex(/^[a-z]/, "Slug must start with a letter")
    .regex(/[a-z0-9]$/, "Slug must end with a letter or number")
    .optional(),
  logo: z
    .string()
    .url("Logo must be a valid URL")
    .nullable()
    .optional()
    .or(z.literal("")),
});

export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
