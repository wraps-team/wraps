import { formOptions } from "@tanstack/react-form/nextjs";
import { z } from "zod";

// Zod schema for validation
export const connectAWSAccountSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1, "Account name is required").max(255),
  accountId: z
    .string()
    .regex(/^\d{12}$/, "AWS Account ID must be exactly 12 digits"),
  region: z.string().min(1, "Region is required"),
  roleArn: z
    .string()
    .startsWith("arn:aws:iam::", "Must be a valid IAM role ARN"),
});

export type ConnectAWSAccountInput = z.infer<typeof connectAWSAccountSchema>;

// Form options for TanStack Form
export const connectAWSAccountFormOpts = formOptions({
  defaultValues: {
    organizationId: "",
    name: "",
    accountId: "",
    region: "us-east-1",
    roleArn: "",
  } satisfies ConnectAWSAccountInput,
});
