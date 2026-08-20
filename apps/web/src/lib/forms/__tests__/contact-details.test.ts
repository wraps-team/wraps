import { describe, expect, it } from "vitest";
import { EMAIL_STATUSES, SMS_STATUSES } from "@/lib/contacts";
import {
  contactDetailsFormOpts,
  contactDetailsSchema,
} from "../contact-details";

/**
 * The status enums here must stay in step with `lib/contacts.ts`, which is the
 * list the details sheet renders its Selects from.
 *
 * They were hand-written and drifted: `emailStatus` omitted "suppressed", so a
 * suppressed contact seeded the form with a value its own schema rejected — the
 * form failed validation the moment the sheet opened, and "Suppressed" could
 * not be picked from the dropdown at all. A contact could be suppressed by a
 * bounce webhook and then be uneditable in the UI.
 *
 * These cases fail on drift in either direction, so adding a sixth status to
 * the constant without widening the schema is caught here rather than by a
 * customer.
 */
describe("contactDetailsSchema status enums", () => {
  const base = contactDetailsFormOpts.defaultValues;

  it.each(EMAIL_STATUSES)("accepts the '%s' email status", (status) => {
    const result = contactDetailsSchema.safeParse({
      ...base,
      emailStatus: status,
    });
    expect(result.success).toBe(true);
  });

  it.each(SMS_STATUSES)("accepts the '%s' sms status", (status) => {
    const result = contactDetailsSchema.safeParse({
      ...base,
      smsStatus: status,
    });
    expect(result.success).toBe(true);
  });

  it("covers exactly the statuses the sheet can render, no more", () => {
    const shape = contactDetailsSchema.shape;

    expect([...shape.emailStatus.options].sort()).toEqual(
      [...EMAIL_STATUSES].sort()
    );
    expect([...shape.smsStatus.options].sort()).toEqual(
      [...SMS_STATUSES].sort()
    );
  });

  it("still rejects a status that is not in the canonical list", () => {
    expect(
      contactDetailsSchema.safeParse({ ...base, emailStatus: "archived" })
        .success
    ).toBe(false);
  });

  it("keeps the default values parseable", () => {
    expect(contactDetailsSchema.safeParse(base).success).toBe(true);
  });
});
