import { formOptions } from "@tanstack/react-form";
import { z } from "zod";
import { EMAIL_STATUSES, SMS_STATUSES } from "@/lib/contacts";

// Schema for updating contact details
//
// Derived from EMAIL_STATUSES/SMS_STATUSES rather than re-listed. The email
// enum was written out by hand and lost "suppressed", which the constant has
// carried the whole time: the details sheet renders its Select from the
// constant, so a suppressed contact seeded a value its own schema rejected -
// the form failed validation on open, and "Suppressed" could never be chosen
// from the dropdown at all. Deriving keeps a fifth status from being added in
// one place and forgotten in the other.
export const contactDetailsSchema = z.object({
  email: z.string().email("Invalid email address").or(z.literal("")),
  phone: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  company: z.string(),
  jobTitle: z.string(),
  emailStatus: z.enum(EMAIL_STATUSES),
  smsStatus: z.enum(SMS_STATUSES),
});

export type ContactDetailsInput = z.infer<typeof contactDetailsSchema>;

// Form options for contact details
export const contactDetailsFormOpts = formOptions({
  defaultValues: {
    email: "",
    phone: "",
    firstName: "",
    lastName: "",
    company: "",
    jobTitle: "",
    emailStatus: "active",
    smsStatus: "pending_consent",
  } satisfies ContactDetailsInput,
});
