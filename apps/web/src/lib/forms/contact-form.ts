import { formOptions } from "@tanstack/react-form";
import { z } from "zod";
import { EMAIL_STATUSES, SMS_STATUSES } from "@/lib/contacts";

/**
 * Schema for the create/edit contact dialog.
 *
 * `email` accepts the empty string because a contact may be reachable by
 * phone alone. The real "email or phone is required" rule is enforced by the
 * dialog at submit time, where it can also gate the submit button.
 *
 * The status enums are derived from the shared constants rather than
 * re-listed, so a new status can never be rejected by the form after it is
 * accepted by the database.
 */
export const contactFormSchema = z.object({
  email: z.string().email("Enter a valid email address").or(z.literal("")),
  phone: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  company: z.string(),
  jobTitle: z.string(),
  emailStatus: z.enum(EMAIL_STATUSES),
  smsStatus: z.enum(SMS_STATUSES),
});

export type ContactFormInput = z.infer<typeof contactFormSchema>;

/** The blank slate a create-mode dialog opens on, and the reset target. */
export const emptyContactFormValues: ContactFormInput = {
  email: "",
  phone: "",
  firstName: "",
  lastName: "",
  company: "",
  jobTitle: "",
  emailStatus: "active",
  smsStatus: "pending_consent",
};

export const contactFormOpts = formOptions({
  defaultValues: emptyContactFormValues,
});
