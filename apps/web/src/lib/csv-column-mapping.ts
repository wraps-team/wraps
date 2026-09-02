/**
 * CSV Column Auto-Detection & Mapping
 *
 * Maps CSV headers to known contact fields using alias matching.
 * Unmapped columns default to 'property' (custom properties).
 */

export type ContactField =
  | "email"
  | "phone"
  | "firstName"
  | "lastName"
  | "company"
  | "jobTitle"
  | "createdAt"
  | "smsStatus"
  | "smsConsentedAt";

export type ColumnMapping = ContactField | "property" | "skip";

export const KNOWN_COLUMNS: Record<ContactField, string[]> = {
  email: ["email", "email_address", "e-mail", "mail", "email address"],
  phone: [
    "phone",
    "phone_number",
    "phone number",
    "mobile",
    "cell",
    "tel",
    "telephone",
  ],
  firstName: [
    "first_name",
    "firstname",
    "first name",
    "fname",
    "given_name",
    "given name",
  ],
  lastName: [
    "last_name",
    "lastname",
    "last name",
    "lname",
    "surname",
    "family_name",
    "family name",
  ],
  company: ["company", "company_name", "company name", "organization", "org"],
  jobTitle: ["job_title", "jobtitle", "job title", "title", "role", "position"],
  createdAt: [
    "created_at",
    "createdat",
    "created at",
    "created",
    "date_added",
    "date added",
    "signup_date",
    "signup date",
    "joined",
    "joined_at",
  ],
  smsStatus: [
    "sms_status",
    "smsstatus",
    "sms status",
    "sms_consent",
    "sms consent",
    "sms_opt_in",
    "sms opt in",
    "sms_optin",
    "smsoptin",
  ],
  smsConsentedAt: [
    "sms_consented_at",
    "smsconsentedat",
    "sms consented at",
    "sms_consent_date",
    "sms consent date",
    "consent_date",
    "consent date",
    "opt_in_date",
    "opt in date",
    "opted_in_at",
    "sms_opt_in_date",
  ],
};

/** Human-readable labels for display in the mapping UI */
export const FIELD_LABELS: Record<ContactField, string> = {
  email: "Email",
  phone: "Phone",
  firstName: "First Name",
  lastName: "Last Name",
  company: "Company",
  jobTitle: "Job Title",
  createdAt: "Created At",
  smsStatus: "SMS Status",
  smsConsentedAt: "SMS Consent Date",
};

/**
 * Auto-map CSV headers to contact fields.
 *
 * Rules:
 * - Normalized lowercase matching against aliases
 * - Each contact field can only be mapped once (first match wins)
 * - Unmapped columns default to 'property'
 */
export function autoMapColumns(
  csvHeaders: string[]
): Record<string, ColumnMapping> {
  const mapping: Record<string, ColumnMapping> = {};
  const usedFields = new Set<ContactField>();

  for (const header of csvHeaders) {
    const normalized = header.toLowerCase().trim();
    let matched = false;

    for (const [field, aliases] of Object.entries(KNOWN_COLUMNS) as [
      ContactField,
      string[],
    ][]) {
      if (usedFields.has(field)) {
        continue;
      }

      if (aliases.includes(normalized)) {
        mapping[header] = field;
        usedFields.add(field);
        matched = true;
        break;
      }
    }

    if (!matched) {
      mapping[header] = "property";
    }
  }

  return mapping;
}
